import { createGoogle, type GoogleEmbeddingModelOptions } from '@ai-sdk/google';
import {
  defaultEmbeddingSettingsMiddleware,
  wrapEmbeddingModel,
  type EmbeddingModel,
  type LanguageModel,
} from 'ai';
import type { Env } from '../config/env.js';

// Único archivo que conoce al proveedor. Lo usan las fábricas de LlmModule
// y los scripts (que corren fuera de Nest): cambiar de proveedor es
// cambiar este archivo.

// Debe coincidir con la columna vector(768) de foods. Gemini Embedding
// devuelve 3072 dimensiones; el índice HNSW de pgvector admite hasta 2000,
// así que se pide una versión reducida con outputDimensionality.
export const EMBEDDING_DIMENSIONS = 768;

type ProviderEnv = Pick<
  Env,
  'GOOGLE_GENERATIVE_AI_API_KEY' | 'LLM_MODEL' | 'EMBEDDING_MODEL'
>;

// Dos vistas del mismo modelo: Gemini optimiza distinto el texto que se
// guarda (documento) y el que se busca (consulta).
export type EmbeddingModels = {
  modelId: string;
  document: EmbeddingModel;
  query: EmbeddingModel;
};

export function createLanguageModel(env: ProviderEnv): LanguageModel {
  const google = createGoogle({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  return google(env.LLM_MODEL);
}

export function createEmbeddingModels(env: ProviderEnv): EmbeddingModels {
  const google = createGoogle({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  const model = google.embedding(env.EMBEDDING_MODEL);

  const withTaskType = (
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
  ): EmbeddingModel =>
    wrapEmbeddingModel({
      model,
      middleware: defaultEmbeddingSettingsMiddleware({
        settings: {
          providerOptions: {
            google: {
              outputDimensionality: EMBEDDING_DIMENSIONS,
              taskType,
            } satisfies GoogleEmbeddingModelOptions,
          },
        },
      }),
    });

  return {
    modelId: env.EMBEDDING_MODEL,
    document: withTaskType('RETRIEVAL_DOCUMENT'),
    query: withTaskType('RETRIEVAL_QUERY'),
  };
}
