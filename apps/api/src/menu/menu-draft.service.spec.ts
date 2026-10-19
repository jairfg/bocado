import { Test } from '@nestjs/testing';
import {
  MenuDraftSchema,
  NO_RESTRICTIONS,
  type DraftProgress,
  type LlmMenu,
  type MealSlot,
  type MenuDraft,
  type MenuRequest,
  type RestrictionFilters,
} from '@bocado/shared';
import type { MockLanguageModelV4 } from 'ai/test';
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
import { InvalidModelOutputException } from '../llm/provider-errors.js';
import {
  EMBEDDING_RATE_LIMITER,
  LLM_RATE_LIMITER,
  SlidingWindowLimiter,
  UNLIMITED,
} from '../llm/rate-limiter.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CandidateFood } from './candidate-selection.js';
import { CandidatesService } from './candidates.service.js';
import { optimizeMeal } from './meal-evaluation.js';
import { MenuDraftService } from './menu-draft.service.js';
import { MenuModule } from './menu.module.js';
import { nutrientsFor } from './nutrition.js';
import { portionLimits } from './portion-limits.js';

const REQUEST: MenuRequest = {
  kcal: 2000,
  macros: { proteinPct: 30, carbsPct: 45, fatPct: 25 },
  meals: ['desayuno', 'almuerzo', 'cena'],
};
const WITH_RESTRICTIONS: MenuRequest = {
  ...REQUEST,
  restrictions: 'vegetariano, no me gusta el brócoli',
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

// Desayuno sin proteína (avena y fresas) y los pasos con que el modelo lo
// corrige: buscar, evaluar con yogur y huevo, entregar
const WITHOUT_PROTEIN: Plan = {
  ...FEASIBLE,
  desayuno: [
    [OATS, 250],
    [STRAWBERRIES, 140],
  ],
};
const revisedFoods = [OATS, STRAWBERRIES, GREEK_YOGURT, EGG];
const REVISION_STEPS: MockStep[] = [
  { tool: 'searchFoods', input: { query: 'yogur griego o huevo' } },
  {
    tool: 'evaluateMeal',
    input: { items: revisedFoods.map((food) => ({ foodId: food.id })) },
  },
  {
    tool: 'submitMeal',
    input: {
      items: optimizeMeal(
        revisedFoods,
        [250, 140, 170, 100],
        TARGETS.desayuno,
      ).evaluation.items.map(({ foodId, grams }) => ({ foodId, grams })),
    },
  },
];

const FILTERS: RestrictionFilters = {
  ...NO_RESTRICTIONS,
  vegetarian: true,
  excludeTerms: ['brócoli'],
};

const json = (value: unknown): MockStep => ({ text: JSON.stringify(value) });

describe('MenuDraftService.generate', () => {
  let model: MockLanguageModelV4;
  let candidateFilters: RestrictionFilters[];

  // El módulo real, con el LLM simulado, candidatos fijos y una búsqueda
  // simulada para las revisiones: sin Gemini, Postgres ni Redis
  async function setup(
    steps: readonly MockStep[],
    llmLimiter: SlidingWindowLimiter = UNLIMITED,
  ): Promise<MenuDraftService> {
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
      .useValue(null)
      .overrideProvider(LLM_RATE_LIMITER)
      .useValue(llmLimiter)
      .overrideProvider(EMBEDDING_RATE_LIMITER)
      .useValue(UNLIMITED)
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
    return moduleRef.get(MenuDraftService);
  }

  async function generate(
    service: MenuDraftService,
    request: MenuRequest = REQUEST,
  ) {
    const events: DraftProgress[] = [];
    const draft = MenuDraftSchema.parse(
      await service.generate(request, (event) => events.push(event)),
    );
    return { draft, events, stages: events.map((event) => event.stage) };
  }

  const sum = (rows: { kcal: number }[]) =>
    rows.reduce((total, row) => total + row.kcal, 0);

  it('emite las etapas en orden', async () => {
    const service = await setup([json(toMenu(FEASIBLE))]);

    const { stages, events } = await generate(service);

    // Sin restricciones no hay etapa de interpretación
    expect(stages).toEqual([
      'selecting_candidates',
      'choosing_foods',
      'optimizing_portions',
      'completed',
    ]);
    expect(events.every((event) => event.message.length > 0)).toBe(true);
  });

  it('con restricciones y una revisión emite todas las etapas', async () => {
    const service = await setup([
      json(FILTERS),
      json(toMenu(WITHOUT_PROTEIN)),
      ...REVISION_STEPS,
    ]);

    const { stages, events } = await generate(service, WITH_RESTRICTIONS);

    expect(stages).toEqual([
      'interpreting_restrictions',
      'selecting_candidates',
      'choosing_foods',
      'optimizing_portions',
      'revising_meal',
      'completed',
    ]);
    expect(events[4]).toMatchObject({
      stage: 'revising_meal',
      slot: 'desayuno',
      message: 'Corrigiendo el desayuno',
    });
  });

  it('si el limitador frena una llamada, emite waiting_for_quota', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      // 1 llamada por minuto: la del menú espera a la de las restricciones
      const service = await setup(
        [json(FILTERS), json(toMenu(FEASIBLE))],
        new SlidingWindowLimiter(1),
      );
      const events: DraftProgress[] = [];
      const draft = service.generate(WITH_RESTRICTIONS, (event) =>
        events.push(event),
      );

      await vi.advanceTimersByTimeAsync(60_000);
      await draft;

      expect(events.map((event) => event.stage)).toEqual([
        'interpreting_restrictions',
        'selecting_candidates',
        'choosing_foods',
        'waiting_for_quota',
        'optimizing_portions',
        'completed',
      ]);
      expect(events[3]).toEqual({
        stage: 'waiting_for_quota',
        seconds: 60,
        message: 'Esperando la cuota del proveedor de IA (60 s)',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('el optimizador calcula los gramos y los totales cuadran', async () => {
    const service = await setup([json(toMenu(FEASIBLE))]);

    const { draft } = await generate(service);

    const { meals, usage } = draft;
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
    expect(draft.totals.kcal).toBeCloseTo(
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
      draft.warnings.map((warning) => [warning.code, warning.foodId]),
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
    expect(draft.restrictionFilters).toEqual(NO_RESTRICTIONS);
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
    const service = await setup([json(toMenu(exact))]);

    const { draft } = await generate(service);

    expect(draft.meals.map((meal) => meal.status)).toEqual(['ok', 'ok', 'ok']);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('revisa con herramientas la comida que el optimizador no puede ajustar', async () => {
    const service = await setup([
      json(toMenu(WITHOUT_PROTEIN)),
      ...REVISION_STEPS,
    ]);

    const { draft } = await generate(service);

    const breakfast = draft.meals[0];
    expect(breakfast.status).toBe('ok');
    expect(breakfast.revisions).toBe(1);
    expect(draft.meals.slice(1).map((meal) => meal.revisions)).toEqual([0, 0]);
    expect(
      draft.warnings.filter((warning) => warning.code !== 'portion_at_max'),
    ).toEqual([]);
    // Menú (1) + tres pasos de la revisión
    expect(draft.usage).toMatchObject({
      llmCalls: 4,
      toolSteps: 2,
      inputTokens: 4000,
      outputTokens: 400,
    });
  });

  it('interpreta las restricciones y usa los filtros para los candidatos', async () => {
    const service = await setup([json(FILTERS), json(toMenu(FEASIBLE))]);

    const { draft } = await generate(service, WITH_RESTRICTIONS);

    expect(candidateFilters).toEqual([FILTERS]);
    expect(draft.restrictionFilters).toEqual(FILTERS);
    // Dos llamadas: interpretar restricciones y armar el menú
    expect(draft.usage).toMatchObject({
      llmCalls: 2,
      inputTokens: 2000,
      outputTokens: 200,
    });
  });

  it('descarta un foodId que no está entre los candidatos', async () => {
    const menu = toMenu(FEASIBLE);
    menu.meals[1].items.push({ foodId: 99999, grams: 100 });
    const service = await setup([json(menu)]);

    const { draft }: { draft: MenuDraft } = await generate(service);

    const lunch = draft.meals.find((meal) => meal.slot === 'almuerzo');
    expect(lunch?.items.map((item) => item.foodId)).not.toContain(99999);
    expect(draft.warnings).toContainEqual({
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
  ])(
    'falla con InvalidModelOutputException si la salida no cumple el esquema (%s)',
    async (_, text) => {
      const service = await setup([{ text }]);

      await expect(service.generate(REQUEST)).rejects.toBeInstanceOf(
        InvalidModelOutputException,
      );
    },
  );
});
