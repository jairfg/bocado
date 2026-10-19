import { z } from 'zod';
import { MealSlotSchema } from './menu-request.js';
import { RestrictionFiltersSchema } from './restriction-filters.js';

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

// ok: la propuesta del modelo ya estaba dentro de tolerancia (el optimizador
//     solo la afina).
// adjusted: entró en tolerancia gracias al optimizador.
// needs_revision: ni con el optimizador entra.
export const MealStatusSchema = z.enum(['ok', 'adjusted', 'needs_revision']);

export type MealStatus = z.infer<typeof MealStatusSchema>;

export const MenuDraftMealSchema = z.object({
  slot: MealSlotSchema,
  target: NutrientsSchema,
  items: z.array(MenuDraftItemSchema),
  totals: NutrientsSchema,
  // (total − meta) / meta × 100, con las mismas claves que los nutrientes.
  // MenuRequestSchema garantiza metas mayores que 0.
  deviationPct: NutrientsSchema,
  status: MealStatusSchema,
  // Veces que el LLM revisó esta comida con herramientas
  revisions: z.int(),
});

export type MenuDraftMeal = z.infer<typeof MenuDraftMealSchema>;

export const MenuDraftWarningSchema = z.object({
  code: z.enum([
    'unknown_food',
    'missing_meal',
    'unrequested_meal',
    'duplicate_meal',
    'portion_at_max',
    'revision_exhausted',
    'revision_failed',
  ]),
  message: z.string(),
  slot: MealSlotSchema.optional(),
  foodId: z.number().optional(),
});

export type MenuDraftWarning = z.infer<typeof MenuDraftWarningSchema>;

export const StageLatencySchema = z.object({
  restrictions: z.int(),
  candidates: z.int(),
  menu: z.int(),
  optimizer: z.int(),
  revision: z.int(),
  total: z.int(),
});

export type StageLatency = z.infer<typeof StageLatencySchema>;

export const MenuDraftSchema = z.object({
  meals: z.array(MenuDraftMealSchema),
  totals: NutrientsSchema,
  warnings: z.array(MenuDraftWarningSchema),
  // Para explicar el menú: cómo se interpretaron las restricciones y qué
  // alimentos se le ofrecieron al modelo en cada comida.
  restrictionFilters: RestrictionFiltersSchema,
  candidates: z.array(
    z.object({ slot: MealSlotSchema, foodIds: z.array(z.int()) }),
  ),
  usage: z.object({
    // Cada paso de un bucle con herramientas es una llamada
    llmCalls: z.int(),
    // Herramientas ejecutadas (búsquedas y evaluaciones)
    toolSteps: z.int(),
    // Suma de todas las llamadas; null = el proveedor no reportó el valor
    inputTokens: z.int().nullable(),
    outputTokens: z.int().nullable(),
    latencyMs: StageLatencySchema,
  }),
});

export type MenuDraft = z.infer<typeof MenuDraftSchema>;
