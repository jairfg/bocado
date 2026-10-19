import { Injectable } from '@nestjs/common';
import type { FoodQuery } from '@bocado/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { findFoodSummaries, type FoodSummary } from './food-summary.js';

// % y _ son comodines de LIKE; se escapan para buscarlos como texto literal.
const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`);

// Cada ${valor} dentro de Prisma.sql viaja como parámetro ($1, $2...),
// nunca concatenado al texto SQL.
export function buildFoodFilters({
  q,
  category,
  maxKcal,
  minProtein,
  includeAlcoholic,
}: FoodQuery): Prisma.Sql {
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
  if (!includeAlcoholic) {
    conditions.push(Prisma.sql`is_alcoholic = false`);
  }
  return conditions.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
    : Prisma.empty;
}

@Injectable()
export class FoodsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: FoodQuery): Promise<FoodSummary[]> {
    const where = buildFoodFilters(query);
    const { limit } = query;

    // SQL solo para filtrar (unaccent no existe en la API de Prisma);
    // los datos y las medidas se cargan con el cliente tipado.
    const rows = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM foods ${where} ORDER BY name LIMIT ${limit}
    `;
    return findFoodSummaries(
      this.prisma,
      rows.map((row) => row.id),
    );
  }
}
