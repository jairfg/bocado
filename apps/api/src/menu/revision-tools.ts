import {
  FoodCategorySchema,
  LlmMealRevisionSchema,
  type FoodCategory,
  type LlmMealRevision,
} from '@bocado/shared';
import { tool } from 'ai';
import { z } from 'zod';
import { EXCLUDED_CATEGORIES } from '../foods/search-filters.js';
import type { CandidateFood } from './candidate-selection.js';
import { per100g } from './nutrition.js';
import { portionLimits } from './portion-limits.js';

// Solo dos argumentos. Las restricciones, el alcohol y las categorías
// excluidas no son argumentos: los aplica siempre el código, así que el
// modelo no tiene cómo desactivarlos. z.object descarta cualquier otro
// campo que el modelo envíe.
export const SearchFoodsInputSchema = z.object({
  query: z.string().trim().min(2).max(100).describe('qué buscar, en español'),
  category: FoodCategorySchema.exclude([...EXCLUDED_CATEGORIES])
    .optional()
    .describe('limita la búsqueda a una categoría'),
});

export type RevisionToolDeps = {
  // Búsqueda con los filtros del request ya aplicados
  searchFoods: (
    query: string,
    category: FoodCategory | undefined,
  ) => Promise<CandidateFood[]>;
  // Valida los ids contra la base y corre el optimizador
  evaluateMeal: (items: LlmMealRevision['items']) => Promise<unknown>;
};

// Lo que el modelo necesita de cada alimento, compacto
export const describeForModel = (food: CandidateFood) => ({
  foodId: food.id,
  name: food.name,
  category: food.category,
  per100g: per100g(food),
  ...portionLimits(food),
});

export const ANSWER_TOOL = 'submitMeal';

export function buildRevisionTools(deps: RevisionToolDeps) {
  return {
    searchFoods: tool({
      description:
        'Busca alimentos de la base por significado y por texto. Devuelve id, nombre, categoría, nutrientes por 100 g y porción mínima y máxima en gramos.',
      inputSchema: SearchFoodsInputSchema,
      execute: async (input) => {
        // Se vuelve a validar aquí, por si se llama sin pasar por el SDK
        const { query, category } = SearchFoodsInputSchema.parse(input);
        const foods = await deps.searchFoods(query, category);
        return foods.map(describeForModel);
      },
    }),
    evaluateMeal: tool({
      description:
        'Prueba una combinación de alimentos: el optimizador calcula los gramos dentro de las porciones permitidas y devuelve totales, desvíos frente a la meta, si entra en tolerancia y qué problema queda. Los gramos que envíes son solo el punto de partida.',
      inputSchema: LlmMealRevisionSchema,
      execute: async (input) =>
        deps.evaluateMeal(LlmMealRevisionSchema.parse(input).items),
    }),
    // Sin execute: al llamarla, el bucle termina y sus argumentos son la
    // respuesta
    [ANSWER_TOOL]: tool({
      description:
        'Entrega la lista final de alimentos de la comida. Llámala una sola vez, al terminar.',
      inputSchema: LlmMealRevisionSchema,
    }),
  };
}
