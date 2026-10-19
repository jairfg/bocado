import type { DraftProgress, MenuDraft, MenuDraftJob } from '@bocado/shared';
import { describe, expect, it } from 'vitest';
import {
  draftReducer,
  initialDraftState,
  remainingWait,
  timeline,
  type DraftAction,
  type DraftState,
} from './draft-reducer';

const ID = '0d6b8a8e-9a0a-4a8e-9c69-2f0d3a6c1e11';
const REQUEST = {
  kcal: 2000,
  macros: { proteinPct: 30, carbsPct: 45, fatPct: 25 },
  meals: ['desayuno', 'almuerzo', 'cena'] as MenuDraftJob['request']['meals'],
  restrictions: 'vegetariano',
};
// El reducer no mira el contenido del menú
const RESULT = { meals: [] } as unknown as MenuDraft;

const job = (patch: Partial<MenuDraftJob> = {}): MenuDraftJob => ({
  id: ID,
  status: 'queued',
  request: REQUEST,
  progress: null,
  result: null,
  error: null,
  ...patch,
});

const progress = (event: DraftProgress, at = 0): DraftAction => ({
  type: 'progress',
  event,
  at,
});

type SimpleStage = Exclude<
  DraftProgress['stage'],
  'revising_meal' | 'waiting_for_quota'
>;
const stage = (name: SimpleStage, message: string = name): DraftProgress =>
  ({
    stage: name,
    message,
  }) as DraftProgress;

const run = (state: DraftState, actions: DraftAction[]) =>
  actions.reduce(draftReducer, state);

const steps = (state: DraftState) =>
  timeline(state).map(({ stage, state }) => `${stage}:${state}`);

describe('draftReducer', () => {
  it('sigue la secuencia normal hasta el resultado', () => {
    let state = initialDraftState(job(), 0);
    expect(state.status).toBe('queued');
    expect(steps(state)).toEqual([
      'interpreting_restrictions:pending',
      'selecting_candidates:pending',
      'choosing_foods:pending',
      'optimizing_portions:pending',
      'completed:pending',
    ]);

    state = run(state, [
      progress(stage('interpreting_restrictions')),
      progress(stage('selecting_candidates')),
      progress(stage('choosing_foods', 'Eligiendo los alimentos')),
    ]);
    expect(steps(state)).toEqual([
      'interpreting_restrictions:done',
      'selecting_candidates:done',
      'choosing_foods:active',
      'optimizing_portions:pending',
      'completed:pending',
    ]);
    expect(state.announcement).toBe('Eligiendo los alimentos');

    state = run(state, [
      progress(stage('optimizing_portions')),
      progress(stage('completed')),
      { type: 'completed', result: RESULT },
    ]);
    expect(state.status).toBe('completed');
    expect(state.result).toBe(RESULT);
    expect(steps(state).every((step) => step.endsWith(':done'))).toBe(true);
  });

  it('sin restricciones no muestra la etapa de interpretación', () => {
    const state = initialDraftState(
      job({ request: { ...REQUEST, restrictions: undefined } }),
      0,
    );

    expect(timeline(state).map((step) => step.stage)).not.toContain(
      'interpreting_restrictions',
    );
  });

  it('waiting_for_quota pausa la etapa en curso con cuenta regresiva', () => {
    let state = run(initialDraftState(job(), 0), [
      progress(stage('choosing_foods')),
      progress(
        {
          stage: 'waiting_for_quota',
          seconds: 36,
          message: 'Esperando la cuota del proveedor de IA (36 s)',
        },
        10_000,
      ),
    ]);

    // La etapa no cambia: sigue eligiendo alimentos, ahora en pausa
    expect(steps(state)).toContain('choosing_foods:active');
    expect(remainingWait(state, 10_000)).toBe(36);
    expect(remainingWait(state, 20_500)).toBe(26);
    expect(remainingWait(state, 99_000)).toBe(0);

    state = draftReducer(state, progress(stage('optimizing_portions')));
    expect(state.waiting).toBeNull();
    expect(remainingWait(state, 20_000)).toBeNull();
  });

  it('muestra cada revisión como sub-etapa de las porciones', () => {
    const revising = (slot: 'desayuno' | 'almuerzo') =>
      progress({ stage: 'revising_meal', slot, message: `Revisando ${slot}` });

    let state = run(initialDraftState(job(), 0), [
      progress(stage('optimizing_portions')),
      revising('desayuno'),
    ]);
    expect(state.revisions).toEqual([{ slot: 'desayuno', state: 'active' }]);
    expect(steps(state)).toContain('optimizing_portions:active');

    state = draftReducer(state, revising('almuerzo'));
    expect(state.revisions).toEqual([
      { slot: 'desayuno', state: 'done' },
      { slot: 'almuerzo', state: 'active' },
    ]);

    state = draftReducer(state, progress(stage('completed')));
    expect(state.revisions.every((r) => r.state === 'done')).toBe(true);
  });

  it('una falla termina el seguimiento y guarda el código', () => {
    const error = {
      code: 'timeout' as const,
      message: 'El menú tardó demasiado en generarse. Intenta de nuevo.',
    };

    let state = run(initialDraftState(job(), 0), [
      progress(stage('choosing_foods')),
      { type: 'failed', error },
    ]);
    expect(state.status).toBe('failed');
    expect(state.error).toEqual(error);
    expect(state.announcement).toBe(error.message);

    // Lo que llegue después no cambia nada
    state = draftReducer(state, progress(stage('optimizing_portions')));
    expect(state.status).toBe('failed');
  });

  it('al reconectar con un job ya terminado muestra el resultado', () => {
    let state = run(initialDraftState(job(), 0), [
      progress(stage('choosing_foods')),
      { type: 'connection', state: 'reconnecting' },
    ]);
    expect(state.connection).toBe('reconnecting');

    // El SSE envía primero el estado actual: el job terminó mientras tanto
    state = draftReducer(state, {
      type: 'status',
      job: job({ status: 'completed', result: RESULT }),
      at: 50_000,
    });
    expect(state.status).toBe('completed');
    expect(state.result).toBe(RESULT);
  });

  it('un evento atrasado no hace retroceder la línea de tiempo', () => {
    // Al reconectar, el estado ya dice "eligiendo alimentos" y luego llega
    // un evento anterior que había quedado en espera
    const state = run(initialDraftState(job(), 0), [
      {
        type: 'status',
        job: job({ status: 'active', progress: stage('choosing_foods') }),
        at: 0,
      },
      progress(stage('selecting_candidates')),
    ]);

    expect(steps(state)).toContain('choosing_foods:active');
  });

  it('un job que expiró mientras se seguía queda como inexistente', () => {
    const state = draftReducer(initialDraftState(job(), 0), {
      type: 'missing',
    });

    expect(state.status).toBe('missing');
  });
});
