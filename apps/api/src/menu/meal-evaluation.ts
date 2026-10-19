import type {
  MealSlot,
  MealStatus,
  MenuDraftItem,
  Nutrients,
} from '@bocado/shared';
import type { CandidateFood } from './candidate-selection.js';
import {
  deviationPct,
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  nutrientsFor,
  per100g,
  sumNutrients,
} from './nutrition.js';
import {
  GRAM_STEP,
  portionLimits,
  type PortionLimits,
} from './portion-limits.js';
import { DEVIATION_WEIGHTS, optimizePortions } from './portion-optimizer.js';

// Desvío máximo aceptado por comida, como fracción de la meta
export const TOLERANCES: Nutrients = {
  kcal: 0.05,
  proteinG: 0.1,
  carbsG: 0.1,
  fatG: 0.1,
};

export type MealItem = MenuDraftItem & PortionLimits;

export type MealEvaluation = {
  items: MealItem[];
  totals: Nutrients;
  deviationPct: Nutrients;
  withinTolerance: boolean;
  // Error ponderado con los totales mostrados: sirve para elegir la mejor
  // versión de una comida
  score: number;
  // Explicación, en código, de por qué no entra en tolerancia
  problems: string[];
};

export type PlannedMeal = {
  slot: MealSlot;
  target: Nutrients;
  foods: CandidateFood[];
  evaluation: MealEvaluation;
  status: MealStatus;
  revisions: number;
};

const percent = (value: number) => Math.round(Math.abs(value) * 100);

// Por qué no entra, nutriente por nutriente. Primero mira si es imposible
// con estos alimentos (ni con todo al máximo o al mínimo); si no, el
// problema es de equilibrio entre nutrientes.
function diagnose(
  foods: readonly CandidateFood[],
  limits: readonly PortionLimits[],
  totals: Nutrients,
  target: Nutrients,
): string[] {
  if (foods.length === 0) return ['la comida no tiene alimentos'];

  const reachable = (bound: keyof PortionLimits) => (key: keyof Nutrients) =>
    foods.reduce(
      (sum, food, i) => sum + (per100g(food)[key] * limits[i][bound]) / 100,
      0,
    );
  const atMax = reachable('maxG');
  const atMin = reachable('minG');

  return NUTRIENT_KEYS.flatMap((key) => {
    const relative = (totals[key] - target[key]) / target[key];
    if (Math.abs(relative) <= TOLERANCES[key] + 1e-9) return [];
    const label = NUTRIENT_LABELS[key];
    const highest = (atMax(key) - target[key]) / target[key];
    const lowest = (atMin(key) - target[key]) / target[key];
    if (highest < -TOLERANCES[key]) {
      return [
        `falta ${label}: incluso con todas las porciones al máximo queda ${percent(highest)} % abajo`,
      ];
    }
    if (lowest > TOLERANCES[key]) {
      return [
        `sobra ${label}: incluso con todas las porciones al mínimo queda ${percent(lowest)} % arriba`,
      ];
    }
    return [
      `${label} queda ${percent(relative)} % ${relative < 0 ? 'abajo' : 'arriba'}: con estos alimentos no se equilibra con los demás nutrientes`,
    ];
  });
}

// Totales, desvíos y diagnóstico de unos gramos dados (sin optimizar)
export function evaluateGrams(
  foods: readonly CandidateFood[],
  grams: readonly number[],
  target: Nutrients,
): MealEvaluation {
  const limits = foods.map(portionLimits);
  const items = foods.map((food, i) => ({
    foodId: food.id,
    name: food.name,
    grams: grams[i],
    ...nutrientsFor(food, grams[i]),
    ...limits[i],
  }));
  const totals = sumNutrients(items);
  const relative = NUTRIENT_KEYS.map(
    (key) => (totals[key] - target[key]) / target[key],
  );

  return {
    items,
    totals,
    deviationPct: deviationPct(totals, target),
    withinTolerance: NUTRIENT_KEYS.every(
      (key, j) => Math.abs(relative[j]) <= TOLERANCES[key] + 1e-9,
    ),
    score: NUTRIENT_KEYS.reduce(
      (sum, key, j) => sum + DEVIATION_WEIGHTS[key] * relative[j] ** 2,
      0,
    ),
    problems: diagnose(foods, limits, totals, target),
  };
}

const toStep = (grams: number, limits: PortionLimits) =>
  Math.min(
    limits.maxG,
    Math.max(limits.minG, Math.round(grams / GRAM_STEP) * GRAM_STEP),
  );

// Optimiza los gramos de unos alimentos y decide el estado de la comida.
// Sin gramos de partida, se usa la porción de referencia.
export function optimizeMeal(
  foods: readonly CandidateFood[],
  startGrams: readonly (number | undefined)[],
  target: Nutrients,
): { evaluation: MealEvaluation; status: MealStatus } {
  const limits = foods.map(portionLimits);
  const start = foods.map((food, i) =>
    toStep(startGrams[i] ?? food.servingSizeG ?? limits[i].minG, limits[i]),
  );
  const proposal = evaluateGrams(foods, start, target);

  const grams = optimizePortions(
    foods.map((food, i) => ({ ...food, ...limits[i] })),
    target,
    start,
  );
  const optimized = evaluateGrams(foods, grams, target);
  // El redondeo podría dejarla apenas peor que la propuesta: nunca empeorar
  const evaluation = optimized.score <= proposal.score ? optimized : proposal;

  const status: MealStatus = !evaluation.withinTolerance
    ? 'needs_revision'
    : proposal.withinTolerance
      ? 'ok'
      : 'adjusted';
  return { evaluation, status };
}
