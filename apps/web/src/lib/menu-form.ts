import {
  MenuRequestSchema,
  type MealSlot,
  type MenuRequest,
} from '@bocado/shared';

// Reglas del formulario. Valida con MenuRequestSchema, el mismo esquema que
// usa la API: los límites (1000–5000 kcal, rangos de macros, 500
// caracteres) se leen del esquema y no se repiten aquí.

const shape = MenuRequestSchema.shape;
const macros = shape.macros.shape;

export const LIMITS = {
  kcal: { min: shape.kcal.minValue!, max: shape.kcal.maxValue! },
  proteinPct: {
    min: macros.proteinPct.minValue!,
    max: macros.proteinPct.maxValue!,
  },
  carbsPct: { min: macros.carbsPct.minValue!, max: macros.carbsPct.maxValue! },
  fatPct: { min: macros.fatPct.minValue!, max: macros.fatPct.maxValue! },
  restrictions: shape.restrictions.unwrap().maxLength!,
};

// Valores tal como los escribe el usuario (texto en los campos numéricos,
// para poder borrar y reescribir)
export type FormValues = {
  kcal: string;
  proteinPct: string;
  carbsPct: string;
  fatPct: string;
  meals: MealSlot[];
  restrictions: string;
};

export type FormField = keyof FormValues | 'macros';
export type FieldErrors = Partial<Record<FormField, string>>;

export const DEFAULT_VALUES: FormValues = {
  kcal: '2000',
  proteinPct: '30',
  carbsPct: '45',
  fatPct: '25',
  meals: ['desayuno', 'almuerzo', 'cena'],
  restrictions: '',
};

export const RESTRICTION_EXAMPLES = [
  'vegetariano',
  'sin lactosa',
  'no me gusta el pescado',
];

export function valuesFromRequest(request: MenuRequest): FormValues {
  return {
    kcal: String(request.kcal),
    proteinPct: String(request.macros.proteinPct),
    carbsPct: String(request.macros.carbsPct),
    fatPct: String(request.macros.fatPct),
    meals: [...request.meals],
    restrictions: request.restrictions ?? '',
  };
}

// Campo vacío → NaN: el esquema lo rechaza y se muestra el rango esperado
const toNumber = (value: string) =>
  value.trim() === '' ? Number.NaN : Number(value.replace(',', '.'));

export function toRequest(values: FormValues): unknown {
  const restrictions = values.restrictions.trim();
  return {
    kcal: toNumber(values.kcal),
    macros: {
      proteinPct: toNumber(values.proteinPct),
      carbsPct: toNumber(values.carbsPct),
      fatPct: toNumber(values.fatPct),
    },
    meals: values.meals,
    ...(restrictions ? { restrictions } : {}),
  };
}

export function macroSum(values: FormValues): number {
  return ['proteinPct', 'carbsPct', 'fatPct'].reduce((sum, key) => {
    const value = toNumber(values[key as 'proteinPct']);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

const MACRO_NAMES = {
  proteinPct: 'La proteína',
  carbsPct: 'Los carbohidratos',
  fatPct: 'La grasa',
} as const;

// Errores de Zod (del formulario o de un 400 de la API) a mensajes en
// español junto a cada campo
export function fieldErrors(
  issues: readonly { path: readonly PropertyKey[] }[],
  values: FormValues,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const [first, second] = issue.path;
    if (first === 'kcal') {
      errors.kcal = `Ingresa entre ${LIMITS.kcal.min} y ${LIMITS.kcal.max} kcal.`;
    } else if (first === 'macros' && second && second in MACRO_NAMES) {
      const key = second as keyof typeof MACRO_NAMES;
      errors[key] =
        `${MACRO_NAMES[key]} va entre ${LIMITS[key].min} y ${LIMITS[key].max} %.`;
    } else if (first === 'macros') {
      errors.macros = `Los porcentajes suman ${macroSum(values)} %: deben sumar 100 %.`;
    } else if (first === 'meals') {
      errors.meals = 'Elige al menos una comida.';
    } else if (first === 'restrictions') {
      errors.restrictions = `Usa como máximo ${LIMITS.restrictions} caracteres.`;
    }
  }
  return errors;
}

export function validate(
  values: FormValues,
):
  | { success: true; request: MenuRequest }
  | { success: false; errors: FieldErrors } {
  const parsed = MenuRequestSchema.safeParse(toRequest(values));
  return parsed.success
    ? { success: true, request: parsed.data }
    : { success: false, errors: fieldErrors(parsed.error.issues, values) };
}
