import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { EMBEDDING_MODEL, EmbeddingService } from './embedding.service.js';
import { createEmbeddingModels, createLanguageModel } from './llm.providers.js';
import { LANGUAGE_MODEL, LlmService } from './llm.service.js';
import {
  EMBEDDING_RATE_LIMITER,
  LLM_RATE_LIMITER,
  SlidingWindowLimiter,
} from './rate-limiter.js';

const providerEnv = (config: ConfigService<Env, true>) => ({
  LLM_PROVIDER: config.get('LLM_PROVIDER', { infer: true }),
  GOOGLE_GENERATIVE_AI_API_KEY: config.get('GOOGLE_GENERATIVE_AI_API_KEY', {
    infer: true,
  }),
  LLM_MODEL: config.get('LLM_MODEL', { infer: true }),
  EMBEDDING_MODEL: config.get('EMBEDDING_MODEL', { infer: true }),
  LLM_THINKING_LEVEL: config.get('LLM_THINKING_LEVEL', { infer: true }),
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
    // Uno por modelo y por proceso: todas las llamadas comparten la ventana
    {
      provide: LLM_RATE_LIMITER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new SlidingWindowLimiter(config.get('LLM_RPM', { infer: true })),
    },
    {
      provide: EMBEDDING_RATE_LIMITER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new SlidingWindowLimiter(config.get('EMBEDDING_RPM', { infer: true })),
    },
    LlmService,
    EmbeddingService,
  ],
  exports: [LlmService, EmbeddingService],
})
export class LlmModule {}
