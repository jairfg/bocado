import type { CandidateFood } from '../../src/menu/candidate-selection.js';

// Alimentos reales de data/foods/usda.yml (valores por 100 g y porción de
// referencia), para tests sin base de datos.
const food = (
  id: number,
  name: string,
  category: string,
  servingSizeG: number | null,
  [kcal, protein, carbs, fat]: [number, number, number, number],
): CandidateFood => ({
  id,
  name,
  category,
  servingSizeG,
  kcalPer100g: kcal,
  proteinGPer100g: protein,
  carbsGPer100g: carbs,
  fatGPer100g: fat,
});

export const CHICKEN = food(
  1727,
  'Pechuga de pollo (broiler/fryer), sin piel ni hueso, cocida a la parrilla',
  'meats',
  85,
  [151, 30.5, 0, 3.17],
);
export const RICE = food(
  558,
  'Arroz blanco, grano largo regular, cocido, enriquecido',
  'cereals',
  158,
  [130, 2.69, 28.2, 0.28],
);
export const BROCCOLI = food(
  1057,
  'Brócoli, cocido, hervido, escurrido, sin sal',
  'vegetables',
  78,
  [35, 2.38, 7.18, 0.41],
);
export const OLIVE_OIL = food(
  1653,
  'Aceite de oliva, para ensalada o cocina',
  'fats_oils',
  13.5,
  [884, 0, 0, 100],
);
export const EGG = food(
  2246,
  'Huevo entero, cocido, duro (hard-boiled)',
  'eggs',
  50,
  [155, 12.6, 1.12, 10.6],
);
export const OATS = food(
  2425,
  'Avena regular y de cocción rápida, sin enriquecer, cocida con agua, sin sal',
  'cereals',
  234,
  [71, 2.54, 12, 1.52],
);
export const GREEK_YOGURT = food(
  1450,
  'Yogur griego natural, descremado',
  'dairy',
  170,
  [59, 10.2, 3.6, 0.39],
);
export const STRAWBERRIES = food(
  74,
  'Fresas crudas',
  'fruits',
  147,
  [32, 0.67, 7.68, 0.3],
);
// El del desayuno del punto 4: el modelo propuso 170 g
export const FAT_FREE_CREAM_CHEESE = food(
  1947,
  'Queso crema, libre de grasa',
  'dairy',
  18,
  [105, 15.7, 7.66, 1],
);

export const ALL_FOODS = [
  CHICKEN,
  RICE,
  BROCCOLI,
  OLIVE_OIL,
  EGG,
  OATS,
  GREEK_YOGURT,
  STRAWBERRIES,
  FAT_FREE_CREAM_CHEESE,
];

// Metas de DistributionService para 2000 kcal, 30/45/25, con desayuno,
// almuerzo y cena
export const TARGETS = {
  desayuno: { kcal: 625, proteinG: 46.9, carbsG: 70.3, fatG: 17.4 },
  almuerzo: { kcal: 875, proteinG: 65.6, carbsG: 98.4, fatG: 24.3 },
  cena: { kcal: 500, proteinG: 37.5, carbsG: 56.3, fatG: 13.9 },
};
