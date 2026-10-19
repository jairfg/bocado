import { withRunContext } from '../common/run-context.js';
import { SlidingWindowLimiter, UNLIMITED } from './rate-limiter.js';

describe('SlidingWindowLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deja pasar hasta el límite sin esperar', async () => {
    const limiter = new SlidingWindowLimiter(5);
    const waits: number[] = [];

    await withRunContext({ onWait: (s) => waits.push(s) }, async () => {
      for (let i = 0; i < 5; i++) await limiter.acquire();
    });

    expect(waits).toEqual([]);
  });

  it('al llegar al límite espera a que se libere la ventana y avisa', async () => {
    const limiter = new SlidingWindowLimiter(2);
    const waits: number[] = [];
    const context = { onWait: (seconds: number) => waits.push(seconds) };

    await withRunContext(context, () => limiter.acquire()); // t = 0
    await vi.advanceTimersByTimeAsync(20_000);
    await withRunContext(context, () => limiter.acquire()); // t = 20 s

    let done = false;
    const third = withRunContext(context, () => limiter.acquire()).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    // La llamada de t = 0 sale de la ventana en t = 60 s: faltan 40 s
    expect(waits).toEqual([40]);

    await vi.advanceTimersByTimeAsync(39_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await third;
    expect(done).toBe(true);
  });

  it('cuenta unidades (textos de embeddings), no solo llamadas', async () => {
    const limiter = new SlidingWindowLimiter(90);
    const waits: number[] = [];

    await limiter.acquire(60);
    const second = withRunContext({ onWait: (s) => waits.push(s) }, () =>
      limiter.acquire(40),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(waits).toEqual([60]);
    await vi.advanceTimersByTimeAsync(60_000);
    await second;
    await expect(limiter.acquire(91)).rejects.toThrow(/superan el límite/);
  });

  it('atiende en orden de llegada', async () => {
    const limiter = new SlidingWindowLimiter(1);
    const order: string[] = [];

    await limiter.acquire();
    const first = limiter.acquire().then(() => order.push('primera'));
    const second = limiter.acquire().then(() => order.push('segunda'));
    await vi.advanceTimersByTimeAsync(120_000);
    await Promise.all([first, second]);

    expect(order).toEqual(['primera', 'segunda']);
  });

  it('la espera se cancela con la señal del job', async () => {
    const limiter = new SlidingWindowLimiter(1);
    const controller = new AbortController();
    await limiter.acquire();

    const waiting = withRunContext({ signal: controller.signal }, () =>
      limiter.acquire(),
    );
    controller.abort(new Error('tiempo máximo'));

    await expect(waiting).rejects.toThrow('tiempo máximo');
  });

  it('UNLIMITED nunca espera', async () => {
    for (let i = 0; i < 1000; i++) await UNLIMITED.acquire(1000);
  });
});
