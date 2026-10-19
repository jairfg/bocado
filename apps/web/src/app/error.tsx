'use client';

import { TriangleAlert } from 'lucide-react';
import { Notice } from '@/components/notice';

// Los límites de error deben ser de cliente. En producción Next no envía el
// mensaje del error al navegador, así que se muestra uno genérico.
export default function Error({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <Notice icon={TriangleAlert} tone="bad" title="Algo salió mal">
      <p>No pudimos cargar esta página. Inténtalo de nuevo en un momento.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover"
      >
        Reintentar
      </button>
    </Notice>
  );
}
