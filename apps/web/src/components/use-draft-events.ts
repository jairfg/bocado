'use client';

import {
  DraftFailureSchema,
  DraftProgressSchema,
  MenuDraftJobSchema,
  MenuDraftSchema,
} from '@bocado/shared';
import { useEffect, type Dispatch } from 'react';
import { ApiError, draftEventsUrl, getDraft } from '@/lib/api';
import type { DraftAction } from '@/lib/draft-reducer';

const MAX_BACKOFF_MS = 15_000;

// Sigue el SSE de un menú y traduce cada evento a una acción del reducer.
//
// Reconexión, en dos niveles:
// 1. Si se corta la red, EventSource reintenta solo. Como la API envía
//    primero el estado actual en cada conexión, no se pierde nada.
// 2. Si el navegador se rinde (la API respondió 404 o 5xx), se consulta el
//    estado por GET: si el menú ya no existe, se avisa; si no, se vuelve a
//    conectar esperando cada vez más (1, 2, 4… hasta 15 s).
export function useDraftEvents(
  id: string,
  enabled: boolean,
  dispatch: Dispatch<DraftAction>,
) {
  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;

    const stop = () => {
      stopped = true;
      source?.close();
      clearTimeout(retryTimer);
    };

    const scheduleRetry = () => {
      const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
      attempt += 1;
      retryTimer = setTimeout(checkAndReconnect, delay);
    };

    const checkAndReconnect = async () => {
      if (stopped) return;
      try {
        const job = await getDraft(id);
        dispatch({ type: 'status', job, at: Date.now() });
        if (job.status === 'completed' || job.status === 'failed') return;
        connect();
      } catch (error) {
        if (error instanceof ApiError && error.kind === 'not_found') {
          dispatch({ type: 'missing' });
          return;
        }
        scheduleRetry();
      }
    };

    // Un evento mal formado se ignora: el siguiente "status" lo corrige
    const on = <T>(
      name: string,
      schema: {
        safeParse(
          data: unknown,
        ): { success: true; data: T } | { success: false };
      },
      handle: (data: T) => void,
    ) => {
      source?.addEventListener(name, (event) => {
        let raw: unknown;
        try {
          raw = JSON.parse((event as MessageEvent<string>).data);
        } catch {
          return;
        }
        const parsed = schema.safeParse(raw);
        if (parsed.success) handle(parsed.data);
      });
    };

    function connect() {
      if (stopped) return;
      source = new EventSource(draftEventsUrl(id));

      source.addEventListener('open', () => {
        attempt = 0;
        dispatch({ type: 'connection', state: 'open' });
      });
      on('status', MenuDraftJobSchema, (job) =>
        dispatch({ type: 'status', job, at: Date.now() }),
      );
      on('progress', DraftProgressSchema, (event) =>
        dispatch({ type: 'progress', event, at: Date.now() }),
      );
      // Al terminar, la API cierra el stream; si no se cierra aquí,
      // EventSource lo tomaría como un corte y volvería a conectar
      on('completed', MenuDraftSchema, (result) => {
        stop();
        dispatch({ type: 'completed', result });
      });
      on('failed', DraftFailureSchema, (error) => {
        stop();
        dispatch({ type: 'failed', error });
      });

      source.addEventListener('error', () => {
        if (stopped || !source) return;
        dispatch({ type: 'connection', state: 'reconnecting' });
        if (source.readyState === EventSource.CLOSED) {
          scheduleRetry();
        }
      });
    }

    connect();
    return stop;
  }, [id, enabled, dispatch]);
}
