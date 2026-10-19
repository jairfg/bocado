import {
  OnQueueEvent,
  QueueEventsHost,
  QueueEventsListener,
} from '@nestjs/bullmq';
import { MENU_DRAFT_QUEUE } from './drafts.constants.js';

export type DraftQueueEvent =
  | { type: 'progress'; data: unknown }
  | { type: 'completed'; result: unknown }
  | { type: 'failed'; reason: string };

type Listener = (event: DraftQueueEvent) => void;

// Escucha los eventos de la cola con QueueEvents (un stream de Redis, así
// que no se pierden si la conexión se corta un momento) y los reparte a
// quien esté siguiendo cada job. Una sola suscripción a Redis por proceso,
// sin importar cuántos clientes SSE haya conectados.
@QueueEventsListener(MENU_DRAFT_QUEUE)
export class MenuDraftEvents extends QueueEventsHost {
  private readonly listeners = new Map<string, Set<Listener>>();

  // Devuelve la función que libera la suscripción
  watch(jobId: string, listener: Listener): () => void {
    const forJob = this.listeners.get(jobId) ?? new Set<Listener>();
    forJob.add(listener);
    this.listeners.set(jobId, forJob);
    return () => {
      forJob.delete(listener);
      if (forJob.size === 0) this.listeners.delete(jobId);
    };
  }

  @OnQueueEvent('progress')
  onProgress({ jobId, data }: { jobId: string; data: unknown }): void {
    this.emit(jobId, { type: 'progress', data });
  }

  @OnQueueEvent('completed')
  onCompleted({ jobId, returnvalue }: { jobId: string; returnvalue: unknown }) {
    this.emit(jobId, { type: 'completed', result: returnvalue });
  }

  @OnQueueEvent('failed')
  onFailed({ jobId, failedReason }: { jobId: string; failedReason: string }) {
    this.emit(jobId, { type: 'failed', reason: failedReason });
  }

  private emit(jobId: string, event: DraftQueueEvent): void {
    for (const listener of this.listeners.get(jobId) ?? []) listener(event);
  }
}
