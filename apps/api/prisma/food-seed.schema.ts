import { FoodCategorySchema, MeasureNameSchema } from '@bocado/shared';
import { z } from 'zod';
import { normalizeText } from '../src/common/normalize-text.js';

// Nutrientes que van al JSON `micros`, con la clave del dataset.
// vitamin_a_re_* e ins_folic_acid_* no se importan: el esquema los descarta.
const MICRO_KEYS = [
  'vitamin_a_rae_mcg_per_100g',
  'vitamin_b1_mg_per_100g',
  'vitamin_b2_mg_per_100g',
  'vitamin_b3_mg_per_100g',
  'vitamin_b5_mg_per_100g',
  'vitamin_b6_mg_per_100g',
  'vitamin_b12_mcg_per_100g',
  'folate_dfe_mcg_per_100g',
  'vitamin_c_mg_per_100g',
  'vitamin_d_mcg_per_100g',
  'vitamin_e_mg_per_100g',
  'vitamin_k_mcg_per_100g',
  'choline_mg_per_100g',
  'calcium_mg_per_100g',
  'iron_mg_per_100g',
  'magnesium_mg_per_100g',
  'phosphorus_mg_per_100g',
  'potassium_mg_per_100g',
  'zinc_mg_per_100g',
  'selenium_mcg_per_100g',
  'copper_mg_per_100g',
  'manganese_mg_per_100g',
  'fluoride_mcg_per_100g',
  'monounsaturated_fat_g_per_100g',
  'polyunsaturated_fat_g_per_100g',
  'trans_fat_g_per_100g',
  'cholesterol_mg_per_100g',
] as const;

type MicroKey = (typeof MICRO_KEYS)[number];

const amount = z.number().nonnegative();
// null = el dataset no reporta el valor (desconocido, no 0)
const optionalAmount = amount.nullable();

const microsShape = Object.fromEntries(
  MICRO_KEYS.map((key) => [key, optionalAmount]),
) as Record<MicroKey, typeof optionalAmount>;

export const FoodSeedSchema = z
  .object({
    name: z.string().trim().min(1),
    category: FoodCategorySchema,
    data_source: z.string().min(1),
    source_dataset: z.string().min(1),
    source_key: z.string().min(1),
    serving_size_g: z.number().positive().nullable(),
    kcal_per_100g: amount,
    protein_g_per_100g: amount,
    carbs_g_per_100g: amount,
    fat_g_per_100g: amount,
    fiber_g_per_100g: optionalAmount,
    sugar_g_per_100g: optionalAmount,
    sodium_mg_per_100g: optionalAmount,
    saturated_fat_g_per_100g: optionalAmount,
    ...microsShape,
    measures: z.array(
      z.object({ name: MeasureNameSchema, grams: z.number().positive() }),
    ),
  })
  .transform((food) => ({
    sourceKey: food.source_key,
    sourceDataset: food.source_dataset,
    dataSource: food.data_source,
    name: food.name,
    category: food.category,
    servingSizeG: food.serving_size_g,
    kcalPer100g: food.kcal_per_100g,
    proteinGPer100g: food.protein_g_per_100g,
    carbsGPer100g: food.carbs_g_per_100g,
    fatGPer100g: food.fat_g_per_100g,
    fiberGPer100g: food.fiber_g_per_100g,
    sugarGPer100g: food.sugar_g_per_100g,
    sodiumMgPer100g: food.sodium_mg_per_100g,
    saturatedFatGPer100g: food.saturated_fat_g_per_100g,
    micros: Object.fromEntries(
      MICRO_KEYS.map((key) => [key, food[key]]),
    ) as Record<MicroKey, number | null>,
    measures: food.measures,
  }));

export type FoodSeed = z.output<typeof FoodSeedSchema>;

export const ATWATER_TOLERANCE = 0.15;
// En alimentos casi sin calorías el porcentaje se dispara por décimas
// (café: 1 kcal declarada frente a 0.7 calculada es +52 %), así que además
// se exige una diferencia absoluta mínima.
export const ATWATER_MIN_KCAL_DIFF = 20;

export type AtwaterCheck = {
  consistent: boolean;
  expectedKcal: number;
  // (kcal declaradas − calculadas) / calculadas; null si las calculadas son 0
  deviation: number | null;
};

// Factores de Atwater: 4 kcal/g proteína y carbohidratos, 9 kcal/g grasa.
export function checkAtwater(
  food: Pick<
    FoodSeed,
    'kcalPer100g' | 'proteinGPer100g' | 'carbsGPer100g' | 'fatGPer100g'
  >,
): AtwaterCheck {
  const expectedKcal =
    food.proteinGPer100g * 4 + food.carbsGPer100g * 4 + food.fatGPer100g * 9;
  const absoluteDiff = Math.abs(food.kcalPer100g - expectedKcal);

  // Con 0 kcal calculadas el desvío relativo es infinito: solo cuenta
  // la diferencia absoluta.
  const deviation =
    expectedKcal === 0
      ? null
      : (food.kcalPer100g - expectedKcal) / expectedKcal;
  const exceedsTolerance =
    deviation === null || Math.abs(deviation) > ATWATER_TOLERANCE;

  return {
    consistent: !(exceedsTolerance && absoluteDiff > ATWATER_MIN_KCAL_DIFF),
    expectedKcal,
    deviation,
  };
}

// El dataset no trae el contenido de alcohol, así que se detecta por nombre,
// solo dentro de bebidas (fuera de ahí "vino" aparece en "vinagre de vino").
const ALCOHOLIC_NAME =
  /\b(cerveza|vino|licor|ron|whisky|vodka|ginebra|tequila|mezcal|pisco|sake|brandy|conac|jerez|vermut|champana|sidra|aguardiente)\b/;
const NON_ALCOHOLIC_NAME = /\bsin alcohol\b/;

export function isAlcoholic(food: { name: string; category: string }): boolean {
  if (food.category !== 'beverages') return false;
  const name = normalizeText(food.name);
  return ALCOHOLIC_NAME.test(name) && !NON_ALCOHOLIC_NAME.test(name);
}
