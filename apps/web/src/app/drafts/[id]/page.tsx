import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ServerCrash, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { DraftProgress } from '@/components/draft-progress';
import { MenuResult } from '@/components/menu-result';
import { Notice } from '@/components/notice';
import { RetryButton } from '@/components/retry-button';
import { ApiError, getDraft } from '@/lib/api';
import { FAILURE_TITLES } from '@/lib/labels';

export const metadata: Metadata = {
  title: 'Tu menú',
  description: 'Progreso y resultado de un menú generado con Bocado.',
};

async function loadDraft(id: string) {
  try {
    return { job: await getDraft(id) };
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'not_found') notFound();
    if (error instanceof ApiError && error.kind === 'unreachable') {
      return { job: null };
    }
    throw error;
  }
}

// Componente de servidor: consulta el estado en el servidor antes de
// responder. Si el menú ya terminó (recarga, enlace compartido), el
// resultado llega en el HTML sin abrir el SSE. Solo si sigue en proceso se
// monta el componente de cliente que escucha el progreso.
export default async function DraftPage(props: PageProps<'/drafts/[id]'>) {
  const { id } = await props.params;
  const { job } = await loadDraft(id);

  if (!job) {
    return (
      <Notice
        icon={ServerCrash}
        tone="warn"
        title="No se pudo conectar con el servidor"
      >
        <p>
          La API no responde en este momento. Revisa que esté en marcha e
          inténtalo de nuevo.
        </p>
        <Link
          href={`/drafts/${id}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Reintentar
        </Link>
      </Notice>
    );
  }

  if (job.status === 'completed' && job.result) {
    return <MenuResult id={id} draft={job.result} request={job.request} />;
  }

  if (job.status === 'failed' && job.error) {
    return (
      <Notice
        icon={TriangleAlert}
        tone="bad"
        title={FAILURE_TITLES[job.error.code]}
      >
        <p>{job.error.message}</p>
        <div className="flex justify-center">
          <RetryButton request={job.request} />
        </div>
      </Notice>
    );
  }

  return <DraftProgress id={id} initialJob={job} />;
}
