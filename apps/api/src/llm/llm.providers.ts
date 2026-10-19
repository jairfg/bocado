import {
  createGoogle,
  type GoogleEmbeddingModelOptions,
  type GoogleLanguageModelOptions,
} from '@ai-sdk/google';
import {
  defaultEmbeddingSettingsMiddleware,
  defaultSettingsMiddleware,
  wrapEmbeddingModel,
  wrapLanguageModel,
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
  | 'GOOGLE_GENERATIVE_AI_API_KEY'
  | 'LLM_MODEL'
  | 'EMBEDDING_MODEL'
  | 'LLM_THINKING_LEVEL'
>;

// Dos vistas del mismo modelo: Gemini optimiza distinto el texto que se
// guarda (documento) y el que se busca (consulta).
export type EmbeddingModels = {
  modelId: string;
  document: EmbeddingModel;
  query: EmbeddingModel;
};

// Gemini 3 controla el razonamiento con thinkingConfig.thinkingLevel (la
// documentación del proveedor reserva thinkingBudget para Gemini 2.5). Se
// fija aquí como ajuste por defecto para no repetirlo en cada llamada.
export function createLanguageModel(env: ProviderEnv): LanguageModel {
  const google = createGoogle({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  return wrapLanguageModel({
    model: google(env.LLM_MODEL),
    middleware: defaultSettingsMiddleware({
      settings: {
        providerOptions: {
          google: {
            thinkingConfig: { thinkingLevel: env.LLM_THINKING_LEVEL },
          } satisfies GoogleLanguageModelOptions,
        },
      },
    }),
  });
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
