import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  // Solo la web configurada puede llamar a la API desde el navegador
  // (incluido el SSE con EventSource)
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }) });
  // Ante SIGTERM/SIGINT, cierra el worker esperando el job en curso, en vez
  // de cortarlo a la mitad
  app.enableShutdownHooks();
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
