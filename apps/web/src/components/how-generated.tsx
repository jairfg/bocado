import type { MenuDraft } from '@bocado/shared';
import { ChevronDown } from 'lucide-react';
import { formatInteger, formatMs } from '@/lib/format';
import { CATEGORY_LABELS, MEAL_LABELS } from '@/lib/labels';

const STAGE_LABELS = {
  restrictions: 'Interpretar restricciones',
  candidates: 'Buscar candidatos',
  menu: 'Elegir alimentos',
  optimizer: 'Ajustar porciones',
  revision: 'Revisar comidas',
} as const;

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}

// <details> se abre y cierra sin JavaScript: sigue siendo de servidor
export function HowGenerated({ draft }: { draft: MenuDraft }) {
  const { restrictionFilters: f, candidates, usage } = draft;
  const restrictions = [
    f.vegetarian && 'Vegetariano',
    f.pescatarian && 'Pescetariano',
    f.excludeCategories.length > 0 &&
      `Sin ${f.excludeCategories.map((c) => CATEGORY_LABELS[c]).join(', ')}`,
    f.excludeTerms.length > 0 && `Evita: ${f.excludeTerms.join(', ')}`,
    f.preferTerms.length > 0 && `Prefiere: ${f.preferTerms.join(', ')}`,
  ].filter((text): text is string => Boolean(text));
  const uniqueCandidates = new Set(candidates.flatMap((c) => c.foodIds)).size;
  const stages = Object.entries(STAGE_LABELS) as [
    keyof typeof STAGE_LABELS,
    string,
  ][];

  return (
    <details className="group rounded-2xl border border-border bg-surface shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-5 font-semibold [&::-webkit-details-marker]:hidden">
        Cómo se generó
        <ChevronDown
          className="size-5 text-muted transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="grid gap-6 border-t border-border p-5 text-sm md:grid-cols-3">
        <section>
          <h3 className="font-semibold">Restricciones interpretadas</h3>
          <p className="mt-1 text-xs text-muted">
            La IA las convirtió en filtros; el código los aplica.
          </p>
          {restrictions.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {restrictions.map((text) => (
                <li
                  key={text}
                  className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary"
                >
                  {text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-muted">Sin restricciones.</p>
          )}
          <h3 className="mt-5 font-semibold">Candidatos por comida</h3>
          <dl className="mt-2 divide-y divide-border">
            {candidates.map((meal) => (
              <Row key={meal.slot} label={MEAL_LABELS[meal.slot]}>
                {meal.foodIds.length}
              </Row>
            ))}
            <Row label="Distintos en total">{uniqueCandidates}</Row>
          </dl>
        </section>

        <section>
          <h3 className="font-semibold">Uso del modelo</h3>
          <dl className="mt-2 divide-y divide-border">
            <Row label="Llamadas al LLM">{usage.llmCalls}</Row>
            <Row label="Pasos de herramientas">{usage.toolSteps}</Row>
            <Row label="Tokens de entrada">
              {usage.inputTokens === null
                ? 'no reportados'
                : formatInteger(usage.inputTokens)}
            </Row>
            <Row label="Tokens de salida">
              {usage.outputTokens === null
                ? 'no reportados'
                : formatInteger(usage.outputTokens)}
            </Row>
          </dl>
        </section>

        <section>
          <h3 className="font-semibold">Latencia por etapa</h3>
          <ul className="mt-3 space-y-2.5">
            {stages.map(([key, label]) => {
              const ms = usage.latencyMs[key];
              const width =
                usage.latencyMs.total > 0
                  ? (ms / usage.latencyMs.total) * 100
                  : 0;
              return (
                <li key={key}>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">{label}</span>
                    <span className="tabular-nums">{formatMs(ms)}</span>
                  </div>
                  <div
                    className="mt-1 h-1.5 rounded-full bg-surface-muted"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 flex justify-between border-t border-border pt-2 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">
              {formatMs(usage.latencyMs.total)}
            </span>
          </p>
        </section>
      </div>
    </details>
  );
}
