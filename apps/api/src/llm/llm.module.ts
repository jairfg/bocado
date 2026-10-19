import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { EMBEDDING_MODEL, EmbeddingService } from './embedding.service.js';
import { createEmbeddingModels, createLanguageModel } from './llm.providers.js';
import { LANGUAGE_MODEL, LlmService } from './llm.service.js';

const providerEnv = (config: ConfigService<Env, true>) => ({
  GOOGLE_GENERATIVE_AI_API_KEY: config.get('GOOGLE_GENERATIVE_AI_API_KEY', {
    infer: true,
  }),
  LLM_MODEL: config.get('LLM_MODEL', { infer: true }),
  EMBEDDING_MODEL: config.get('EMBEDDING_MODEL', { infer: true }),
});

// Las fábricas leen la configuración validada y delegan en llm.providers,
// el único lugar que conoce al proveedor.
@Module({
  providers: [
    {
      provide: LANGUAGE_MODEL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createLanguageModel(providerEnv(config)),
    },
    {
      provide: EMBEDDING_MODEL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createEmbeddingModels(providerEnv(config)),
    },
    LlmService,
    EmbeddingService,
  ],
  exports: [LlmService, EmbeddingService],
})
export class LlmModule {}
