import type { MenuDraftMeal, MenuDraftWarning } from '@bocado/shared';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { formatGrams, formatInteger, formatKcal } from '@/lib/format';
import { MEAL_LABELS, NUTRIENT_LABELS } from '@/lib/labels';
import { StatusPill } from './status-pill';
import { TargetBar } from './target-bar';

const MACROS = ['proteinG', 'carbsG', 'fatG'] as const;

export function MealCard({
  meal,
  warnings,
}: {
  meal: MenuDraftMeal;
  warnings: MenuDraftWarning[];
}) {
  const headingId = `comida-${meal.slot}`;
  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 id={headingId} className="text-lg font-semibold">
            {MEAL_LABELS[meal.slot]}
          </h3>
          <p className="text-sm text-muted tabular-nums">
            Meta {formatKcal(meal.target.kcal)}
          </p>
        </div>
        <StatusPill status={meal.status} />
      </header>

      {meal.items.length > 0 ? (
        <table className="mt-4 w-full text-sm">
          <caption className="sr-only">
            Alimentos de {MEAL_LABELS[meal.slot].toLowerCase()}
          </caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th scope="col" className="pb-2 font-medium">
                Alimento
              </th>
              <th scope="col" className="pb-2 pl-4 text-right font-medium">
                Gramos
              </th>
              <th scope="col" className="pb-2 pl-4 text-right font-medium">
                kcal
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {meal.items.map((item) => (
              <tr key={item.foodId}>
                <td className="py-2 pr-3">{item.name}</td>
                <td className="py-2 pl-4 text-right whitespace-nowrap tabular-nums">
                  {formatGrams(item.grams)}
                </td>
                <td className="py-2 pl-4 text-right tabular-nums">
                  {formatInteger(item.kcal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-semibold">
              <th scope="row" className="pt-2 text-left">
                Total
              </th>
              <td />
              <td className="pt-2 pl-4 text-right tabular-nums">
                {formatInteger(meal.totals.kcal)}
              </td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <p className="mt-4 text-sm text-muted">Sin alimentos.</p>
      )}

      <div className="mt-4 space-y-2.5 rounded-xl bg-surface-muted/60 p-3">
        <TargetBar
          label={NUTRIENT_LABELS.kcal}
          actual={meal.totals.kcal}
          target={meal.target.kcal}
          deviationPct={meal.deviationPct.kcal}
          format={formatKcal}
          compact
        />
        {MACROS.map((key) => (
          <TargetBar
            key={key}
            label={NUTRIENT_LABELS[key]}
            actual={meal.totals[key]}
            target={meal.target[key]}
            deviationPct={meal.deviationPct[key]}
            format={formatGrams}
            compact
          />
        ))}
      </div>

      {(meal.revisions > 0 || warnings.length > 0) && (
        <div className="mt-4 space-y-2 text-sm">
          {meal.revisions > 0 && (
            <p className="flex items-center gap-2 text-muted">
              <RefreshCw className="size-4 shrink-0" aria-hidden="true" />
              La IA la revisó{' '}
              {meal.revisions === 1 ? 'una vez' : `${meal.revisions} veces`} con
              herramientas.
            </p>
          )}
          {warnings.length > 0 && (
            <ul className="space-y-1.5">
              {warnings.map((warning, i) => (
                <li
                  key={`${warning.code}-${i}`}
                  className="flex gap-2 text-muted"
                >
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-warn"
                    aria-hidden="true"
                  />
                  <span>{warning.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
