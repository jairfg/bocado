import type { Nutrients } from '@bocado/shared';

export const NUTRIENT_KEYS = ['kcal', 'proteinG', 'carbsG', 'fatG'] as const;

export const NUTRIENT_LABELS: Record<keyof Nutrients, string> = {
  kcal: 'kcal',
  proteinG: 'proteína',
  carbsG: 'carbohidratos',
  fatG: 'grasa',
};

export type Per100g = {
  kcalPer100g: number;
  proteinGPer100g: number;
  carbsGPer100g: number;
  fatGPer100g: number;
};

export const round1 = (value: number): number => Math.round(value * 10) / 10;

export const mapNutrients = (
  fn: (key: keyof Nutrients) => number,
): Nutrients => ({
  kcal: fn('kcal'),
  proteinG: fn('proteinG'),
  carbsG: fn('carbsG'),
  fatG: fn('fatG'),
});

export const per100g = (food: Per100g): Nutrients => ({
  kcal: food.kcalPer100g,
  proteinG: food.proteinGPer100g,
  carbsG: food.carbsGPer100g,
  fatG: food.fatGPer100g,
});

// kcal declaradas en la base, nunca recalculadas con 4-4-9.
export function nutrientsFor(food: Per100g, grams: number): Nutrients {
  const values = per100g(food);
  return mapNutrients((key) => round1((values[key] * grams) / 100));
}

// Suma los valores ya redondeados para que los totales cuadren con lo que
// se muestra; round1 limpia el error de punto flotante de la suma.
export const sumNutrients = (rows: readonly Nutrients[]): Nutrients =>
  mapNutrients((key) => round1(rows.reduce((sum, row) => sum + row[key], 0)));

// (total − meta) / meta × 100. MenuRequestSchema garantiza metas > 0.
export const deviationPct = (totals: Nutrients, target: Nutrients): Nutrients =>
  mapNutrients((key) =>
    round1(((totals[key] - target[key]) / target[key]) * 100),
  );
