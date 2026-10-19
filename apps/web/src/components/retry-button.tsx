'use client';

import type { MenuRequest } from '@bocado/shared';
import { Loader2, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, createDraft } from '@/lib/api';

// Componente de cliente: envía la misma solicitud otra vez y navega al
// nuevo menú
export function RetryButton({ request }: { request: MenuRequest }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setPending(true);
    setError(null);
    try {
      const created = await createDraft(request);
      router.push(`/drafts/${created.id}`);
    } catch (e) {
      setPending(false);
      setError(
        e instanceof ApiError && e.kind !== 'unexpected'
          ? e.message
          : 'No se pudo reintentar. Inténtalo de nuevo.',
      );
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={retry}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? (
          <Loader2
            className="size-4 motion-safe:animate-spin"
            aria-hidden="true"
          />
        ) : (
          <RotateCcw className="size-4" aria-hidden="true" />
        )}
        Reintentar
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
