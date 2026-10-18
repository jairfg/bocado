import { z } from 'zod';

export const MealSlotSchema = z.enum([
  'desayuno',
  'media_manana',
  'almuerzo',
  'merienda',
  'cena',
]);

export type MealSlot = z.infer<typeof MealSlotSchema>;

// Tolerancia para la suma de porcentajes: con decimales, JS puede dar
// 99.99999999999999 en lugar de 100 (ej. 10.1 + 64.1 + 25.8).
const MACROS_SUM_TOLERANCE = 1e-9;

export const MenuRequestSchema = z.object({
  kcal: z.int().min(1000).max(5000),
  macros: z
    .object({
      proteinPct: z.number().min(10).max(40),
      carbsPct: z.number().min(30).max(65),
      fatPct: z.number().min(15).max(40),
    })
    .refine(
      ({ proteinPct, carbsPct, fatPct }) =>
        Math.abs(proteinPct + carbsPct + fatPct - 100) < MACROS_SUM_TOLERANCE,
      { error: 'proteinPct + carbsPct + fatPct deben sumar 100' },
    ),
  meals: z.array(MealSlotSchema).min(1),
  restrictions: z.string().max(500).optional(),
});

export type MenuRequest = z.infer<typeof MenuRequestSchema>;
