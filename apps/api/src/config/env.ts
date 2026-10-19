import { z } from 'zod';

// Una variable vacía (VAR=) cuenta como no definida, así toma su default
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    // Único origen al que CORS deja llamar a la API (la web)
    WEB_ORIGIN: optional(z.url().default('http://localhost:3000')),
    // "mock": respuestas deterministas sin red, para desarrollo local y
    // para el frontend sin gastar cuota
    LLM_PROVIDER: optional(z.enum(['google', 'mock']).default('google')),
    // Obligatoria solo con LLM_PROVIDER=google (ver superRefine)
    GOOGLE_GENERATIVE_AI_API_KEY: optional(z.string().min(1).optional()),
    LLM_MODEL: z.string().min(1),
    EMBEDDING_MODEL: z.string().min(1),
    // Cuánto razona el modelo antes de responder. El código hace la
    // aritmética, así que basta con poco.
    LLM_THINKING_LEVEL: optional(
      z.enum(['minimal', 'low', 'medium', 'high']).default('low'),
    ),
    // Límites por minuto del proveedor (plan gratuito de Gemini): llamadas
    // al LLM y textos embebidos
    LLM_RPM: optional(z.coerce.number().int().min(1).default(5)),
    EMBEDDING_RPM: optional(z.coerce.number().int().min(1).default(90)),
    // Menús que el worker procesa a la vez
    MENU_WORKER_CONCURRENCY: optional(
      z.coerce.number().int().min(1).max(20).default(1),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === 'google' && !env.GOOGLE_GENERATIVE_AI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_GENERATIVE_AI_API_KEY'],
        message: 'Obligatoria con LLM_PROVIDER=google',
      });
    }
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
