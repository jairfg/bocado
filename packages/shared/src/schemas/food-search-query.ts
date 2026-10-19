import { z } from 'zod';

export const FoodSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type FoodSearchQuery = z.infer<typeof FoodSearchQuerySchema>;
