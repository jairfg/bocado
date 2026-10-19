import { Inject, Injectable, Logger } from '@nestjs/common';
import { embedMany, type EmbeddingModel } from 'ai';
import { EMBEDDING_DIMENSIONS, type EmbeddingModels } from './llm.providers.js';
import { providerHttpException } from './provider-errors.js';

export const EMBEDDING_MODEL = Symbol('EMBEDDING_MODEL');

// Gemini solo entrega normalizado el vector completo (3072); al reducirlo
// con outputDimensionality hay que normalizarlo. Con distancia coseno el
// ranking no cambia, pero con norma 1 el coseno es igual al producto
// interno y los valores guardados son comparables entre sí.
export function normalize(vector: readonly number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? [...vector] : vector.map((value) => value / norm);
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    @Inject(EMBEDDING_MODEL) private readonly models: EmbeddingModels,
  ) {}

  get modelId(): string {
    return this.models.modelId;
  }

  // Textos que se guardan en la base (alimentos)
  embedDocuments(texts: readonly string[]): Promise<number[][]> {
    return this.embed(this.models.document, texts);
  }

  // Textos que se buscan
  embedQueries(texts: readonly string[]): Promise<number[][]> {
    return this.embed(this.models.query, texts);
  }

  // Todos los textos van en una sola llamada a embedMany: Google acepta
  // hasta 100 por solicitud (:batchEmbedContents).
  private async embed(
    model: EmbeddingModel,
    values: readonly string[],
  ): Promise<number[][]> {
    if (values.length === 0) return [];

    let embeddings: number[][];
    try {
      ({ embeddings } = await embedMany({
        model,
        values: [...values],
        // Igual que con el LLM: sin reintentos automáticos que gasten cuota
        maxRetries: 0,
        maxParallelCalls: 1,
      }));
    } catch (error) {
      throw providerHttpException(error, this.logger);
    }

    return embeddings.map((embedding) => {
      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Se esperaban ${EMBEDDING_DIMENSIONS} dimensiones y llegaron ${embedding.length}`,
        );
      }
      return normalize(embedding);
    });
  }
}
