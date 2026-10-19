import { createHash } from 'node:crypto';
import type { FoodCategory } from '@bocado/shared';

export const CATEGORY_LABELS: Record<FoodCategory, string> = {
  beverages: 'bebidas',
  cereals: 'cereales y derivados',
  dairy: 'lácteos',
  eggs: 'huevos',
  fats_oils: 'grasas y aceites',
  fish_seafood: 'pescados y mariscos',
  fruits: 'frutas',
  legumes: 'legumbres',
  meats: 'carnes y aves',
  miscellaneous: 'especias y condimentos',
  nuts_seeds: 'frutos secos y semillas',
  sugars_sweets: 'azúcares y dulces',
  tubers_roots: 'tubérculos y raíces',
  vegetables: 'verduras',
};

// Umbrales por 100 g. Grasa baja, fibra alta y calorías bajas siguen las
// declaraciones nutricionales de la UE (≤ 3 g, ≥ 6 g, ≤ 40 kcal); azúcar
// y sodio altos, los "semáforos" del Reino Unido (> 22.5 g, > 600 mg).
// Proteína y carbohidratos son criterio propio.
export const DESCRIPTOR_THRESHOLDS = {
  highProteinG: 12,
  lowFatG: 3,
  highFatG: 20,
  highCarbsG: 40,
  highFiberG: 6,
  highSugarG: 22.5,
  highSodiumMg: 600,
  lowKcal: 40,
} as const;

export type EmbeddableFood = {
  name: string;
  category: string;
  kcalPer100g: number;
  proteinGPer100g: number;
  carbsGPer100g: number;
  fatGPer100g: number;
  fiberGPer100g: number | null;
  sugarGPer100g: number | null;
  sodiumMgPer100g: number | null;
};

// Un valor null (no medido) no genera descriptor: no se asume 0.
export function describeFood(food: EmbeddableFood): string[] {
  const t = DESCRIPTOR_THRESHOLDS;
  const exceeds = (value: number | null, threshold: number) =>
    value !== null && value > threshold;

  return [
    food.proteinGPer100g >= t.highProteinG && 'alto en proteína',
    food.fatGPer100g <= t.lowFatG && 'bajo en grasa',
    food.fatGPer100g >= t.highFatG && 'alto en grasa',
    food.carbsGPer100g >= t.highCarbsG && 'alto en carbohidratos',
    food.fiberGPer100g !== null &&
      food.fiberGPer100g >= t.highFiberG &&
      'alto en fibra',
    exceeds(food.sugarGPer100g, t.highSugarG) && 'alto en azúcar',
    exceeds(food.sodiumMgPer100g, t.highSodiumMg) && 'alto en sodio',
    food.kcalPer100g <= t.lowKcal && 'bajo en calorías',
  ].filter((descriptor): descriptor is string => descriptor !== false);
}

// "Pechuga de pollo, asada. Categoría: carnes y aves. Alto en proteína,
// bajo en grasa."
export function buildEmbeddingText(food: EmbeddableFood): string {
  const label = Object.hasOwn(CATEGORY_LABELS, food.category)
    ? CATEGORY_LABELS[food.category as FoodCategory]
    : food.category;
  const parts = [`${food.name}.`, `Categoría: ${label}.`];

  const descriptors = describeFood(food);
  if (descriptors.length > 0) {
    const sentence = descriptors.join(', ');
    parts.push(`${sentence[0].toUpperCase()}${sentence.slice(1)}.`);
  }
  return parts.join(' ');
}

// Si el texto cambia (nombre, macros o umbrales), cambia el hash y el
// script de embeddings sabe que debe volver a embeber ese alimento.
export const hashEmbeddingText = (text: string): string =>
  createHash('sha256').update(text).digest('hex');
