import type { PrismaService } from '../prisma/prisma.service.js';

export type FoodSummary = {
  id: number;
  name: string;
  category: string;
  per100g: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  servingSizeG: number | null;
  measures: { name: string; grams: number }[];
};

// Carga los alimentos con el cliente tipado y respeta el orden de `ids`,
// que viene del ranking.
export async function findFoodSummaries(
  prisma: PrismaService,
  ids: readonly number[],
): Promise<FoodSummary[]> {
  const foods = await prisma.food.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      name: true,
      category: true,
      kcalPer100g: true,
      proteinGPer100g: true,
      carbsGPer100g: true,
      fatGPer100g: true,
      servingSizeG: true,
      measures: {
        select: { name: true, grams: true },
        orderBy: { id: 'asc' },
      },
    },
  });
  const byId = new Map(foods.map((food) => [food.id, food]));

  return ids.flatMap((id) => {
    const food = byId.get(id);
    if (!food) return [];
    return [
      {
        id: food.id,
        name: food.name,
        category: food.category,
        per100g: {
          kcal: food.kcalPer100g,
          proteinG: food.proteinGPer100g,
          carbsG: food.carbsGPer100g,
          fatG: food.fatGPer100g,
        },
        servingSizeG: food.servingSizeG,
        measures: food.measures,
      },
    ];
  });
}
