import type { FoodCategory, MealSlot } from '@bocado/shared';

export type CandidateFood = {
  id: number;
  name: string;
  category: string;
  kcalPer100g: number;
  proteinGPer100g: number;
  carbsGPer100g: number;
  fatGPer100g: number;
};

// Unos 60 en total: se reparten entre las comidas pedidas.
export const MAX_CANDIDATES = 60;

export type MealQuery = { text: string; categories: readonly FoodCategory[] };

const PROTEIN_SOURCES = ['meats', 'fish_seafood', 'eggs', 'legumes'] as const;
const CARB_SOURCES = ['cereals', 'tubers_roots'] as const;
const HEALTHY_FATS = ['fats_oils', 'nuts_seeds', 'fruits'] as const;

const snackQueries = (meal: string): MealQuery[] => [
  { text: `fruta fresca para ${meal}`, categories: ['fruits'] },
  { text: `yogur o queso para ${meal}`, categories: ['dairy'] },
  { text: 'frutos secos o semillas como snack', categories: ['nuts_seeds'] },
  { text: 'pan o galletas integrales como snack', categories: ['cereals'] },
];

// Consultas híbridas por comida: el texto guía la búsqueda semántica y la de
// texto; las categorías son filtro duro.
export const MEAL_QUERIES: Record<MealSlot, readonly MealQuery[]> = {
  desayuno: [
    {
      text: 'lácteos para el desayuno: leche, yogur o queso fresco',
      categories: ['dairy'],
    },
    { text: 'fruta fresca para el desayuno', categories: ['fruits'] },
    {
      text: 'cereales para el desayuno: avena, pan integral o granola',
      categories: ['cereals'],
    },
    { text: 'huevos para el desayuno', categories: ['eggs'] },
  ],
  media_manana: snackQueries('media mañana'),
  almuerzo: [
    {
      text: 'proteína para el almuerzo: pollo, pescado, carne magra o legumbres',
      categories: PROTEIN_SOURCES,
    },
    {
      text: 'carbohidratos para el almuerzo: arroz, papa, pasta o quinua',
      categories: CARB_SOURCES,
    },
    {
      text: 'verduras cocidas o ensalada para el almuerzo',
      categories: ['vegetables'],
    },
    {
      text: 'grasa saludable para cocinar o aliñar: aceite de oliva, palta o frutos secos',
      categories: HEALTHY_FATS,
    },
  ],
  merienda: snackQueries('la merienda'),
  cena: [
    {
      text: 'proteína ligera para la cena: pescado, pollo, huevos o tofu',
      categories: PROTEIN_SOURCES,
    },
    {
      text: 'carbohidratos para la cena: camote, arroz integral o pasta integral',
      categories: CARB_SOURCES,
    },
    {
      text: 'verduras para la cena: salteadas, al vapor o en sopa',
      categories: ['vegetables'],
    },
    {
      text: 'grasa saludable: aceite de oliva, palta o semillas',
      categories: HEALTHY_FATS,
    },
  ],
};

// Toda comida necesita al menos un alimento de cada grupo. Si sus consultas
// no traen ninguno, se busca con `fallback`.
export const COVERAGE_GROUPS = [
  {
    name: 'proteína',
    categories: [...PROTEIN_SOURCES, 'dairy'],
    fallback: 'fuente de proteína para una comida',
  },
  {
    name: 'carbohidratos',
    categories: CARB_SOURCES,
    fallback: 'fuente de carbohidratos: cereal, pan o tubérculo',
  },
  {
    name: 'verdura o fruta',
    categories: ['vegetables', 'fruits'],
    fallback: 'verdura o fruta fresca',
  },
] as const satisfies readonly {
  name: string;
  categories: readonly FoodCategory[];
  fallback: string;
}[];

export type CoverageGroup = (typeof COVERAGE_GROUPS)[number];

const belongsTo =
  (group: CoverageGroup, categoryOf: ReadonlyMap<number, string>) =>
  (id: number): boolean =>
    (group.categories as readonly string[]).includes(categoryOf.get(id) ?? '');

// Intercala los rankings (el 1.º de cada consulta, luego el 2.º...) para que
// cada consulta aporte aunque otra tenga muchos resultados.
export function interleave(rankings: readonly (readonly number[])[]): number[] {
  const seen = new Set<number>();
  const depth = Math.max(0, ...rankings.map((ranking) => ranking.length));
  for (let position = 0; position < depth; position++) {
    for (const ranking of rankings) {
      const id = ranking[position];
      if (id !== undefined) seen.add(id);
    }
  }
  return [...seen];
}

export function missingGroups(
  ids: readonly number[],
  categoryOf: ReadonlyMap<number, string>,
): CoverageGroup[] {
  return COVERAGE_GROUPS.filter(
    (group) => !ids.some(belongsTo(group, categoryOf)),
  );
}

type PickInput = {
  rankings: readonly (readonly number[])[];
  // Resultados de la búsqueda de respaldo de cada grupo que faltaba
  fallbacks?: ReadonlyMap<CoverageGroup['name'], readonly number[]>;
  categoryOf: ReadonlyMap<number, string>;
  size: number;
};

// Primero el mejor alimento de cada grupo (de las consultas o, si no hay,
// del respaldo) y después el resto intercalado, hasta `size`.
export function pickMealCandidates({
  rankings,
  fallbacks = new Map(),
  categoryOf,
  size,
}: PickInput): number[] {
  const pool = interleave(rankings);
  const picked = new Set<number>();

  for (const group of COVERAGE_GROUPS) {
    const covers = belongsTo(group, categoryOf);
    const best = pool.find(covers) ?? fallbacks.get(group.name)?.find(covers);
    if (best !== undefined) picked.add(best);
  }
  for (const id of pool) {
    if (picked.size >= size) break;
    picked.add(id);
  }
  return [...picked];
}
