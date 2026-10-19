'use client';

import type { MealSlot } from '@bocado/shared';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { ApiError, createDraft } from '@/lib/api';
import { MEAL_LABELS, MEAL_ORDER } from '@/lib/labels';
import {
  fieldErrors,
  LIMITS,
  macroSum,
  RESTRICTION_EXAMPLES,
  validate,
  type FieldErrors,
  type FormValues,
} from '@/lib/menu-form';

// Componente de cliente: tiene estado (los valores y errores), eventos
// (cambios, envío) y navega con el router. Todo lo demás de la página
// queda en el servidor.

type MacroKey = 'proteinPct' | 'carbsPct' | 'fatPct';

const MACROS: {
  key: MacroKey;
  label: string;
  kcalPerGram: number;
  dot: string;
}[] = [
  { key: 'proteinPct', label: 'Proteína', kcalPerGram: 4, dot: 'bg-primary' },
  {
    key: 'carbsPct',
    label: 'Carbohidratos',
    kcalPerGram: 4,
    dot: 'bg-primary/60',
  },
  { key: 'fatPct', label: 'Grasa', kcalPerGram: 9, dot: 'bg-primary/30' },
];

const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground shadow-xs transition placeholder:text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 aria-[invalid=true]:border-bad';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 flex items-center gap-1.5 text-sm text-bad">
      <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

