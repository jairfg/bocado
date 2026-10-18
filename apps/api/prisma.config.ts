import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// El CLI de Prisma no lee .env por sí solo. Node 24 trae un lector nativo,
// así que no hace falta dotenv. En CI no hay .env y no se carga.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // env('DATABASE_URL') lanzaría un error si falta la variable, incluso en
    // `prisma generate`, que no se conecta a la base (es lo que corre en CI).
    url: process.env.DATABASE_URL ?? '',
  },
});
