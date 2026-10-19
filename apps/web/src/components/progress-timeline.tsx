import type { MealSlot } from '@bocado/shared';
import { Check, Hourglass } from 'lucide-react';
import type { StepState, TimelineStage } from '@/lib/draft-reducer';
import { MEAL_WITH_ARTICLE } from '@/lib/labels';

const STAGE_LABELS: Record<TimelineStage, string> = {
  interpreting_restrictions: 'Interpretar tus restricciones',
  selecting_candidates: 'Buscar alimentos candidatos',
  choosing_foods: 'Elegir los alimentos de cada comida',
  optimizing_portions: 'Ajustar las porciones',
  completed: 'Menú listo',
};

const STATE_LABELS: Record<StepState, string> = {
  pending: 'pendiente',
  active: 'en curso',
  done: 'completada',
};

function StepIcon({ state }: { state: StepState | 'revision-active' }) {
  if (state === 'done') {
    return (
      <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-4" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (state === 'active' || state === 'revision-active') {
    return (
      <span className="relative flex size-7 items-center justify-center rounded-full border-2 border-primary bg-primary-soft">
        <span className="absolute inset-0 rounded-full border-2 border-primary/40 motion-safe:animate-ping" />
        <span className="size-2.5 rounded-full bg-primary" />
      </span>
    );
  }
  return (
    <span className="flex size-7 items-center justify-center rounded-full border-2 border-border bg-surface" />
  );
}

type Props = {
  steps: { stage: TimelineStage; state: StepState }[];
  revisions: { slot: MealSlot; state: 'active' | 'done' }[];
  // Segundos de espera por cuota que quedan, si hay una pausa
  waitSeconds: number | null;
};

// Sin estado propio: solo dibuja lo que calcula el reducer
export function ProgressTimeline({ steps, revisions, waitSeconds }: Props) {
  return (
    <ol className="space-y-1">
      {steps.map(({ stage, state }, index) => (
        <li key={stage} className="relative flex gap-3.5 pb-5 last:pb-0">
          {index < steps.length - 1 && (
            <span
              className={`absolute left-3.5 top-7 -ml-px h-[calc(100%-1.75rem)] w-0.5 ${
                state === 'done' ? 'bg-primary' : 'bg-border'
              }`}
              aria-hidden="true"
            />
          )}
          <StepIcon state={state} />
          <div className="min-w-0 pt-0.5">
            <p
              className={
                state === 'pending'
                  ? 'text-muted'
                  : state === 'active'
                    ? 'font-semibold text-foreground'
                    : 'text-foreground'
              }
            >
              {STAGE_LABELS[stage]}
              <span className="sr-only">: {STATE_LABELS[state]}</span>
            </p>

            {stage === 'optimizing_portions' && revisions.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {revisions.map((revision) => (
                  <li
                    key={revision.slot}
                    className="flex items-center gap-2 text-sm text-muted"
                  >
                    {revision.state === 'done' ? (
                      <Check
                        className="size-4 text-primary"
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
                    )}
                    Revisando {MEAL_WITH_ARTICLE[revision.slot]}
                    {revision.state === 'done' && (
                      <span className="sr-only">: completada</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {state === 'active' && waitSeconds !== null && (
              <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-warn-soft px-3 py-1 text-sm text-warn">
                <Hourglass className="size-4" aria-hidden="true" />
                <span className="tabular-nums">
                  Esperando la cuota del proveedor: {waitSeconds} s
                </span>
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
