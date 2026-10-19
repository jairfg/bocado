import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { Notice } from '@/components/notice';

export default function DraftNotFound() {
  return (
    <Notice icon={SearchX} tone="muted" title="Este menú no existe o ya expiró">
      <p>Los menús se guardan durante 24 horas.</p>
      <Link
        href="/"
        className="inline-flex rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover"
      >
        Generar un menú nuevo
      </Link>
    </Notice>
  );
}
