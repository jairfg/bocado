import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  MenuRequestSchema,
  type MenuDraft,
  type MenuRequest,
} from '@bocado/shared';
import { UnrecoverableError, type Job } from 'bullmq';
import type { Env } from '../config/env.js';
import { MenuDraftService } from '../menu/menu-draft.service.js';
import { DraftTimeoutError, failureCode } from './draft-failure.js';
import { JOB_TIMEOUT_MS, MENU_DRAFT_QUEUE } from './drafts.constants.js';

// maxStalledCount 0: si el worker se cae a mitad de un job, BullMQ lo
// detecta por el lock vencido y lo pasa a "failed" en vez de volver a
// encolarlo (por defecto lo reintentaría una vez y gastaría cuota otra vez).
@Processor(MENU_DRAFT_QUEUE, { maxStalledCount: 0 })
export class MenuDraftProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(MenuDraftProcessor.name);

  constructor(
    private readonly drafts: MenuDraftService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  // El worker se crea en onModuleInit; aquí ya existe y se ajusta desde la
  // configuración validada
  onApplicationBootstrap(): void {
    this.worker.concurrency = this.config.get('MENU_WORKER_CONCURRENCY', {
      infer: true,
    });
  }

  async process(job: Job<MenuRequest, MenuDraft>): Promise<MenuDraft> {
    // Ya validado antes de encolar; se vuelve a validar por si el job
    // llegó a Redis por otra vía
    const request = MenuRequestSchema.parse(job.data);

    // BullMQ no tiene tiempo máximo por job: se cancela con un
    // AbortController, que llega hasta las llamadas al proveedor
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new DraftTimeoutError()),
      JOB_TIMEOUT_MS,
    );
    const timedOut = new Promise<never>((_, reject) =>
      controller.signal.addEventListener(
        'abort',
        () => reject(controller.signal.reason),
        { once: true },
      ),
    );

    const generation = this.drafts.generate(
      request,
      (event) => {
        job.updateProgress(event).catch((error: unknown) => {
          this.logger.warn(`No se pudo guardar el progreso: ${String(error)}`);
        });
      },
      { signal: controller.signal },
    );
    // Si gana el tiempo máximo, su rechazo posterior no debe quedar suelto
    generation.catch(() => undefined);

    try {
      return await Promise.race([generation, timedOut]);
    } catch (error) {
      const code = failureCode(error);
      if (code === 'internal_error') {
        this.logger.error(`Job ${job.id} falló`, (error as Error)?.stack);
      }
      // Sin reintentos: cada intento gasta cuota. El motivo guardado es
      // solo el código, nunca el detalle interno.
      throw new UnrecoverableError(code);
    } finally {
      clearTimeout(timer);
    }
  }
}
