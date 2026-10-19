import { z } from 'zod';

// Alimentos de una comida que propone el modelo al revisarla. Los gramos son
// opcionales: el optimizador calcula los definitivos.
export const LlmMealRevisionSchema = z.object({
  items: z
    .array(
      z.object({
        foodId: z.int().min(1).describe('id de un alimento'),
        grams: z
          .number()
          .min(5)
          .max(800)
          .optional()
          .describe('gramos de partida; el optimizador los ajusta'),
      }),
    )
    .min(1)
    .max(8),
});

export type LlmMealRevision = z.infer<typeof LlmMealRevisionSchema>;
