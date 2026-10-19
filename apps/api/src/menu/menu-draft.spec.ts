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
import { MockLanguageModelV4 } from 'ai/test';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { EMBEDDING_MODEL } from '../llm/embedding.service.js';
import { LANGUAGE_MODEL } from '../llm/llm.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CandidateFood } from './candidate-selection.js';
import { CandidatesService } from './candidates.service.js';
import { MenuModule } from './menu.module.js';

function food(
  id: number,
  name: string,
  category: string,
  [kcal, protein, carbs, fat]: [number, number, number, number],
): CandidateFood {
  return {
    id,
    name,
    category,
    kcalPer100g: kcal,
    proteinGPer100g: protein,
    carbsGPer100g: carbs,
    fatGPer100g: fat,
  };
}

// Por 100 g. El salvado declara 40 kcal y con 4-4-9 daría 66.2: sirve para
// comprobar que se usan las kcal declaradas.
const CANDIDATES = [
  food(10, 'Huevo entero, cocido, duro', 'eggs', [155, 12.6, 1.12, 10.6]),
  food(20, 'Pan integral', 'cereals', [252, 12.4, 42.7, 3.5]),
  food(30, 'Salvado de avena, cocido', 'cereals', [40, 3.21, 11.4, 0.86]),
  food(40, 'Pechuga de pollo, asada', 'meats', [165, 31, 0, 3.57]),
  food(50, 'Arroz blanco, cocido', 'cereals', [130, 2.69, 28.2, 0.28]),
  food(60, 'Brócoli, cocido', 'vegetables', [35, 2.38, 7.18, 0.41]),
];

const REQUEST: MenuRequest = {
  kcal: 2000,
  macros: { proteinPct: 30, carbsPct: 45, fatPct: 25 },
  meals: ['desayuno', 'almuerzo', 'cena'],
};

// Una respuesta por llamada, en orden
function mockModel(texts: readonly string[]): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: texts.map((text) => ({
      content: [{ type: 'text' as const, text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: {
          total: 1200,
          noCache: 1200,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 150, text: 150, reasoning: undefined },
      },
      warnings: [],
    })),
  });
}

