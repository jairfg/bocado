import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createGoogle } from '@ai-sdk/google';
import type { Env } from '../config/env.js';
import { LANGUAGE_MODEL, LlmService } from './llm.service.js';

@Module({
  providers: [
    // Único lugar que conoce al proveedor: cambiar a otro es cambiar
    // esta fábrica.
    {
      provide: LANGUAGE_MODEL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const google = createGoogle({
          apiKey: config.get('GOOGLE_GENERATIVE_AI_API_KEY', { infer: true }),
        });
        return google(config.get('LLM_MODEL', { infer: true }));
      },
    },
    LlmService,
  ],
  exports: [LlmService],
})
export class LlmModule {}
