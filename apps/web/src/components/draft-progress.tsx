'use client';

import type { MenuDraftJob } from '@bocado/shared';
import { WifiOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useReducer, useState } from 'react';
import {
  draftReducer,
  initialDraftState,
  isTerminal,
  remainingWait,
  timeline,
} from '@/lib/draft-reducer';
import { MEAL_LABELS } from '@/lib/labels';
import { ProgressTimeline } from './progress-timeline';
import { useDraftEvents } from './use-draft-events';

// Componente de cliente: mantiene una conexión SSE abierta y un reloj para
// la cuenta regresiva. Cuando el menú termina (o falla), pide al servidor
// que vuelva a renderizar la página: el resultado lo dibuja un componente
// de servidor, igual que al recargar o abrir un enlace compartido.
export function DraftProgress({
  id,
  initialJob,
}: {
  id: string;
  initialJob: MenuDraftJob;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(draftReducer, initialJob, (job) =>
    initialDraftState(job, Date.now()),
  );
  const terminal = isTerminal(state);
  useDraftEvents(id, !terminal, dispatch);

  useEffect(() => {
    if (terminal) router.refresh();
  }, [terminal, router]);

  // Reloj de la cuenta regresiva, solo mientras hay una espera por cuota.
  // Sin tic todavía se usa el instante del evento: el servidor y el
  // navegador dibujan lo mismo al hidratar.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!state.waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.waiting]);
  const waitSeconds = state.waiting
    ? remainingWait(state, now ?? state.waiting.at)
    : null;

  const { request } = initialJob;
  const meals = request.meals.map((slot) => MEAL_LABELS[slot]).join(', ');

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-primary">
          {state.status === 'queued' ? 'En cola' : 'Preparando tu menú'}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {request.kcal.toLocaleString('es-PE')} kcal · {meals}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Proteína {request.macros.proteinPct} % · Carbohidratos{' '}
          {request.macros.carbsPct} % · Grasa {request.macros.fatPct} %
        </p>

        <div className="mt-7">
          <ProgressTimeline
            steps={timeline(state)}
            revisions={state.revisions}
            waitSeconds={waitSeconds}
          />
        </div>

        {state.connection === 'reconnecting' && !terminal && (
          <p className="mt-6 flex items-center gap-2 text-sm text-warn">
            <WifiOff className="size-4" aria-hidden="true" />
            Se perdió la conexión. Reconectando…
          </p>
        )}
      </div>

      <p className="mt-4 text-center text-sm text-muted">
        Puedes cerrar esta página: el menú se sigue generando y queda disponible
        en este enlace por 24 horas.
      </p>

      {/* Lectores de pantalla: cada cambio de etapa se anuncia */}
      <p className="sr-only" aria-live="polite" role="status">
        {state.announcement}
      </p>
    </div>
  );
}
