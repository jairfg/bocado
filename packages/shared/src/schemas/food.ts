import { z } from 'zod';

// Valores encontrados en data/foods/usda.yml
export const FoodCategorySchema = z.enum([
  'beverages',
  'cereals',
  'dairy',
  'eggs',
  'fats_oils',
  'fish_seafood',
  'fruits',
  'legumes',
  'meats',
  'miscellaneous',
  'nuts_seeds',
  'sugars_sweets',
  'tubers_roots',
  'vegetables',
]);

export type FoodCategory = z.infer<typeof FoodCategorySchema>;

export const MeasureNameSchema = z.enum([
  'bottle',
  'can',
  'cup',
  'glass',
  'half_cup',
  'handful',
  'jar',
  'large_unit',
  'medium_unit',
  'package',
  'packet',
  'piece',
  'pinch',
  'portion',
  'scoop',
  'slice',
  'small_unit',
  'tablespoon',
  'teaspoon',
  'unit',
]);

export type MeasureName = z.infer<typeof MeasureNameSchema>;
