import { Injectable } from '@nestjs/common';
import type { MealSlot, RestrictionFilters } from '@bocado/shared';
import {
  FoodSearchService,
  type SearchRequest,
} from '../foods/food-search.service.js';
import {
  buildSearchWhere,
  type SearchFilters,
} from '../foods/search-filters.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  MAX_CANDIDATES,
  MEAL_QUERIES,
  missingGroups,
  pickMealCandidates,
  type CandidateFood,
  type CoverageGroup,
} from './candidate-selection.js';

export type MealCandidates = {
  // Sin duplicados, en el orden en que aparecen por comida
  foods: CandidateFood[];
  bySlot: { slot: MealSlot; foodIds: number[] }[];
};

@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly foodSearch: FoodSearchService,
  ) {}

  async forMeals(
    slots: readonly MealSlot[],
    restrictions: RestrictionFilters,
  ): Promise<MealCandidates> {
    const size = Math.floor(MAX_CANDIDATES / slots.length);
    const filters = (
      categories?: SearchFilters['categories'],
    ): SearchFilters => ({ categories, restrictions, dishesOnly: true });

    // Todas las consultas del día van en una sola llamada de embeddings.
    // Las preferencias son una consulta más, compartida por todas las
    // comidas.
    const perMeal = slots.map((slot) =>
      MEAL_QUERIES[slot].map((query): SearchRequest => ({
        text: query.text,
        filters: filters(query.categories),
        limit: size,
      })),
    );
    const preference: SearchRequest[] =
      restrictions.preferTerms.length > 0
        ? [
            {
              text: `Alimentos preferidos: ${restrictions.preferTerms.join(', ')}`,
              filters: filters(),
              limit: size,
            },
          ]
        : [];

    const results = await this.foodSearch.searchMany([
      ...perMeal.flat(),
      ...preference,
    ]);
    const preferred = preference.length > 0 ? results.at(-1)! : [];
    let offset = 0;
    const rankingsBySlot = perMeal.map((queries) => {
      const rankings = results.slice(offset, offset + queries.length);
      offset += queries.length;
      return [...rankings, preferred];
    });

    const foods = await this.load(results.flat());
    const categoryOf = new Map(
      [...foods.values()].map((food) => [food.id, food.category]),
    );

    // Respaldo solo para los grupos que alguna comida no cubre (con
    // restricciones, por ejemplo vegano sin huevos ni lácteos en el
    // desayuno). Es una segunda llamada de embeddings, rara vez necesaria.
    const missing = new Map<CoverageGroup['name'], CoverageGroup>();
    for (const rankings of rankingsBySlot) {
      for (const group of missingGroups(rankings.flat(), categoryOf)) {
        missing.set(group.name, group);
      }
    }
    const fallbacks = await this.searchFallbacks(
      [...missing.values()],
      filters,
    );
    for (const food of (
      await this.load([...fallbacks.values()].flat())
    ).values()) {
      foods.set(food.id, food);
      categoryOf.set(food.id, food.category);
    }

    const bySlot = slots.map((slot, i) => ({
      slot,
      foodIds: pickMealCandidates({
        rankings: rankingsBySlot[i],
        fallbacks,
        categoryOf,
        size,
      }),
    }));
    const unique = [...new Set(bySlot.flatMap((meal) => meal.foodIds))];

    return {
      foods: unique.flatMap((id) => foods.get(id) ?? []),
      bySlot,
    };
  }

  private async searchFallbacks(
    groups: readonly CoverageGroup[],
    filters: (categories?: SearchFilters['categories']) => SearchFilters,
  ): Promise<Map<CoverageGroup['name'], number[]>> {
    if (groups.length === 0) return new Map();
    const results = await this.foodSearch.searchMany(
      groups.map((group) => ({
        text: group.fallback,
        filters: filters(group.categories),
        limit: 5,
      })),
    );
    return new Map(groups.map((group, i) => [group.name, results[i]]));
  }

  // Los alimentos de `ids` que existen y cumplen los mismos filtros duros
  // que la búsqueda de candidatos, en el orden de `ids`. Valida lo que el
  // LLM propone en las revisiones.
  async loadEligible(
    ids: readonly number[],
    restrictions: RestrictionFilters,
  ): Promise<CandidateFood[]> {
    if (ids.length === 0) return [];
    const where = buildSearchWhere({ restrictions, dishesOnly: true });
    const rows = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM foods WHERE id IN (${Prisma.join([...ids])}) AND ${where}
    `;
    const foods = await this.load(rows.map((row) => row.id));
    return [...new Set(ids)].flatMap((id) => foods.get(id) ?? []);
  }

  private async load(
    ids: readonly number[],
  ): Promise<Map<number, CandidateFood>> {
    const foods = await this.prisma.food.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        name: true,
        category: true,
        servingSizeG: true,
        kcalPer100g: true,
        proteinGPer100g: true,
        carbsGPer100g: true,
        fatGPer100g: true,
      },
    });
    return new Map(foods.map((food) => [food.id, food]));
  }
}
