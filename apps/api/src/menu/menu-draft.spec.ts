import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MenuDraftSchema,
  NO_RESTRICTIONS,
  type LlmMenu,
  type MealSlot,
  type MenuDraft,
  type MenuRequest,
  type RestrictionFilters,
} from '@bocado/shared';
import type { MockLanguageModelV4 } from 'ai/test';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import {
  ALL_FOODS,
  BROCCOLI,
  CHICKEN,
  EGG,
  GREEK_YOGURT,
  OATS,
  OLIVE_OIL,
  RICE,
  STRAWBERRIES,
  TARGETS,
} from '../../test/fixtures/foods.js';
import { mockModel, type MockStep } from '../../test/fixtures/mock-model.js';
import { FoodSearchService } from '../foods/food-search.service.js';
import { EMBEDDING_MODEL } from '../llm/embedding.service.js';
import { LANGUAGE_MODEL } from '../llm/llm.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CandidateFood } from './candidate-selection.js';
import { CandidatesService } from './candidates.service.js';
import { optimizeMeal } from './meal-evaluation.js';
import { MenuModule } from './menu.module.js';
import { nutrientsFor } from './nutrition.js';
import { portionLimits } from './portion-limits.js';

const REQUEST: MenuRequest = {
  kcal: 2000,
  macros: { proteinPct: 30, carbsPct: 45, fatPct: 25 },
  meals: ['desayuno', 'almuerzo', 'cena'],
};

const byId = new Map(ALL_FOODS.map((food) => [food.id, food]));

type Plan = Record<'desayuno' | 'almuerzo' | 'cena', [CandidateFood, number][]>;

const toMenu = (plan: Plan): LlmMenu => ({
  meals: Object.entries(plan).map(([slot, items]) => ({
    slot: slot as MealSlot,
    items: items.map(([food, grams]) => ({ foodId: food.id, grams })),
  })),
});

// Alimentos con los que el optimizador puede llegar a cada meta
const FEASIBLE: Plan = {
  desayuno: [
    [EGG, 100],
    [OATS, 250],
    [GREEK_YOGURT, 170],
    [STRAWBERRIES, 140],
  ],
  almuerzo: [
    [CHICKEN, 150],
    [RICE, 200],
    [BROCCOLI, 100],
    [OLIVE_OIL, 10],
  ],
  cena: [
    [CHICKEN, 100],
    [RICE, 150],
    [BROCCOLI, 100],
    [OLIVE_OIL, 5],
  ],
};

const json = (value: unknown): MockStep => ({ text: JSON.stringify(value) });

