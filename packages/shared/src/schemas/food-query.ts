import { z } from 'zod';
import { FoodCategorySchema } from './food.js';

// Los query params llegan como strings: coerce los convierte a número.
export const FoodQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: FoodCategorySchema.optional(),
  maxKcal: z.coerce.number().nonnegative().optional(),
  minProtein: z.coerce.number().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type FoodQuery = z.infer<typeof FoodQuerySchema>;
