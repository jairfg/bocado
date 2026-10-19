import type { MealStatus } from '@bocado/shared';
import { AlertTriangle, CheckCircle2, SlidersHorizontal } from 'lucide-react';
import { STATUS_LABELS } from '@/lib/labels';

// Verde, ámbar y rojo solo se usan para estados
const STYLES: Record<
  MealStatus,
  { className: string; Icon: typeof CheckCircle2 }
> = {
  ok: { className: 'bg-ok-soft text-ok', Icon: CheckCircle2 },
  adjusted: { className: 'bg-warn-soft text-warn', Icon: SlidersHorizontal },
  needs_revision: { className: 'bg-bad-soft text-bad', Icon: AlertTriangle },
};

export function StatusPill({ status }: { status: MealStatus }) {
  const { className, Icon } = STYLES[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