describe('POST /menu/draft', () => {
  let app: INestApplication<App> | undefined;
  let model: MockLanguageModelV4;
  let candidateFilters: RestrictionFilters[];

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  // El módulo real, con el LLM simulado, candidatos fijos y una búsqueda
  // simulada para las revisiones: no hay llamadas a Gemini ni a Postgres.
  async function postDraft(
    steps: readonly MockStep[],
    body: MenuRequest = REQUEST,
  ) {
    model = mockModel(steps);
    candidateFilters = [];
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, MenuModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(LANGUAGE_MODEL)
      .useValue(model)
      .overrideProvider(EMBEDDING_MODEL)
      .useValue({})
      .overrideProvider(FoodSearchService)
      .useValue({
        searchMany: () => Promise.resolve([[GREEK_YOGURT.id, EGG.id]]),
      })
      .overrideProvider(CandidatesService)
      .useValue({
        forMeals: (slots: MealSlot[], filters: RestrictionFilters) => {
          candidateFilters.push(filters);
          return Promise.resolve({
            foods: ALL_FOODS,
            bySlot: slots.map((slot) => ({
              slot,
              foodIds: ALL_FOODS.map((f) => f.id),
            })),
          });
        },
        loadEligible: (ids: number[]) =>
          Promise.resolve(ids.flatMap((id) => byId.get(id) ?? [])),
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/menu/draft')
      .send(body);
    return {
      res,
      draft: res.status === 200 ? MenuDraftSchema.parse(res.body) : null,
    };
  }

  const sum = (rows: { kcal: number }[]) =>
    rows.reduce((total, row) => total + row.kcal, 0);

  it('el optimizador calcula los gramos y los totales cuadran', async () => {
    const { res, draft } = await postDraft([json(toMenu(FEASIBLE))]);

    expect(res.status).toBe(200);
    const { meals, usage } = draft as MenuDraft;
    for (const meal of meals) {
      expect(['ok', 'adjusted']).toContain(meal.status);
      expect(meal.revisions).toBe(0);
      expect(Math.abs(meal.deviationPct.kcal)).toBeLessThanOrEqual(5);
      for (const item of meal.items) {
        const food = byId.get(item.foodId)!;
        const { minG, maxG } = portionLimits(food);
        expect(item.grams % 5).toBe(0);
        expect(item.grams).toBeGreaterThanOrEqual(minG);
        expect(item.grams).toBeLessThanOrEqual(maxG);
        // kcal declaradas por 100 g, nunca 4-4-9
        expect(item).toMatchObject(nutrientsFor(food, item.grams));
      }
      expect(meal.totals.kcal).toBeCloseTo(sum(meal.items), 5);
    }
    expect(draft!.totals.kcal).toBeCloseTo(
      sum(meals.map((meal) => meal.totals)),
      5,
    );

    // Advertencia por cada alimento que quedó en su porción máxima
    const atMax = meals.flatMap((meal) =>
      meal.items
        .filter(
          (item) => item.grams === portionLimits(byId.get(item.foodId)!).maxG,
        )
        .map((item) => item.foodId),
    );
    expect(
      draft!.warnings.map((warning) => [warning.code, warning.foodId]),
    ).toEqual(atMax.map((foodId) => ['portion_at_max', foodId]));

    // Sin restricciones ni revisiones: una sola llamada al LLM
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(usage).toEqual({
      llmCalls: 1,
      toolSteps: 0,
      inputTokens: 1000,
      outputTokens: 100,
      latencyMs: {
        restrictions: expect.any(Number),
        candidates: expect.any(Number),
        menu: expect.any(Number),
        optimizer: expect.any(Number),
        revision: expect.any(Number),
        total: expect.any(Number),
      },
    });
    expect(draft!.restrictionFilters).toEqual(NO_RESTRICTIONS);
  });

  it('una comida "ok" no dispara ninguna llamada extra al LLM', async () => {
    // Gramos que ya son el óptimo: la propuesta entra en tolerancia
    const exact = Object.fromEntries(
      Object.entries(FEASIBLE).map(([slot, items]) => {
        const foods = items.map(([food]) => food);
        const { evaluation } = optimizeMeal(
          foods,
          items.map(([, grams]) => grams),
          TARGETS[slot as keyof Plan],
        );
        return [
          slot,
          foods.map((food, i) => [food, evaluation.items[i].grams]),
        ];
      }),
    ) as Plan;

    const { draft } = await postDraft([json(toMenu(exact))]);

    expect(draft!.meals.map((meal) => meal.status)).toEqual(['ok', 'ok', 'ok']);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('revisa con herramientas la comida que el optimizador no puede ajustar', async () => {
    // Desayuno sin proteína: avena y fresas
    const plan: Plan = {
      ...FEASIBLE,
      desayuno: [
        [OATS, 250],
        [STRAWBERRIES, 140],
      ],
    };
    const revisedFoods = [OATS, STRAWBERRIES, GREEK_YOGURT, EGG];
    const revisedGrams = optimizeMeal(
      revisedFoods,
      [250, 140, 170, 100],
      TARGETS.desayuno,
    ).evaluation.items.map(({ foodId, grams }) => ({ foodId, grams }));

    const { draft } = await postDraft([
      json(toMenu(plan)),
      { tool: 'searchFoods', input: { query: 'yogur griego o huevo' } },
      {
        tool: 'evaluateMeal',
        input: { items: revisedFoods.map((food) => ({ foodId: food.id })) },
      },
      { tool: 'submitMeal', input: { items: revisedGrams } },
    ]);

    const breakfast = draft!.meals[0];
    expect(breakfast.status).toBe('ok');
    expect(breakfast.revisions).toBe(1);
    expect(draft!.meals.slice(1).map((meal) => meal.revisions)).toEqual([0, 0]);
    expect(
      draft!.warnings.filter((warning) => warning.code !== 'portion_at_max'),
    ).toEqual([]);
    // Menú (1) + tres pasos de la revisión
    expect(draft!.usage).toMatchObject({
      llmCalls: 4,
      toolSteps: 2,
      inputTokens: 4000,
      outputTokens: 400,
    });
  });

  it('interpreta las restricciones y usa los filtros para los candidatos', async () => {
    const filters: RestrictionFilters = {
      ...NO_RESTRICTIONS,
      vegetarian: true,
      excludeTerms: ['brócoli'],
    };

    const { draft } = await postDraft([json(filters), json(toMenu(FEASIBLE))], {
      ...REQUEST,
      restrictions: 'vegetariano, no me gusta el brócoli',
    });

    expect(candidateFilters).toEqual([filters]);
    expect(draft!.restrictionFilters).toEqual(filters);
    // Dos llamadas: interpretar restricciones y armar el menú
    expect(draft!.usage).toMatchObject({
      llmCalls: 2,
      inputTokens: 2000,
      outputTokens: 200,
    });
  });

  it('descarta un foodId que no está entre los candidatos', async () => {
    const menu = toMenu(FEASIBLE);
    menu.meals[1].items.push({ foodId: 99999, grams: 100 });

    const { draft } = await postDraft([json(menu)]);

    const lunch = draft!.meals.find((meal) => meal.slot === 'almuerzo');
    expect(lunch?.items.map((item) => item.foodId)).not.toContain(99999);
    expect(draft!.warnings).toContainEqual({
      code: 'unknown_food',
      slot: 'almuerzo',
      foodId: 99999,
      message: expect.stringContaining('99999'),
    });
  });

  it.each([
    [
      'gramos fuera de rango',
      JSON.stringify({
        meals: [{ slot: 'desayuno', items: [{ foodId: EGG.id, grams: 2000 }] }],
      }),
    ],
    ['texto que no es JSON', 'Lo siento, no puedo armar ese menú.'],
  ])('responde 502 si la salida no cumple el esquema (%s)', async (_, text) => {
    const { res } = await postDraft([{ text }]);

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      statusCode: 502,
      error: 'Bad Gateway',
      message:
        'El modelo devolvió una respuesta que no cumple el formato esperado',
    });
  });
});
