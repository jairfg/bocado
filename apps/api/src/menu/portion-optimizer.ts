import type { Nutrients } from '@bocado/shared';
import { NUTRIENT_KEYS, per100g, type Per100g } from './nutrition.js';
import { GRAM_STEP, type PortionLimits } from './portion-limits.js';

// Peso de cada desvío relativo en el objetivo: las kcal pesan más porque
// son la meta principal del plan.
export const DEVIATION_WEIGHTS: Nutrients = {
  kcal: 3,
  proteinG: 1,
  carbsG: 1,
  fatG: 1,
};

// Corte de convergencia: si en una pasada ningún alimento cambia más que
// esto, ya no hay mejora apreciable.
const CONVERGENCE_G = 1e-6;
const MAX_SWEEPS = 1000;
const MAX_POLISH_PASSES = 100;

export type OptimizerFood = Per100g & PortionLimits;

const clamp = (value: number, { minG, maxG }: PortionLimits) =>
  Math.min(maxG, Math.max(minG, value));

// Σ peso × ((total − meta) / meta)²
export function weightedError(
  foods: readonly OptimizerFood[],
  grams: readonly number[],
  target: Nutrients,
): number {
  return NUTRIENT_KEYS.reduce((sum, key) => {
    const total = foods.reduce(
      (acc, food, i) => acc + (per100g(food)[key] * grams[i]) / 100,
      0,
    );
    const relative = (total - target[key]) / target[key];
    return sum + DEVIATION_WEIGHTS[key] * relative * relative;
  }, 0);
}

// Mínimos cuadrados acotados por descenso de coordenadas.
//
// El objetivo se escribe como ‖A·g − b‖², donde A[j][i] es lo que aporta
// 1 g del alimento i al desvío relativo ponderado del nutriente j, y b[j]
// es √peso. En cada pasada se recorre un alimento a la vez: con los demás
// fijos, el objetivo es una parábola en sus gramos, así que el mínimo
// exacto se calcula directo y se recorta a su porción mínima y máxima. Al
// ser convexo, repetir las pasadas converge al óptimo, sin tasas de
// aprendizaje que ajustar, y siempre igual para la misma entrada.
//
// `start` (los gramos del LLM) es el punto de partida. Cuando hay más
// alimentos que nutrientes, varias combinaciones empatan y el método se
// queda cerca de la propuesta original.
export function optimizePortions(
  foods: readonly OptimizerFood[],
  target: Nutrients,
  start: readonly number[],
): number[] {
  if (foods.length === 0) return [];

  const sqrtWeights = NUTRIENT_KEYS.map((key) =>
    Math.sqrt(DEVIATION_WEIGHTS[key]),
  );
  const columns = foods.map((food) =>
    NUTRIENT_KEYS.map(
      (key, j) => (sqrtWeights[j] * per100g(food)[key]) / 100 / target[key],
    ),
  );
  const grams = foods.map((food, i) => clamp(start[i], food));
  // residual = A·g − b, actualizado en cada cambio
  const residual = NUTRIENT_KEYS.map(
    (_, j) =>
      columns.reduce((sum, column, i) => sum + column[j] * grams[i], 0) -
      sqrtWeights[j],
  );

  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    let largestChange = 0;
    foods.forEach((food, i) => {
      const column = columns[i];
      const squaredNorm = column.reduce((sum, a) => sum + a * a, 0);
      // Un alimento sin nutrientes no mueve el objetivo
      if (squaredNorm === 0) return;
      const slope = column.reduce((sum, a, j) => sum + a * residual[j], 0);
      const next = clamp(grams[i] - slope / squaredNorm, food);
      const change = next - grams[i];
      if (change === 0) return;
      column.forEach((a, j) => (residual[j] += a * change));
      grams[i] = next;
      largestChange = Math.max(largestChange, Math.abs(change));
    });
    if (largestChange < CONVERGENCE_G) break;
  }

  return roundToStep(foods, grams, target);
}

// Redondea a múltiplos de 5 g y pule: prueba ±5 g en cada alimento y se
// queda con el cambio si baja el error, hasta que ninguno mejore. Redondear
// cada alimento por separado puede alejar la suma de la meta; el pulido lo
// compensa. Los límites ya son múltiplos de 5.
function roundToStep(
  foods: readonly OptimizerFood[],
  continuous: readonly number[],
  target: Nutrients,
): number[] {
  const grams = continuous.map((value, i) =>
    clamp(Math.round(value / GRAM_STEP) * GRAM_STEP, foods[i]),
  );
  let best = weightedError(foods, grams, target);

  for (let pass = 0; pass < MAX_POLISH_PASSES; pass++) {
    let improved = false;
    foods.forEach((food, i) => {
      for (const delta of [GRAM_STEP, -GRAM_STEP]) {
        const candidate = grams[i] + delta;
        if (candidate < food.minG || candidate > food.maxG) continue;
        grams[i] = candidate;
        const error = weightedError(foods, grams, target);
        if (error < best - 1e-12) {
          best = error;
          improved = true;
        } else {
          grams[i] -= delta;
        }
      }
    });
    if (!improved) break;
  }
  return grams;
}
