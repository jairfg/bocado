import { currentRun } from '../common/run-context.js';

export const LLM_RATE_LIMITER = Symbol('LLM_RATE_LIMITER');
export const EMBEDDING_RATE_LIMITER = Symbol('EMBEDDING_RATE_LIMITER');

const WINDOW_MS = 60_000;

// Espera cancelable con setTimeout global (los temporizadores simulados de
// Vitest lo controlan; node:timers/promises no)
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// Ventana deslizante de 60 s: en ningún minuto se envían más de `perMinute`
// unidades (llamadas al LLM o textos embebidos). Si no hay lugar, la
// llamada espera en vez de recibir un 429 del proveedor.
//
// Vive en memoria, por proceso. Con una sola instancia de la API (y su
// worker) es exacto. Con varias, cada una tendría su propia ventana y
// entre todas podrían superar la cuota: habría que llevar la ventana a
// Redis (un sorted set por modelo con los timestamps, leído y actualizado
// en un script Lua para que sea atómico entre procesos).
export class SlidingWindowLimiter {
  private readonly sent: { at: number; units: number }[] = [];
  // Las llamadas esperan en orden de llegada
  private queue: Promise<void> = Promise.resolve();

  constructor(readonly perMinute: number) {}

  acquire(units = 1): Promise<void> {
    if (this.perMinute === Infinity) return Promise.resolve();
    if (units > this.perMinute) {
      return Promise.reject(
        new Error(
          `${units} unidades superan el límite de ${this.perMinute} por minuto`,
        ),
      );
    }
    // El contexto se lee al llegar, no cuando le toca el turno
    const { signal, onWait } = currentRun();
    const turn = this.queue.then(() => this.waitForRoom(units, signal, onWait));
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  private async waitForRoom(
    units: number,
    signal?: AbortSignal,
    onWait?: (seconds: number) => void,
  ): Promise<void> {
    for (;;) {
      signal?.throwIfAborted();
      const now = Date.now();
      while (this.sent.length > 0 && now - this.sent[0].at >= WINDOW_MS) {
        this.sent.shift();
      }
      const used = this.sent.reduce((sum, entry) => sum + entry.units, 0);
      if (used + units <= this.perMinute) {
        this.sent.push({ at: now, units });
        return;
      }
      // Hasta que salga de la ventana la entrada más antigua
      const waitMs = this.sent[0].at + WINDOW_MS - now;
      onWait?.(Math.ceil(waitMs / 1000));
      await sleep(waitMs, signal);
    }
  }
}

// Sin límite, para tests y scripts que ya controlan su ritmo
export const UNLIMITED = new SlidingWindowLimiter(Infinity);
