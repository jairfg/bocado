import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);

  if (!result.success) {
    console.error(
      `Variables de entorno inválidas:\n${z.prettifyError(result.error)}`,
    );
    throw new Error('Configuración de entorno inválida, revisa apps/api/.env');
  }

  return result.data;
}
