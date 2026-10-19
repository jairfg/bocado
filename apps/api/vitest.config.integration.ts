import { defineConfig } from 'vitest/config';

// Pruebas de integración: Redis real (cola, worker y eventos), con el
// modelo simulado y sin Postgres. En CI, Redis es un contenedor de servicio.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.integration-spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Se fijan antes de importar AppModule, que valida el entorno al cargar.
    // La base 1 de Redis aísla la cola de las pruebas de la de desarrollo.
    env: {
      LLM_PROVIDER: 'mock',
      LLM_MODEL: 'mock',
      EMBEDDING_MODEL: 'mock',
      LLM_RPM: '1000',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6380/1',
      // No se conecta: PrismaService se reemplaza en las pruebas
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://unused:unused@localhost/unused',
    },
  },
});
