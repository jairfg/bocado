import type {
  DraftFailure,
  DraftProgress,
  DraftStage,
  DraftStatus,
  MealSlot,
  MenuDraft,
  MenuDraftJob,
} from '@bocado/shared';

// Estado de la página de progreso como función pura: estado + evento →
// nuevo estado. No depende del navegador (ni de EventSource ni del reloj:
// la hora llega en el evento), así que se prueba sin DOM.

// Etapas de la línea de tiempo, en orden. waiting_for_quota no es una
// etapa: es una pausa dentro de la que esté en curso. revising_meal es una
// sub-etapa de optimizing_portions.
export const TIMELINE_STAGES = [
  'interpreting_restrictions',
  'selecting_candidates',
  'choosing_foods',
  'optimizing_portions',
  'completed',
] as const satisfies readonly DraftStage[];

export type TimelineStage = (typeof TIMELINE_STAGES)[number];
export type StepState = 'pending' | 'active' | 'done';

export type DraftState = {
  // missing: el job desapareció (expiró) mientras se seguía
  status: DraftStatus | 'missing';
  // Sin restricciones no hay etapa de interpretación
  hasRestrictions: boolean;
  // Índice de la etapa más avanzada; -1 en cola
  reached: number;
  revisions: { slot: MealSlot; state: 'active' | 'done' }[];
  waiting: { seconds: number; at: number } | null;
  // Último mensaje, para el aria-live
  announcement: string;
  result: MenuDraft | null;
  error: DraftFailure | null;
  connection: 'connecting' | 'open' | 'reconnecting';
};

export type DraftAction =
  | { type: 'status'; job: MenuDraftJob; at: number }
  | { type: 'progress'; event: DraftProgress; at: number }
  | { type: 'completed'; result: MenuDraft }
  | { type: 'failed'; error: DraftFailure }
  | { type: 'connection'; state: 'open' | 'reconnecting' }
  | { type: 'missing' };

const COMPLETED_INDEX = TIMELINE_STAGES.indexOf('completed');

export const isTerminal = (state: DraftState) =>
  state.status === 'completed' ||
  state.status === 'failed' ||
  state.status === 'missing';

const stageIndex = (stage: DraftStage): number =>
  stage === 'revising_meal'
    ? TIMELINE_STAGES.indexOf('optimizing_portions')
    : TIMELINE_STAGES.indexOf(stage as TimelineStage);

function applyProgress(
  state: DraftState,
  event: DraftProgress,
  at: number,
): DraftState {
  if (event.stage === 'waiting_for_quota') {
    return {
      ...state,
      status: 'active',
      waiting: { seconds: event.seconds, at },
      announcement: event.message,
    };
  }

  // Un evento de una etapa anterior a la alcanzada (por ejemplo, uno que
  // quedó en espera mientras llegaba el estado al reconectar) no hace
  // retroceder la línea de tiempo
  const index = stageIndex(event.stage);
  if (index < state.reached) return state;

  let revisions = state.revisions;
  if (event.stage === 'revising_meal') {
    revisions = [
      ...state.revisions
        .filter((revision) => revision.slot !== event.slot)
        .map((revision) => ({ ...revision, state: 'done' as const })),
      { slot: event.slot, state: 'active' },
    ];
  } else if (index > stageIndex('revising_meal')) {
    revisions = revisions.map((revision) => ({ ...revision, state: 'done' }));
  }

  return {
    ...state,
    status: 'active',
    reached: index,
    revisions,
    waiting: null,
    announcement: event.message,
  };
}

function complete(state: DraftState, result: MenuDraft): DraftState {
  return {
    ...state,
    status: 'completed',
    reached: COMPLETED_INDEX,
    revisions: state.revisions.map((r) => ({ ...r, state: 'done' })),
    waiting: null,
    result,
    announcement: 'Menú listo',
  };
}

export function draftReducer(
  state: DraftState,
  action: DraftAction,
): DraftState {
  // Un menú terminado no cambia más, llegue lo que llegue
  if (isTerminal(state)) return state;

  switch (action.type) {
    case 'status': {
      const { job } = action;
      const next = {
        ...state,
        hasRestrictions: Boolean(job.request.restrictions?.trim()),
      };
      if (job.status === 'completed' && job.result) {
        return complete(next, job.result);
      }
      if (job.status === 'failed' && job.error) {
        return {
          ...next,
          status: 'failed',
          error: job.error,
          waiting: null,
          announcement: job.error.message,
        };
      }
      if (job.status === 'active' && job.progress) {
        return applyProgress(next, job.progress, action.at);
      }
      return { ...next, status: job.status };
    }
    case 'progress':
      return applyProgress(state, action.event, action.at);
    case 'completed':
      return complete(state, action.result);
    case 'failed':
      return {
        ...state,
        status: 'failed',
        error: action.error,
        waiting: null,
        announcement: action.error.message,
      };
    case 'connection':
      return { ...state, connection: action.state };
    case 'missing':
      return { ...state, status: 'missing' };
  }
}

export function initialDraftState(job: MenuDraftJob, at: number): DraftState {
  return draftReducer(
    {
      status: 'queued',
      hasRestrictions: false,
      reached: -1,
      revisions: [],
      waiting: null,
      announcement: 'Tu menú está en cola',
      result: null,
      error: null,
      connection: 'connecting',
    },
    { type: 'status', job, at },
  );
}

// Estado de cada etapa visible, derivado del estado
export function timeline(
  state: DraftState,
): { stage: TimelineStage; state: StepState }[] {
  return TIMELINE_STAGES.filter(
    (stage) => stage !== 'interpreting_restrictions' || state.hasRestrictions,
  ).map((stage) => {
    const index = TIMELINE_STAGES.indexOf(stage);
    const step: StepState =
      state.status === 'completed' || index < state.reached
        ? 'done'
        : index === state.reached
          ? 'active'
          : 'pending';
    return { stage, state: step };
  });
}

// Segundos que faltan de la espera por cuota (para la cuenta regresiva)
export function remainingWait(state: DraftState, now: number): number | null {
  if (!state.waiting) return null;
  // Un reloj anterior al evento cuenta como 0 s transcurridos
  const elapsed = Math.max(0, Math.floor((now - state.waiting.at) / 1000));
  return Math.max(0, state.waiting.seconds - elapsed);
}
