import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().min(1),
  EMBEDDING_MODEL: z.string().min(1),
  // Cuánto razona el modelo antes de responder. El código hace la
  // aritmética, así que basta con poco. Vacía cuenta como no definida.
  LLM_THINKING_LEVEL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['minimal', 'low', 'medium', 'high']).default('low'),
  ),
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
