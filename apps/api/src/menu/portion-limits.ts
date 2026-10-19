import type { FoodCategory } from '@bocado/shared';
import { normalizeText } from '../common/normalize-text.js';

export type PortionLimits = { minG: number; maxG: number };

// Todas las constantes de porciones viven aquí.

// Gramos siempre múltiplos de 5, entre 5 y 800
export const GRAM_STEP = 5;
export const ABSOLUTE_LIMITS: PortionLimits = { minG: 5, maxG: 800 };

// Con porción de referencia (servingSizeG): de un cuarto a 2.5 porciones
export const SERVING_MIN_FRACTION = 0.25;
export const SERVING_MAX_MULTIPLIER = 2.5;

// Por categoría, con dos usos:
// 1. Sin servingSizeG: son los límites del alimento.
// 2. Con servingSizeG: el máximo es un techo y el mínimo, un tope para el
//    mínimo. Algunas porciones de USDA son la pieza entera (pierna de pavo
//    de 816 g, lata de salmón de 411 g): 2.5 veces eso no es realista.
// Bebidas, especias y dulces no llegan a los menús; se incluyen para que
// la tabla cubra todas las categorías.
export const CATEGORY_LIMITS: Record<FoodCategory, PortionLimits> = {
  meats: { minG: 50, maxG: 200 },
  fish_seafood: { minG: 50, maxG: 200 },
  eggs: { minG: 25, maxG: 150 },
  dairy: { minG: 15, maxG: 300 },
  legumes: { minG: 30, maxG: 300 },
  cereals: { minG: 30, maxG: 350 },
  tubers_roots: { minG: 50, maxG: 350 },
  vegetables: { minG: 30, maxG: 350 },
  fruits: { minG: 50, maxG: 350 },
  nuts_seeds: { minG: 10, maxG: 60 },
  fats_oils: { minG: 5, maxG: 30 },
  beverages: { minG: 100, maxG: 500 },
  sugars_sweets: { minG: 5, maxG: 60 },
  miscellaneous: { minG: 5, maxG: 15 },
};

// "dairy" mezcla leche y yogur (200-300 g) con quesos (30-60 g). Sin
// servingSizeG, los quesos usan estos límites; con porción no hace falta,
// porque la de un queso ya es pequeña (28 g).
export const CHEESE_LIMITS: PortionLimits = { minG: 10, maxG: 60 };
const CHEESE_NAME = /^queso\b(?!.*\b(cottage|ricotta|requeson)\b)/;

const ceilToStep = (grams: number) => Math.ceil(grams / GRAM_STEP) * GRAM_STEP;
const floorToStep = (grams: number) =>
  Math.floor(grams / GRAM_STEP) * GRAM_STEP;

export type PortionFood = {
  name: string;
  category: string;
  servingSizeG: number | null;
};

export function portionLimits(food: PortionFood): PortionLimits {
  const category = Object.hasOwn(CATEGORY_LIMITS, food.category)
    ? CATEGORY_LIMITS[food.category as FoodCategory]
    : ABSOLUTE_LIMITS;

  let limits: PortionLimits;
  if (food.servingSizeG !== null) {
    limits = {
      minG: Math.min(food.servingSizeG * SERVING_MIN_FRACTION, category.minG),
      maxG: Math.min(food.servingSizeG * SERVING_MAX_MULTIPLIER, category.maxG),
    };
  } else if (
    food.category === 'dairy' &&
    CHEESE_NAME.test(normalizeText(food.name))
  ) {
    limits = CHEESE_LIMITS;
  } else {
    limits = category;
  }

  // Múltiplos de 5 dentro de los límites absolutos
  const minG = Math.max(ABSOLUTE_LIMITS.minG, ceilToStep(limits.minG));
  const maxG = Math.min(ABSOLUTE_LIMITS.maxG, floorToStep(limits.maxG));
  return { minG, maxG: Math.max(minG, maxG) };
}
