import { Inject, Injectable, Logger } from '@nestjs/common';
import { embedMany, type EmbeddingModel } from 'ai';
import { currentRun } from '../common/run-context.js';
import { EMBEDDING_DIMENSIONS, type EmbeddingModels } from './llm.providers.js';
import { providerHttpException } from './provider-errors.js';
import {
  EMBEDDING_RATE_LIMITER,
  SlidingWindowLimiter,
  UNLIMITED,
} from './rate-limiter.js';

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
    // null con LLM_PROVIDER=mock: no hay embeddings y la búsqueda usa solo
    // el ranking de texto
    @Inject(EMBEDDING_MODEL) private readonly models: EmbeddingModels | null,
    // Cuenta textos, no solicitudes: así cuenta Google la cuota
    @Inject(EMBEDDING_RATE_LIMITER)
    private readonly limiter: SlidingWindowLimiter = UNLIMITED,
  ) {}

  get available(): boolean {
    return this.models !== null;
  }

  get modelId(): string {
    return this.requireModels().modelId;
  }

  // Textos que se guardan en la base (alimentos)
  embedDocuments(texts: readonly string[]): Promise<number[][]> {
    return this.embed(this.requireModels().document, texts);
  }

  // Textos que se buscan
  embedQueries(texts: readonly string[]): Promise<number[][]> {
    return this.embed(this.requireModels().query, texts);
  }

  private requireModels(): EmbeddingModels {
    if (!this.models) {
      throw new Error('No hay modelo de embeddings con LLM_PROVIDER=mock');
    }
    return this.models;
  }

  // Todos los textos van en una sola llamada a embedMany: Google acepta
  // hasta 100 por solicitud (:batchEmbedContents).
  private async embed(
    model: EmbeddingModel,
    values: readonly string[],
  ): Promise<number[][]> {
    if (values.length === 0) return [];

    await this.limiter.acquire(values.length);
    const { signal } = currentRun();
    let embeddings: number[][];
    try {
      ({ embeddings } = await embedMany({
        model,
        values: [...values],
        // Igual que con el LLM: sin reintentos automáticos que gasten cuota
        maxRetries: 0,
        maxParallelCalls: 1,
        abortSignal: signal,
      }));
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
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
