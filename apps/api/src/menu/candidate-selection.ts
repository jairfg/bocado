import { createHash } from 'node:crypto';
import type { FoodCategory, MenuRequest } from '@bocado/shared';
import { normalizeText } from '../common/normalize-text.js';

export type CandidateFood = {
  id: number;
  name: string;
  category: string;
  isAlcoholic: boolean;
  kcalPer100g: number;
  proteinGPer100g: number;
  carbsGPer100g: number;
  fatGPer100g: number;
};

// No sirven para armar comidas:
// - miscellaneous: especias, hierbas secas, sal, vinagres y salsas.
// - beverages: refrescos, jugos, café, té, bebidas en polvo y suplementos
//   (proteína whey o de soya en polvo, batidos sustitutos de comida).
// - sugars_sweets: azúcar, caramelos, jarabes, mermeladas y helados.
export const EXCLUDED_CATEGORIES = [
  'miscellaneous',
  'beverages',
  'sugars_sweets',
] as const satisfies readonly FoodCategory[];

type MealCategory = Exclude<FoodCategory, (typeof EXCLUDED_CATEGORIES)[number]>;

// 60 candidatos. `satisfies` obliga a asignar cuota a cada categoría nueva
// que no esté excluida.
export const CATEGORY_QUOTAS = {
  meats: 7,
  fish_seafood: 5,
  eggs: 3,
  dairy: 6,
  legumes: 6,
  cereals: 9,
  tubers_roots: 4,
  vegetables: 10,
  fruits: 6,
  nuts_seeds: 2,
  fats_oils: 2,
} as const satisfies Record<MealCategory, number>;

// En estas categorías el alimento se sirve cocido: la versión cruda o seca
// tiene otros nutrientes por 100 g (100 g de lentejas crudas no son 100 g
// de lentejas en el plato). "Calor seco" es un método de cocción.
const SERVED_COOKED = new Set<string>([
  'meats',
  'fish_seafood',
  'eggs',
  'legumes',
  'cereals',
  'tubers_roots',
]);
const UNCOOKED_NAME =
  /\b(crud[oa]s?|sin cocinar|sin preparar)\b|(?<!calor )\bsec[oa]s?\b/;

// Ingredientes que no son un plato, y vísceras.
const NOT_A_DISH_NAME =
  /\b(harinas?|en polvo|deshidratad[oa]s?|liofilizad[oa]s?|higado|corazon|rinon(es)?|lengua|sesos|bazo|pancreas|pulmon(es)?|molleja|menudencias|piel|patas?|sebo)\b/;

function isEligible(food: CandidateFood): boolean {
  if (food.isAlcoholic || !Object.hasOwn(CATEGORY_QUOTAS, food.category)) {
    return false;
  }
  const name = normalizeText(food.name);
  if (NOT_A_DISH_NAME.test(name)) return false;
  return !(SERVED_COOKED.has(food.category) && UNCOOKED_NAME.test(name));
}

// Generador pseudoaleatorio mulberry32: la misma semilla da siempre la
// misma secuencia, a diferencia de Math.random().
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Semilla a partir del request normalizado: el orden de las comidas
// no cambia los candidatos.
export function requestSeed(req: MenuRequest): number {
  const canonical = JSON.stringify([
    req.kcal,
    req.macros.proteinPct,
    req.macros.carbsPct,
    req.macros.fatPct,
    [...req.meals].sort(),
    req.restrictions?.trim() ?? '',
  ]);
  return createHash('sha256').update(canonical).digest().readUInt32BE(0);
}

// Sin IA: filtra los elegibles y toma una muestra por categoría con un
// barajado de Fisher-Yates sembrado. Ordenar por id antes de barajar hace
// que el resultado no dependa del orden en que llegan de la base.
export function selectCandidates(
  foods: readonly CandidateFood[],
  seed: number,
): CandidateFood[] {
  const random = mulberry32(seed);
  const eligible = foods.filter(isEligible).sort((a, b) => a.id - b.id);

  return Object.entries(CATEGORY_QUOTAS).flatMap(([category, quota]) => {
    const pool = eligible.filter((food) => food.category === category);
    const take = Math.min(quota, pool.length);
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool
      .slice(0, take)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });
}
