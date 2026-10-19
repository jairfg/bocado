import type { LucideIcon } from 'lucide-react';

// Tarjeta centrada para estados sin menú: falla, no encontrado, API caída
export function Notice({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: LucideIcon;
  tone: 'bad' | 'warn' | 'muted';
  title: string;
  children: React.ReactNode;
}) {
  const iconClass = {
    bad: 'bg-bad-soft text-bad',
    warn: 'bg-warn-soft text-warn',
    muted: 'bg-surface-muted text-muted',
  }[tone];
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-border bg-surface p-6 text-center shadow-sm sm:p-8">
      <span
        className={`mx-auto flex size-12 items-center justify-center rounded-full ${iconClass}`}
      >
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-semibold">{title}</h1>
      <div className="mt-2 space-y-4 text-muted">{children}</div>
    </div>
  );
}
