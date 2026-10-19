import { AsyncLocalStorage } from 'node:async_hooks';

// Datos de la ejecución en curso (un menú) que necesita código profundo,
// como el limitador de ritmo, sin pasarlos por cada firma intermedia
// (búsqueda, candidatos, revisión...). Es la misma idea que
// ActiveSupport::CurrentAttributes en Rails, por ejecución en vez de por
// request. Fuera de una ejecución, todo es opcional.
export type RunContext = {
  // Cancela las llamadas al proveedor y las esperas (tiempo máximo del job)
  signal?: AbortSignal;
  // El limitador avisa cuántos segundos va a esperar
  onWait?: (seconds: number) => void;
};

const storage = new AsyncLocalStorage<RunContext>();

export const withRunContext = <T>(
  context: RunContext,
  run: () => Promise<T>,
): Promise<T> => storage.run(context, run);

export const currentRun = (): RunContext => storage.getStore() ?? {};
