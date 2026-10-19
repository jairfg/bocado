import { Logger } from '@nestjs/common';
import { NO_RESTRICTIONS, type RestrictionFilters } from '@bocado/shared';
import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import {
  ALL_FOODS,
  BROCCOLI,
  CHICKEN,
  OLIVE_OIL,
  RICE,
  TARGETS,
} from '../../test/fixtures/foods.js';
import { mockModel, type MockStep } from '../../test/fixtures/mock-model.js';
import type { FoodSearchService } from '../foods/food-search.service.js';
import type { SearchRequest } from '../foods/food-search.service.js';
import { LlmService } from '../llm/llm.service.js';
import type { CandidatesService } from './candidates.service.js';
import { LlmCallBudget } from './llm-call-budget.js';
import { optimizeMeal, type PlannedMeal } from './meal-evaluation.js';
import { MealRevisionService } from './meal-revision.service.js';

// Comida sin proteína: el optimizador no puede ajustarla
function mealWithoutProtein(slot: 'almuerzo' | 'cena'): PlannedMeal {
  const foods = [RICE, OLIVE_OIL];
  const { evaluation, status } = optimizeMeal(foods, [300, 15], TARGETS[slot]);
  return {
    slot,
    target: TARGETS[slot],
    foods,
    evaluation,
    status,
    revisions: 0,
  };
}

// Lo que evaluateMeal devolvería con pollo, arroz, brócoli y aceite
const fixedLunch = optimizeMeal(
  [RICE, OLIVE_OIL, CHICKEN, BROCCOLI],
  [300, 15, 150, 100],
  TARGETS.almuerzo,
).evaluation.items.map(({ foodId, grams }) => ({ foodId, grams }));

const RESTRICTIONS: RestrictionFilters = {
  ...NO_RESTRICTIONS,
  excludeTerms: ['brócoli crudo'],
};

function setup(steps: readonly MockStep[], budgetLimit = 6) {
  const model = mockModel(steps);
  const searches: SearchRequest[] = [];
  const foodSearch = {
    searchMany: (requests: SearchRequest[]) => {
      searches.push(...requests);
      return Promise.resolve(requests.map(() => [CHICKEN.id]));
    },
  };
  const byId = new Map(ALL_FOODS.map((food) => [food.id, food]));
  const candidates = {
    loadEligible: (ids: number[]) =>
      Promise.resolve(ids.flatMap((id) => byId.get(id) ?? [])),
  };
  const service = new MealRevisionService(
    new LlmService(model),
    foodSearch as unknown as FoodSearchService,
    candidates as unknown as CandidatesService,
  );
  const budget = new LlmCallBudget(budgetLimit);
  const context = { restrictions: RESTRICTIONS, budget };
  return { model, searches, service, budget, context };
}

