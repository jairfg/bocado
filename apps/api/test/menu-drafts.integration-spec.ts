import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import {
  DraftCreatedSchema,
  DraftFailureSchema,
  DraftProgressSchema,
  MenuDraftJobSchema,
  MenuDraftSchema,
  type DraftStage,
  type MealSlot,
  type MenuRequest,
} from '@bocado/shared';
import type { Queue } from 'bullmq';
import { AppModule } from '../src/app.module.js';
import { MENU_DRAFT_QUEUE } from '../src/drafts/drafts.constants.js';
import { FoodSearchService } from '../src/foods/food-search.service.js';
import { LANGUAGE_MODEL } from '../src/llm/llm.service.js';
import { createMockLanguageModel } from '../src/llm/mock-language-model.js';
import { CandidatesService } from '../src/menu/candidates.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ALL_FOODS, EGG, GREEK_YOGURT } from './fixtures/foods.js';

const REQUEST: MenuRequest = {
  kcal: 2000,
  macros: { proteinPct: 30, carbsPct: 45, fatPct: 25 },
  meals: ['desayuno', 'almuerzo', 'cena'],
  restrictions: 'no me gusta el brócoli',
};

const byId = new Map(ALL_FOODS.map((food) => [food.id, food]));

type SseEvent = { type: string; data: unknown };

// Lee un stream SSE completo (el servidor lo cierra al terminar el job)
async function readEvents(url: string): Promise<SseEvent[]> {
  const res = await fetch(url);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const text = await res.text();
  return text
    .split('\n\n')
    .map((block) => block.split('\n'))
    .filter((lines) => lines.some((line) => line.startsWith('data:')))
    .map((lines) => ({
      type:
        lines.find((line) => line.startsWith('event:'))?.slice(7) ?? 'message',
      data: JSON.parse(
        lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(6))
          .join('\n'),
      ),
    }));
}

// Redis real, worker real y QueueEvents real; el LLM es el modelo simulado
// de LLM_PROVIDER=mock y los candidatos vienen de fixtures (sin Postgres)
describe('Menús en cola con progreso por SSE (Redis real)', () => {
  let app: INestApplication;
  let queue: Queue;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(LANGUAGE_MODEL)
      .useValue(createMockLanguageModel(20))
      .overrideProvider(FoodSearchService)
      .useValue({
        searchMany: () => Promise.resolve([[GREEK_YOGURT.id, EGG.id]]),
      })
      .overrideProvider(CandidatesService)
      .useValue({
        forMeals: (slots: MealSlot[]) => {
          // Un pedido con merienda simula una falla interna con detalles
          // que no deben llegar al cliente
          if (slots.includes('merienda')) {
            return Promise.reject(new Error('secreto: conexión 10.0.0.3'));
          }
          return Promise.resolve({
            foods: ALL_FOODS,
            bySlot: slots.map((slot) => ({
              slot,
              foodIds: ALL_FOODS.map((food) => food.id),
            })),
          });
        },
        loadEligible: (ids: number[]) =>
          Promise.resolve(ids.flatMap((id) => byId.get(id) ?? [])),
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    queue = app.get(getQueueToken(MENU_DRAFT_QUEUE));
    await queue.obliterate({ force: true });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await queue?.obliterate({ force: true });
    await app?.close();
  });

  async function createDraft(body: MenuRequest): Promise<string> {
    const res = await fetch(`${baseUrl}/menu/drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(202);
    return DraftCreatedSchema.parse(await res.json()).id;
  }

  it('encola, procesa y emite el progreso por SSE hasta "completed"', async () => {
    const id = await createDraft(REQUEST);

    const events = await readEvents(`${baseUrl}/menu/drafts/${id}/events`);

    // Primero el estado actual, al final el resultado
    expect(events[0].type).toBe('status');
    MenuDraftJobSchema.parse(events[0].data);
    expect(events.at(-1)?.type).toBe('completed');
    const draft = MenuDraftSchema.parse(events.at(-1)?.data);
    expect(draft.meals).toHaveLength(3);

    // Las etapas que alcanzó a ver llegan en orden
    const order: DraftStage[] = [
      'interpreting_restrictions',
      'selecting_candidates',
      'choosing_foods',
      'optimizing_portions',
      'completed',
    ];
    const seen = events
      .filter((event) => event.type === 'progress')
      .map((event) => DraftProgressSchema.parse(event.data).stage)
      .filter((stage) => order.includes(stage));
    expect(seen).toEqual(
      [...seen].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    );
    expect(seen.at(-1)).toBe('completed');

    // El mismo resultado por GET
    const res = await fetch(`${baseUrl}/menu/drafts/${id}`);
    const job = MenuDraftJobSchema.parse(await res.json());
    expect(job.status).toBe('completed');
    expect(job.result).toEqual(draft);
  });

  it('al reconectarse a un job terminado recibe el estado y el resultado', async () => {
    const id = await createDraft({ ...REQUEST, restrictions: undefined });
    await readEvents(`${baseUrl}/menu/drafts/${id}/events`);

    const events = await readEvents(`${baseUrl}/menu/drafts/${id}/events`);

    expect(events.map((event) => event.type)).toEqual(['status', 'completed']);
    expect(MenuDraftJobSchema.parse(events[0].data).status).toBe('completed');
    MenuDraftSchema.parse(events[1].data);
  });

  it('un job que falla emite "failed" con un código y sin detalles internos', async () => {
    const id = await createDraft({ ...REQUEST, meals: ['merienda'] });

    const events = await readEvents(`${baseUrl}/menu/drafts/${id}/events`);

    const last = events.at(-1);
    expect(last?.type).toBe('failed');
    expect(DraftFailureSchema.parse(last?.data)).toEqual({
      code: 'internal_error',
      message: 'Ocurrió un error inesperado al generar el menú.',
    });
    expect(JSON.stringify(events)).not.toContain('secreto');
  });

  it('un job inexistente da 404', async () => {
    const missing = '0d6b8a8e-9a0a-4a8e-9c69-2f0d3a6c1e11';

    expect((await fetch(`${baseUrl}/menu/drafts/${missing}`)).status).toBe(404);
    expect(
      (await fetch(`${baseUrl}/menu/drafts/${missing}/events`)).status,
    ).toBe(404);
  });
});
