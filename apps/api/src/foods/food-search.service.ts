import { Injectable } from '@nestjs/common';
import { toVectorLiteral } from '../common/pgvector.js';
import { EmbeddingService } from '../llm/embedding.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { findFoodSummaries, type FoodSummary } from './food-summary.js';
import { reciprocalRankFusion } from './rrf.js';
import {
  buildSearchWhere,
  toOrQuery,
  type SearchFilters,
} from './search-filters.js';

export type SearchMode = 'text' | 'semantic' | 'hybrid';

export type SearchRequest = {
  text: string;
  filters?: SearchFilters;
  limit: number;
};

// Cuántos resultados aporta cada ranking antes de fusionar
const RANKING_DEPTH = 50;

@Injectable()
export class FoodSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async search(text: string, limit: number): Promise<FoodSummary[]> {
    const [ids] = await this.searchMany([{ text, limit }]);
    return findFoodSummaries(this.prisma, ids);
  }

  // Todas las consultas se embeben en una sola solicitud.
  async searchMany(
    requests: readonly SearchRequest[],
    requested: SearchMode = 'hybrid',
  ): Promise<number[][]> {
    // Sin modelo de embeddings (LLM_PROVIDER=mock) queda solo el texto
    const mode = this.embeddings.available ? requested : 'text';
    const vectors =
      mode === 'text'
        ? []
        : await this.embeddings.embedQueries(requests.map((r) => r.text));
    return this.rankMany(requests, vectors, mode);
  }

  // Separado de searchMany para que la evaluación compare los tres modos
  // con los mismos vectores, sin volver a pagar los embeddings.
  rankMany(
    requests: readonly SearchRequest[],
    vectors: readonly number[][],
    mode: SearchMode,
  ): Promise<number[][]> {
    return Promise.all(
      requests.map(async (request, i) => {
        const where = buildSearchWhere(request.filters);
        const [semantic, text] = await Promise.all([
          mode === 'text' ? [] : this.semanticRanking(vectors[i], where),
          mode === 'semantic' ? [] : this.textRanking(request.text, where),
        ]);
        return reciprocalRankFusion([semantic, text])
          .slice(0, request.limit)
          .map((result) => result.id);
      }),
    );
  }

  // Similitud coseno con pgvector. Los alimentos sin embedding no entran
  // aquí, pero siguen apareciendo por el ranking de texto.
  private async semanticRanking(
    vector: readonly number[],
    where: Prisma.Sql,
  ): Promise<number[]> {
    const literal = toVectorLiteral(vector);
    const rows = await this.prisma.$transaction(async (tx) => {
      // Con filtros, HNSW por defecto revisa solo ef_search (40) vecinos y
      // puede devolver menos filas de las pedidas. El escaneo iterativo
      // (pgvector ≥ 0.8) sigue buscando hasta completar el LIMIT, en orden.
      await tx.$executeRaw`SET LOCAL hnsw.iterative_scan = strict_order`;
      // La consulta interna usa el índice (solo admite ORDER BY distancia);
      // la externa desempata por id para que el orden sea determinista.
      return tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM (
          SELECT id, embedding <=> ${literal}::vector AS distance
          FROM foods
          WHERE embedding IS NOT NULL AND ${where}
          ORDER BY embedding <=> ${literal}::vector
          LIMIT ${RANKING_DEPTH}
        ) nearest
        ORDER BY distance, id
      `;
    });
    return rows.map((row) => row.id);
  }

  // Texto completo en español: el diccionario spanish reduce las palabras a
  // su raíz ("huevos" y "huevo" coinciden) e ignora palabras vacías como
  // "con" o "de". unaccent a ambos lados para no depender de tildes.
  private async textRanking(
    text: string,
    where: Prisma.Sql,
  ): Promise<number[]> {
    const orQuery = toOrQuery(text);
    if (!orQuery) return [];

    const rows = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT id
      FROM foods, websearch_to_tsquery('spanish', ${orQuery}) AS query
      WHERE ${where}
        AND to_tsvector('spanish', unaccent(name)) @@ query
      ORDER BY ts_rank(to_tsvector('spanish', unaccent(name)), query) DESC, id
      LIMIT ${RANKING_DEPTH}
    `;
    return rows.map((row) => row.id);
  }
}
