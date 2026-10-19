import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { DraftCreatedSchema, type MenuRequest } from '@bocado/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { MAX_PENDING_JOBS, MENU_DRAFT_QUEUE } from './drafts.constants.js';
import { MenuDraftEvents } from './menu-draft.events.js';
import { MenuDraftQueue } from './menu-draft.queue.js';
import { MenuDraftsController } from './menu-drafts.controller.js';

const VALID: MenuRequest = {
  kcal: 2000,
  macros: { proteinPct: 30, carbsPct: 45, fatPct: 25 },
  meals: ['desayuno', 'almuerzo', 'cena'],
};

// Sin Redis: la cola de BullMQ se reemplaza por un objeto que registra lo
// que se le pide
describe('MenuDraftsController', () => {
  let app: INestApplication<App>;
  let waiting: number;
  const queue = {
    getJobCounts: vi.fn(() =>
      Promise.resolve({ waiting, prioritized: 0, delayed: 0 }),
    ),
    add: vi.fn(() => Promise.resolve({})),
    getJob: vi.fn(() => Promise.resolve(undefined)),
  };

  beforeEach(async () => {
    waiting = 0;
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [MenuDraftsController],
      providers: [
        MenuDraftQueue,
        { provide: getQueueToken(MENU_DRAFT_QUEUE), useValue: queue },
        { provide: MenuDraftEvents, useValue: { watch: () => () => {} } },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('valida el body antes de encolar: 400 y nada en la cola', async () => {
    const res = await request(app.getHttpServer())
      .post('/menu/drafts')
      .send({ ...VALID, kcal: 50 });

    expect(res.status).toBe(400);
    expect(queue.getJobCounts).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('encola y responde 202 con un id no adivinable', async () => {
    const res = await request(app.getHttpServer())
      .post('/menu/drafts')
      .send(VALID);

    expect(res.status).toBe(202);
    const created = DraftCreatedSchema.parse(res.body);
    expect(queue.add).toHaveBeenCalledWith('generate', VALID, {
      jobId: created.id,
    });
  });

  it(`rechaza con 429 si ya hay ${MAX_PENDING_JOBS} menús esperando`, async () => {
    waiting = MAX_PENDING_JOBS;

    const res = await request(app.getHttpServer())
      .post('/menu/drafts')
      .send(VALID);

    expect(res.status).toBe(429);
    expect(res.body.message).toBe(
      `Hay ${MAX_PENDING_JOBS} menús esperando en la cola. Intenta de nuevo en unos minutos.`,
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it.each([
    [
      'un id que no existe',
      '/menu/drafts/0d6b8a8e-9a0a-4a8e-9c69-2f0d3a6c1e11',
    ],
    ['un id que no es UUID', '/menu/drafts/42'],
    ['los eventos de un id que no existe', '/menu/drafts/42/events'],
  ])('responde 404 para %s', async (_, path) => {
    const res = await request(app.getHttpServer()).get(path);

    expect(res.status).toBe(404);
  });
});
