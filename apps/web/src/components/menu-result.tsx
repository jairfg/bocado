import type { MenuDraft, MenuRequest, Nutrients } from '@bocado/shared';
import { AlertTriangle, Info, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { formatGrams, formatKcal } from '@/lib/format';
import { NUTRIENT_LABELS } from '@/lib/labels';
import { HowGenerated } from './how-generated';
import { MealCard } from './meal-card';
import { TargetBar } from './target-bar';

const NUTRIENTS = ['kcal', 'proteinG', 'carbsG', 'fatG'] as const;

const sumTargets = (draft: MenuDraft): Nutrients =>
  draft.meals.reduce(
    (sum, meal) => ({
      kcal: sum.kcal + meal.target.kcal,
      proteinG: sum.proteinG + meal.target.proteinG,
      carbsG: sum.carbsG + meal.target.carbsG,
      fatG: sum.fatG + meal.target.fatG,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

// Componente de servidor: el resultado no cambia, así que se dibuja en el
// servidor y no envía JavaScript. Lo usan tanto la carga directa de la
// página como el final del progreso en vivo (vía router.refresh()).
export function MenuResult({
  id,
  draft,
  request,
}: {
  id: string;
  draft: MenuDraft;
  request: MenuRequest;
}) {
  const target = sumTargets(draft);
  const slots = new Set(draft.meals.map((meal) => meal.slot));
  // Las advertencias de una comida van en su tarjeta; aquí, el resto
  const general = draft.warnings.filter((w) => !w.slot || !slots.has(w.slot));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Tu menú del día</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {formatKcal(request.kcal)} en {draft.meals.length}{' '}
            {draft.meals.length === 1 ? 'comida' : 'comidas'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Proteína {request.macros.proteinPct} % · Carbohidratos{' '}
            {request.macros.carbsPct} % · Grasa {request.macros.fatPct} %
          </p>
        </div>
        <Link
          href={`/?from=${id}`}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Generar otro menú
        </Link>
      </div>

      <section
        aria-labelledby="resumen-dia"
        className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
      >
        <h2 id="resumen-dia" className="font-semibold">
          Resumen del día
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {NUTRIENTS.map((key) => (
            <TargetBar
              key={key}
              label={NUTRIENT_LABELS[key]}
              actual={draft.totals[key]}
              target={target[key]}
              deviationPct={
                target[key] > 0
                  ? Math.round(
                      ((draft.totals[key] - target[key]) / target[key]) * 1000,
                    ) / 10
                  : 0
              }
              format={key === 'kcal' ? formatKcal : formatGrams}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="comidas">
        <h2 id="comidas" className="sr-only">
          Comidas
        </h2>
        <div className="grid gap-5 lg:grid-cols-2">
          {draft.meals.map((meal) => (
            <MealCard
              key={meal.slot}
              meal={meal}
              warnings={draft.warnings.filter((w) => w.slot === meal.slot)}
            />
          ))}
        </div>
      </section>

      {general.length > 0 && (
        <section
          aria-labelledby="advertencias"
          className="rounded-2xl border border-warn/25 bg-warn-soft/60 p-4 text-sm"
        >
          <h2
            id="advertencias"
            className="flex items-center gap-2 font-semibold"
          >
            <AlertTriangle className="size-4 text-warn" aria-hidden="true" />
            Advertencias
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-muted">
            {general.map((warning, i) => (
              <li key={`${warning.code}-${i}`}>{warning.message}</li>
            ))}
          </ul>
        </section>
      )}

      <HowGenerated draft={draft} />

      <p className="flex items-start gap-2 text-sm text-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Menú generado automáticamente con fines demostrativos. No reemplaza la
        indicación de un nutricionista.
      </p>
    </div>
  );
}
