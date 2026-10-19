import { randomUUID } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  type MessageEvent,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  DraftProgressSchema,
  type DraftCreated,
  type DraftStatus,
  type MenuDraft,
  type MenuDraftJob,
  type MenuRequest,
} from '@bocado/shared';
import type { Job, JobState, Queue } from 'bullmq';
import { Observable } from 'rxjs';
import { failureFromReason } from './draft-failure.js';
import {
  KEEP_ALIVE_MS,
  MAX_PENDING_JOBS,
  MENU_DRAFT_QUEUE,
} from './drafts.constants.js';
import { MenuDraftEvents, type DraftQueueEvent } from './menu-draft.events.js';

export type DraftQueue = Queue<MenuRequest, MenuDraft>;

const STATUS: Record<JobState | 'unknown', DraftStatus | null> = {
  waiting: 'queued',
  'waiting-children': 'queued',
  prioritized: 'queued',
  delayed: 'queued',
  active: 'active',
  completed: 'completed',
  failed: 'failed',
  unknown: null,
};

function toDraftJob(
  job: Job<MenuRequest, MenuDraft>,
  status: DraftStatus,
): MenuDraftJob {
  const progress = DraftProgressSchema.safeParse(job.progress);
  return {
    id: job.id!,
    status,
    request: job.data,
    progress: progress.success ? progress.data : null,
    result: status === 'completed' ? job.returnvalue : null,
    error: status === 'failed' ? failureFromReason(job.failedReason) : null,
  };
}

@Injectable()
export class MenuDraftQueue {
  constructor(
    @InjectQueue(MENU_DRAFT_QUEUE) private readonly queue: DraftQueue,
    private readonly events: MenuDraftEvents,
  ) {}

  // Rechaza si ya hay demasiados esperando: protege la cuota de abusos.
  // Contar y agregar no es atómico, así que con muchas solicitudes a la vez
  // podría pasarse por poco; como protección basta.
  async enqueue(request: MenuRequest): Promise<DraftCreated> {
    const counts = await this.queue.getJobCounts(
      'waiting',
      'prioritized',
      'delayed',
    );
    const pending = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (pending >= MAX_PENDING_JOBS) {
      throw new HttpException(
        `Hay ${pending} menús esperando en la cola. Intenta de nuevo en unos minutos.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // UUID y no el id autoincremental de BullMQ: quien conoce un id puede
    // leer ese menú, así que no debe poder adivinar los de otros
    const id = randomUUID();
    await this.queue.add('generate', request, { jobId: id });
    return { id, status: 'queued' };
  }

  async find(id: string): Promise<MenuDraftJob | null> {
    const job = await this.queue.getJob(id);
    if (!job) return null;
    const status = STATUS[await job.getState()];
    return status ? toDraftJob(job, status) : null;
  }

  // Eventos SSE de un job: primero su estado actual (si ya terminó, el
  // resultado y fin), luego el progreso hasta "completed" o "failed". Un
  // cliente que se reconecta no pierde nada.
  stream(id: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const deliver = (event: DraftQueueEvent) => {
        if (event.type === 'progress') {
          const progress = DraftProgressSchema.safeParse(event.data);
          if (progress.success) {
            subscriber.next({ type: 'progress', data: progress.data });
          }
          return;
        }
        subscriber.next(
          event.type === 'completed'
            ? { type: 'completed', data: event.result as object }
            : { type: 'failed', data: failureFromReason(event.reason) },
        );
        subscriber.complete();
      };

      // Se suscribe antes de leer el estado: lo que pase entre medio queda
      // en espera y se entrega después del estado
      let buffered: DraftQueueEvent[] | null = [];
      const unwatch = this.events.watch(id, (event) =>
        buffered ? buffered.push(event) : deliver(event),
      );
      const keepAlive = setInterval(
        // Solo comentario (sin data): la línea ": keep-alive" no es un evento
        () => subscriber.next({ comment: 'keep-alive' }),
        KEEP_ALIVE_MS,
      );

      this.find(id)
        .then((job) => {
          if (!job) {
            subscriber.complete();
            return;
          }
          subscriber.next({ type: 'status', data: job });
          if (job.status === 'completed') {
            deliver({ type: 'completed', result: job.result });
            return;
          }
          if (job.status === 'failed') {
            subscriber.next({ type: 'failed', data: job.error! });
            subscriber.complete();
            return;
          }
          const pending = buffered ?? [];
          buffered = null;
          for (const event of pending) {
            if (subscriber.closed) break;
            deliver(event);
          }
        })
        .catch((error: unknown) => subscriber.error(error));

      // Al terminar o cuando el cliente se desconecta (Nest cancela la
      // suscripción): se liberan el listener y el keep-alive
      return () => {
        unwatch();
        clearInterval(keepAlive);
      };
    });
  }
}