describe('POST /menu/draft', () => {
  let app: INestApplication<App> | undefined;
  let model: MockLanguageModelV4;
  let candidateFilters: RestrictionFilters[];

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  // El módulo real, con el LLM simulado y candidatos fijos en lugar de la
  // búsqueda: no hay llamadas a Gemini ni a Postgres.
  async function postDraft(
    modelOutputs: string | readonly string[],
    body: MenuRequest = REQUEST,
  ) {
    model = mockModel(
      typeof modelOutputs === 'string' ? [modelOutputs] : modelOutputs,
    );
    candidateFilters = [];
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, MenuModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(LANGUAGE_MODEL)
      .useValue(model)
      // No se usa: CandidatesService, que haría la búsqueda, está simulado
      .overrideProvider(EMBEDDING_MODEL)
      .useValue({})
      .overrideProvider(CandidatesService)
      .useValue({
        forMeals: (slots: MealSlot[], filters: RestrictionFilters) => {
          candidateFilters.push(filters);
          return Promise.resolve({
            foods: CANDIDATES,
            bySlot: slots.map((slot) => ({
              slot,
              foodIds: CANDIDATES.map((f) => f.id),
            })),
          });
        },
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    return request(app.getHttpServer()).post('/menu/draft').send(body);
  }

  function sumOf(rows: { kcal: number; proteinG: number }[]) {
    return {
      kcal: rows.reduce((sum, row) => sum + row.kcal, 0),
      proteinG: rows.reduce((sum, row) => sum + row.proteinG, 0),
    };
  }

  it('transforma una respuesta válida y los totales cuadran', async () => {
    const llmMenu: LlmMenu = {
      meals: [
        {
          slot: 'desayuno',
          items: [
            { foodId: 10, grams: 100 },
            { foodId: 20, grams: 80 },
            { foodId: 30, grams: 200 },
          ],
        },
        {
          slot: 'almuerzo',
          items: [
            { foodId: 40, grams: 150 },
            { foodId: 50, grams: 200 },
            { foodId: 60, grams: 100 },
          ],
        },
        {
          slot: 'cena',
          items: [
            { foodId: 40, grams: 120 },
            { foodId: 60, grams: 150 },
          ],
        },
      ],
    };

    const res = await postDraft(JSON.stringify(llmMenu));

    expect(res.status).toBe(200);
    const draft: MenuDraft = MenuDraftSchema.parse(res.body);
    const [breakfast] = draft.meals;

    // 200 g de salvado: 40 × 2 = 80 kcal declaradas, no 132.4 con 4-4-9
    expect(breakfast.items[2]).toEqual({
      foodId: 30,
      name: 'Salvado de avena, cocido',
      grams: 200,
      kcal: 80,
      proteinG: 6.4,
      carbsG: 22.8,
      fatG: 1.7,
    });
    // 155 + 201.6 + 80 kcal frente a una meta de 625
    expect(breakfast.target).toEqual({
      kcal: 625,
      proteinG: 46.9,
      carbsG: 70.3,
      fatG: 17.4,
    });
    expect(breakfast.totals).toEqual({
      kcal: 436.6,
      proteinG: 28.9,
      carbsG: 58.1,
      fatG: 15.1,
    });
    expect(breakfast.deviationPct.kcal).toBe(-30.1);

    for (const meal of draft.meals) {
      const sum = sumOf(meal.items);
      expect(meal.totals.kcal).toBeCloseTo(sum.kcal, 5);
      expect(meal.totals.proteinG).toBeCloseTo(sum.proteinG, 5);
    }
    const daySum = sumOf(draft.meals.map((meal) => meal.totals));
    expect(draft.totals.kcal).toBeCloseTo(daySum.kcal, 5);
    expect(draft.totals.proteinG).toBeCloseTo(daySum.proteinG, 5);

    expect(draft.warnings).toEqual([]);
    expect(draft.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 150,
      latencyMs: expect.any(Number),
    });
    // Sin restricciones no se llama al LLM para interpretarlas
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(draft.restrictionFilters).toEqual(NO_RESTRICTIONS);
    expect(draft.candidates.map((meal) => meal.slot)).toEqual(REQUEST.meals);
  });

  it('interpreta las restricciones y usa los filtros para los candidatos', async () => {
    const filters: RestrictionFilters = {
      ...NO_RESTRICTIONS,
      vegetarian: true,
      excludeTerms: ['brócoli'],
    };
    const llmMenu: LlmMenu = {
      meals: [
        { slot: 'desayuno', items: [{ foodId: 10, grams: 100 }] },
        { slot: 'almuerzo', items: [{ foodId: 50, grams: 200 }] },
        { slot: 'cena', items: [{ foodId: 20, grams: 100 }] },
      ],
    };

    const res = await postDraft(
      [JSON.stringify(filters), JSON.stringify(llmMenu)],
      { ...REQUEST, restrictions: 'vegetariano, no me gusta el brócoli' },
    );

    expect(res.status).toBe(200);
    const draft = MenuDraftSchema.parse(res.body);
    expect(candidateFilters).toEqual([filters]);
    expect(draft.restrictionFilters).toEqual(filters);
    // Dos llamadas: interpretar restricciones y armar el menú
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(draft.usage).toMatchObject({ inputTokens: 2400, outputTokens: 300 });
  });

  it('descarta un foodId que no está entre los candidatos', async () => {
    const llmMenu: LlmMenu = {
      meals: [
        { slot: 'desayuno', items: [{ foodId: 10, grams: 100 }] },
        {
          slot: 'almuerzo',
          items: [
            { foodId: 40, grams: 150 },
            { foodId: 99999, grams: 100 },
          ],
        },
        { slot: 'cena', items: [{ foodId: 60, grams: 150 }] },
      ],
    };

    const res = await postDraft(JSON.stringify(llmMenu));

    expect(res.status).toBe(200);
    const draft = MenuDraftSchema.parse(res.body);
    const lunch = draft.meals.find((meal) => meal.slot === 'almuerzo');
    expect(lunch?.items.map((item) => item.foodId)).toEqual([40]);
    expect(lunch?.totals.kcal).toBe(247.5);
    expect(draft.warnings).toEqual([
      {
        code: 'unknown_food',
        slot: 'almuerzo',
        foodId: 99999,
        message: expect.stringContaining('99999'),
      },
    ]);
  });

  it.each([
    [
      'gramos fuera de rango',
      JSON.stringify({
        meals: [{ slot: 'desayuno', items: [{ foodId: 10, grams: 2000 }] }],
      }),
    ],
    ['texto que no es JSON', 'Lo siento, no puedo armar ese menú.'],
  ])(
    'responde 502 si la salida no cumple el esquema (%s)',
    async (_, output) => {
      const res = await postDraft(output);

      expect(res.status).toBe(502);
      expect(res.body).toEqual({
        statusCode: 502,
        error: 'Bad Gateway',
        message:
          'El modelo devolvió una respuesta que no cumple el formato esperado',
      });
    },
  );
});