describe('MealRevisionService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  it('una comida "needs_revision" termina en "ok" usando las herramientas', async () => {
    const { model, searches, service, budget, context } = setup([
      // El modelo intenta desactivar los filtros desde los argumentos
      {
        tool: 'searchFoods',
        input: {
          query: 'pechuga de pollo',
          category: 'meats',
          restrictions: NO_RESTRICTIONS,
          dishesOnly: false,
          includeAlcoholic: true,
        },
      },
      {
        tool: 'evaluateMeal',
        input: {
          items: [
            { foodId: RICE.id, grams: 300 },
            { foodId: OLIVE_OIL.id, grams: 15 },
            { foodId: CHICKEN.id, grams: 150 },
            { foodId: BROCCOLI.id, grams: 100 },
          ],
        },
      },
      { tool: 'submitMeal', input: { items: fixedLunch } },
    ]);
    const meal = mealWithoutProtein('almuerzo');
    expect(meal.status).toBe('needs_revision');

    const outcome = await service.reviseMeals([meal], context);

    const [revised] = outcome.meals;
    expect(revised.status).toBe('ok');
    expect(revised.revisions).toBe(1);
    expect(revised.evaluation.items.map((item) => item.foodId)).toContain(
      CHICKEN.id,
    );
    expect(outcome.warnings).toEqual([]);
    expect(outcome.toolSteps).toBe(2);
    expect(budget.calls).toBe(3);
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(outcome.usage).toEqual({ inputTokens: 3000, outputTokens: 300 });

    // Los filtros vienen del request, no de los argumentos del modelo
    expect(searches).toEqual([
      {
        text: 'pechuga de pollo',
        filters: {
          categories: ['meats'],
          restrictions: RESTRICTIONS,
          dishesOnly: true,
        },
        limit: 8,
      },
    ]);
  });

  it('una comida "ok" o "adjusted" no llama al LLM', async () => {
    const { model, service, context } = setup([]);
    const foods = [CHICKEN, RICE, BROCCOLI, OLIVE_OIL];
    const { evaluation, status } = optimizeMeal(
      foods,
      [150, 200, 100, 10],
      TARGETS.almuerzo,
    );
    const meal: PlannedMeal = {
      slot: 'almuerzo',
      target: TARGETS.almuerzo,
      foods,
      evaluation,
      status,
      revisions: 0,
    };

    const outcome = await service.reviseMeals([meal], context);

    expect(outcome.meals).toEqual([meal]);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it('con el presupuesto agotado devuelve el mejor resultado y avisa', async () => {
    // 3 llamadas: el almuerzo las usa todas y a la cena no le queda nada
    const { model, service, context } = setup(
      [
        { tool: 'searchFoods', input: { query: 'pollo' } },
        {
          tool: 'evaluateMeal',
          input: {
            items: [
              { foodId: RICE.id },
              { foodId: OLIVE_OIL.id },
              { foodId: CHICKEN.id },
              { foodId: BROCCOLI.id },
            ],
          },
        },
        { tool: 'submitMeal', input: { items: fixedLunch } },
      ],
      3,
    );
    const dinner = mealWithoutProtein('cena');

    const outcome = await service.reviseMeals(
      [mealWithoutProtein('almuerzo'), dinner],
      context,
    );

    expect(outcome.meals[0].status).toBe('ok');
    expect(outcome.meals[1]).toEqual(dinner);
    expect(outcome.warnings).toEqual([
      expect.objectContaining({
        code: 'revision_exhausted',
        slot: 'cena',
        message: expect.stringContaining('presupuesto de 3 llamadas'),
      }),
    ]);
    expect(model.doGenerateCalls).toHaveLength(3);
  });

  it('si no entrega respuesta final, conserva la mejor combinación evaluada', async () => {
    // 2 pasos: evalúa una combinación mejor (aún fuera de tolerancia) y en
    // el último paso, donde debía llamar a submitMeal, responde con texto.
    // El SDK lo informa como error.
    const { service, context } = setup(
      [
        {
          tool: 'evaluateMeal',
          input: {
            items: [{ foodId: RICE.id }, { foodId: CHICKEN.id }],
          },
        },
        { text: 'No encontré una combinación mejor.' },
      ],
      2,
    );
    const meal = mealWithoutProtein('almuerzo');

    const outcome = await service.reviseMeals([meal], context);

    const [revised] = outcome.meals;
    expect(revised.evaluation.score).toBeLessThan(meal.evaluation.score);
    expect(revised.evaluation.items.map((i) => i.foodId)).toEqual([
      RICE.id,
      CHICKEN.id,
    ]);
    expect(revised.status).toBe('needs_revision');
    expect(outcome.warnings).toEqual([
      expect.objectContaining({ code: 'revision_failed', slot: 'almuerzo' }),
    ]);
    // Los tokens del paso que sí terminó quedan contados
    expect(outcome.usage).toEqual({ inputTokens: 1000, outputTokens: 100 });
  });

  it('si el proveedor falla, no lanza error: avisa y conserva la comida', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: () => {
        throw new APICallError({
          message: 'Resource exhausted',
          url: 'https://example.test',
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: true,
        });
      },
    });
    const service = new MealRevisionService(
      new LlmService(model),
      {} as FoodSearchService,
      {} as CandidatesService,
    );
    const meal = mealWithoutProtein('almuerzo');

    const outcome = await service.reviseMeals([meal], {
      restrictions: NO_RESTRICTIONS,
      budget: new LlmCallBudget(),
    });

    expect(outcome.meals[0]).toEqual({ ...meal, revisions: 1 });
    expect(outcome.warnings).toEqual([
      expect.objectContaining({ code: 'revision_failed', slot: 'almuerzo' }),
    ]);
  });
});
