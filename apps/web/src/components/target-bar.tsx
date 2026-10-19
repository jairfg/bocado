import { formatDeviation } from '@/lib/format';

// La escala llega a 125 % de la meta: la marca vertical es la meta
const SCALE = 1.25;

type Props = {
  label: string;
  actual: number;
  target: number;
  deviationPct: number;
  format: (value: number) => string;
  // compact: una fila dentro de una tarjeta de comida; si no, una métrica
  // del resumen del día
  compact?: boolean;
};

function Bar({
  label,
  actual,
  target,
  format,
  thin,
}: Props & { thin: boolean }) {
  const fill = Math.min(actual / target / SCALE, 1) * 100;
  const marker = (1 / SCALE) * 100;
  return (
    <div
      className={`relative mt-2 overflow-hidden rounded-full bg-surface-muted ${thin ? 'h-1.5' : 'h-2'}`}
      role="img"
      aria-label={`${label}: ${format(actual)} de una meta de ${format(target)}`}
    >
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${fill}%` }}
      />
      <div
        className="absolute inset-y-0 w-0.5 bg-foreground/50"
        style={{ left: `${marker}%` }}
      />
    </div>
  );
}

// Real frente a meta como barra; el texto dice lo mismo para quien no la ve
export function TargetBar(props: Props) {
  const {
    label,
    actual,
    target,
    deviationPct,
    format,
    compact = false,
  } = props;

  if (compact) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-muted">{label}</span>
          <span className="tabular-nums">
            <span className="font-medium">{format(actual)}</span>
            <span className="text-muted"> / {format(target)}</span>
            <span className="ml-1.5 text-xs text-muted">
              ({formatDeviation(deviationPct)})
            </span>
          </span>
        </div>
        <Bar {...props} thin />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface-muted/60 p-3.5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 tabular-nums">
        <span className="text-xl font-semibold">{format(actual)}</span>
        <span className="text-sm text-muted"> / {format(target)}</span>
      </p>
      <p className="text-xs text-muted tabular-nums">
        {formatDeviation(deviationPct)} frente a la meta
      </p>
      <Bar {...props} thin={false} />
    </div>
  );
}
