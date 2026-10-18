import { z } from 'zod';
import { MealSlotSchema } from './menu-request.js';

// Lo que devuelve el modelo: solo elige alimentos y gramos. Los nutrientes
// los calcula el código desde la base, nunca el modelo.
export const LlmMenuSchema = z.object({
  meals: z
    .array(
      z.object({
        slot: MealSlotSchema,
        items: z
          .array(
            z.object({
              foodId: z
                .int()
                .min(1)
                .describe('id de un alimento de la lista de candidatos'),
              grams: z.number().min(5).max(800).describe('gramos del alimento'),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export type LlmMenu = z.infer<typeof LlmMenuSchema>;
