import { z } from 'zod';
import { MealSlotSchema } from './menu-request.js';

export const NutrientsSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
});

export type Nutrients = z.infer<typeof NutrientsSchema>;

export const MenuDraftItemSchema = z.object({
  foodId: z.int(),
  name: z.string(),
  grams: z.number(),
  ...NutrientsSchema.shape,
});

export type MenuDraftItem = z.infer<typeof MenuDraftItemSchema>;

export const MenuDraftMealSchema = z.object({
  slot: MealSlotSchema,
  target: NutrientsSchema,
  items: z.array(MenuDraftItemSchema),
  totals: NutrientsSchema,
  // (total − meta) / meta × 100, con las mismas claves que los nutrientes.
  // MenuRequestSchema garantiza metas mayores que 0.
  deviationPct: NutrientsSchema,
});

export type MenuDraftMeal = z.infer<typeof MenuDraftMealSchema>;

export const MenuDraftWarningSchema = z.object({
  code: z.enum([
    'unknown_food',
    'missing_meal',
    'unrequested_meal',
    'duplicate_meal',
  ]),
  message: z.string(),
  slot: MealSlotSchema.optional(),
  foodId: z.number().optional(),
});

export type MenuDraftWarning = z.infer<typeof MenuDraftWarningSchema>;

export const MenuDraftSchema = z.object({
  meals: z.array(MenuDraftMealSchema),
  totals: NutrientsSchema,
  warnings: z.array(MenuDraftWarningSchema),
  usage: z.object({
    // null = el proveedor no reportó el valor
    inputTokens: z.int().nullable(),
    outputTokens: z.int().nullable(),
    latencyMs: z.int(),
  }),
});

export type MenuDraft = z.infer<typeof MenuDraftSchema>;
