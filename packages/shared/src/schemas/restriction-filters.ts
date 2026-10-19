import { z } from 'zod';
import { FoodCategorySchema } from './food.js';

const term = z.string().trim().min(2).max(40);

// Lo que el LLM extrae del texto libre de restricciones. El código lo
// traduce a filtros SQL: el modelo interpreta, no filtra.
export const RestrictionFiltersSchema = z.object({
  vegetarian: z.boolean().describe('no come carne, aves ni pescado'),
  pescatarian: z
    .boolean()
    .describe('no come carne ni aves, pero sí pescados y mariscos'),
  excludeCategories: z
    .array(FoodCategorySchema)
    .max(14)
    .describe('categorías completas que no come'),
  excludeTerms: z
    .array(term)
    .max(20)
    .describe(
      'alimentos o ingredientes a evitar, en singular, como aparecerían en el nombre de un alimento',
    ),
  preferTerms: z
    .array(term)
    .max(10)
    .describe('alimentos o ingredientes que prefiere'),
});

export type RestrictionFilters = z.infer<typeof RestrictionFiltersSchema>;

export const NO_RESTRICTIONS: RestrictionFilters = {
  vegetarian: false,
  pescatarian: false,
  excludeCategories: [],
  excludeTerms: [],
  preferTerms: [],
};
