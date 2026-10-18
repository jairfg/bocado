import { z } from 'zod';
import { MealSlotSchema } from './menu-request.js';

export const MealTargetSchema = z.object({
  slot: MealSlotSchema,
  sharePct: z.number(),
  kcal: z.int(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
});

export type MealTarget = z.infer<typeof MealTargetSchema>;

export const MenuDistributionSchema = z.object({
  totals: z.object({
    kcal: z.int(),
    proteinG: z.number(),
    carbsG: z.number(),
    fatG: z.number(),
  }),
  meals: z.array(MealTargetSchema),
});

export type MenuDistribution = z.infer<typeof MenuDistributionSchema>;