export function MenuForm({ initialValues }: { initialValues: FormValues }) {
  const router = useRouter();
  const id = useId();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  // Después del primer intento, los errores se actualizan al escribir
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const update = (patch: Partial<FormValues>) => {
    const next = { ...values, ...patch };
    setValues(next);
    if (attempted) {
      const result = validate(next);
      setErrors(result.success ? {} : result.errors);
    }
  };

  const toggleMeal = (slot: MealSlot) =>
    update({
      meals: values.meals.includes(slot)
        ? values.meals.filter((meal) => meal !== slot)
        : MEAL_ORDER.filter(
            (meal) => meal === slot || values.meals.includes(meal),
          ),
    });

  const addExample = (example: string) => {
    const current = values.restrictions.trim();
    update({ restrictions: current ? `${current}, ${example}` : example });
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setBanner(null);
    const result = validate(values);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const created = await createDraft(result.request);
      router.push(`/drafts/${created.id}`);
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && error.kind === 'validation') {
        // La API valida con el mismo esquema: sus errores van a los campos
        setErrors(fieldErrors(error.issues, values));
      } else if (error instanceof ApiError && error.kind === 'rate_limited') {
        setBanner(error.message);
      } else if (error instanceof ApiError && error.kind === 'unreachable') {
        setBanner(
          'No se pudo conectar con el servidor. Revisa que la API esté en marcha e inténtalo de nuevo.',
        );
      } else {
        setBanner('Ocurrió un error inesperado. Inténtalo de nuevo.');
      }
    }
  }

  const sum = macroSum(values);
  const sumOk = Math.abs(sum - 100) < 1e-9;
  const kcal = Number(values.kcal);
  const length = values.restrictions.length;
  const errorId = (field: string) => `${id}-${field}-error`;
  const describedBy = (field: keyof FieldErrors) =>
    errors[field] ? errorId(field) : undefined;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-7 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-7"
    >
      {banner && (
        <div
          role="alert"
          className="flex gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm"
        >
          <AlertCircle
            className="mt-0.5 size-5 shrink-0 text-warn"
            aria-hidden="true"
          />
          <p>{banner}</p>
        </div>
      )}

      <div>
        <label htmlFor={`${id}-kcal`} className="block font-medium">
          Calorías del día
        </label>
        <p className="mt-0.5 text-sm text-muted">
          Entre {LIMITS.kcal.min.toLocaleString('es-PE')} y{' '}
          {LIMITS.kcal.max.toLocaleString('es-PE')} kcal.
        </p>
        <div className="relative mt-2 max-w-48">
          <input
            id={`${id}-kcal`}
            type="number"
            inputMode="numeric"
            min={LIMITS.kcal.min}
            max={LIMITS.kcal.max}
            step={50}
            value={values.kcal}
            onChange={(e) => update({ kcal: e.target.value })}
            aria-invalid={Boolean(errors.kcal)}
            aria-describedby={describedBy('kcal')}
            className={`${inputClass} pr-12 text-lg font-semibold tabular-nums`}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
            kcal
          </span>
        </div>
        <FieldError id={errorId('kcal')} message={errors.kcal} />
      </div>

      <fieldset aria-describedby={`${id}-macros-sum`}>
        <legend className="font-medium">Distribución de macros</legend>
        <p className="mt-0.5 text-sm text-muted">
          Porcentaje de las calorías que aporta cada uno.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {MACROS.map(({ key, label, kcalPerGram, dot }) => {
            const pct = Number(values[key]);
            const grams =
              Number.isFinite(kcal) && Number.isFinite(pct)
                ? Math.round((kcal * pct) / 100 / kcalPerGram)
                : null;
            return (
              <div key={key}>
                <label
                  htmlFor={`${id}-${key}`}
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <span
                    className={`size-2.5 rounded-full ${dot}`}
                    aria-hidden="true"
                  />
                  {label}
                </label>
                <div className="relative mt-1.5">
                  <input
                    id={`${id}-${key}`}
                    type="number"
                    inputMode="decimal"
                    min={LIMITS[key].min}
                    max={LIMITS[key].max}
                    value={values[key]}
                    onChange={(e) => update({ [key]: e.target.value })}
                    aria-invalid={Boolean(errors[key])}
                    aria-describedby={describedBy(key)}
                    className={`${inputClass} pr-9 tabular-nums`}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
                    %
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted tabular-nums">
                  {grams !== null && grams > 0 ? `≈ ${grams} g · ` : ''}
                  {LIMITS[key].min}–{LIMITS[key].max} %
                </p>
                <FieldError id={errorId(key)} message={errors[key]} />
              </div>
            );
          })}
        </div>
        <p
          id={`${id}-macros-sum`}
          className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium tabular-nums ${
            sumOk ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'
          }`}
        >
          {sumOk ? (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          ) : (
            <AlertCircle className="size-4" aria-hidden="true" />
          )}
          Suma: {Number.isFinite(sum) ? sum : '–'} %
          {!sumOk && ' · debe dar 100 %'}
        </p>
        <FieldError id={errorId('macros')} message={errors.macros} />
      </fieldset>

      <fieldset aria-describedby={describedBy('meals')}>
        <legend className="font-medium">Comidas del día</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {MEAL_ORDER.map((slot) => {
            const checked = values.meals.includes(slot);
            return (
              <label
                key={slot}
                className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition select-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2 ${
                  checked
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-border bg-surface text-muted hover:border-primary/50 hover:text-foreground'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggleMeal(slot)}
                />
                {MEAL_LABELS[slot]}
              </label>
            );
          })}
        </div>
        <FieldError id={errorId('meals')} message={errors.meals} />
      </fieldset>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${id}-restrictions`} className="font-medium">
            Restricciones y preferencias{' '}
            <span className="font-normal text-muted">(opcional)</span>
          </label>
          <span
            className={`text-xs tabular-nums ${
              length > LIMITS.restrictions
                ? 'font-medium text-bad'
                : 'text-muted'
            }`}
            aria-live="polite"
          >
            {length}/{LIMITS.restrictions}
          </span>
        </div>
        <textarea
          id={`${id}-restrictions`}
          rows={3}
          value={values.restrictions}
          onChange={(e) => update({ restrictions: e.target.value })}
          placeholder="Por ejemplo: vegetariano, no me gusta el brócoli"
          aria-invalid={Boolean(errors.restrictions)}
          aria-describedby={describedBy('restrictions')}
          className={`${inputClass} mt-2 resize-y`}
        />
        <FieldError
          id={errorId('restrictions')}
          message={errors.restrictions}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Ejemplos:</span>
          {RESTRICTION_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => addExample(example)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted transition hover:border-primary/50 hover:text-foreground"
            >
              <Plus className="size-3" aria-hidden="true" />
              {example}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover disabled:cursor-wait disabled:opacity-70 sm:w-auto"
      >
        {submitting ? (
          <Loader2
            className="size-5 motion-safe:animate-spin"
            aria-hidden="true"
          />
        ) : (
          <Sparkles className="size-5" aria-hidden="true" />
        )}
        {submitting ? 'Enviando…' : 'Generar menú'}
      </button>
    </form>
  );
}
