import { Injectable } from '@nestjs/common';
import type { FoodQuery } from '@bocado/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type FoodSummary = {
  id: number;
  name: string;
  category: string;
  per100g: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  servingSizeG: number | null;
  measures: { name: string; grams: number }[];
};

// % y _ son comodines de LIKE; se escapan para buscarlos como texto literal.
const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`);

@Injectable()
export class FoodsService {
  constructor(private readonly prisma: PrismaService) {}

  async search({
    q,
    category,
    maxKcal,
    minProtein,
    limit,
  }: FoodQuery): Promise<FoodSummary[]> {
    // Cada ${valor} dentro de Prisma.sql viaja como parámetro ($1, $2...),
    // nunca concatenado al texto SQL.
    const conditions: Prisma.Sql[] = [];
    if (q) {
      conditions.push(
        Prisma.sql`unaccent(name) ILIKE unaccent(${`%${escapeLike(q)}%`})`,
      );
    }
    if (category) {
      conditions.push(Prisma.sql`category = ${category}`);
    }
    if (maxKcal !== undefined) {
      conditions.push(Prisma.sql`kcal_per_100g <= ${maxKcal}`);
    }
    if (minProtein !== undefined) {
      conditions.push(Prisma.sql`protein_g_per_100g >= ${minProtein}`);
    }
    const where =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    // SQL solo para filtrar (unaccent no existe en la API de Prisma);
    // los datos y las medidas se cargan con el cliente tipado.
    const rows = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM foods ${where} ORDER BY name LIMIT ${limit}
    `;
    const ids = rows.map((row) => row.id);

    const foods = await this.prisma.food.findMany({
      where: { id: { in: ids } },
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
}
