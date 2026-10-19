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
import { createMockLanguageModel } from './mock-language-model.js';

// Único archivo que conoce al proveedor. Lo usan las fábricas de LlmModule
// y los scripts (que corren fuera de Nest): cambiar de proveedor es
// cambiar este archivo.

// Debe coincidir con la columna vector(768) de foods. Gemini Embedding
// devuelve 3072 dimensiones; el índice HNSW de pgvector admite hasta 2000,
// así que se pide una versión reducida con outputDimensionality.
export const EMBEDDING_DIMENSIONS = 768;

type ProviderEnv = Pick<
  Env,
  | 'LLM_PROVIDER'
  | 'GOOGLE_GENERATIVE_AI_API_KEY'
  | 'LLM_MODEL'
  | 'EMBEDDING_MODEL'
  | 'LLM_THINKING_LEVEL'
>;

// env.ts exige la key con LLM_PROVIDER=google
const googleProvider = (env: ProviderEnv) =>
  createGoogle({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });

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
  if (env.LLM_PROVIDER === 'mock') return createMockLanguageModel();
  const google = googleProvider(env);
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

// null con el proveedor simulado: sin embeddings, la búsqueda usa solo el
// ranking de texto
export function createEmbeddingModels(
  env: ProviderEnv,
): EmbeddingModels | null {
  if (env.LLM_PROVIDER === 'mock') return null;
  const google = googleProvider(env);
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
