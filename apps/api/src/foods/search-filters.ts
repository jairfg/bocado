import type { FoodCategory, RestrictionFilters } from '@bocado/shared';
import { normalizeText } from '../common/normalize-text.js';
import { Prisma } from '../generated/prisma/client.js';

// No sirven para armar comidas:
// - miscellaneous: especias, hierbas secas, sal, vinagres y salsas.
// - beverages: refrescos, jugos, café, té, bebidas en polvo y suplementos
//   (proteína whey o de soya en polvo, batidos sustitutos de comida).
// - sugars_sweets: azúcar, caramelos, jarabes, mermeladas y helados.
export const EXCLUDED_CATEGORIES = [
  'miscellaneous',
  'beverages',
  'sugars_sweets',
] as const satisfies readonly FoodCategory[];

// isVegetarian casi siempre es null en la base: "vegetariano" se aplica
// por categoría y por nombre. Los nombres atrapan platos con carne fuera de
// estas categorías ("Chili con carne y frijol", "Manteca de cerdo").
const LAND_MEAT_TERMS = [
  'carne',
  'cerdo',
  'res',
  'ternera',
  'cordero',
  'pollo',
  'pavo',
  'pato',
  'ganso',
  'tocino',
  'jamon',
  'salchicha',
  'chorizo',
  'salami',
  'mortadela',
  'sebo',
];
const FISH_TERMS = [
  'pescado',
  'bacalao',
  'salmon',
  'sardina',
  'atun',
  'anchoa',
  'caballa',
  'trucha',
  'camaron',
  'langostino',
  'marisco',
  'almeja',
  'mejillon',
  'calamar',
  'pulpo',
  'cangrejo',
];
// "Pollo vegetariano (sin carne)" nombra la carne pero no la tiene.
const MEAT_FREE_PATTERN = String.raw`\m(sin carne|vegetarian[oa]s?|a base de soya)\M`;

// Filtros por nombre de la selección anterior que siguen sirviendo para
// candidatos (en sintaxis de regex de Postgres: \m y \M son límites de
// palabra). En estas categorías el alimento se sirve cocido: lo crudo o
// seco tiene otros nutrientes por 100 g. "Calor seco" es una cocción.
const SERVED_COOKED: readonly FoodCategory[] = [
  'meats',
  'fish_seafood',
  'eggs',
  'legumes',
  'cereals',
  'tubers_roots',
];
const UNCOOKED_PATTERN = String.raw`\m(crud[oa]s?|sin cocinar|sin preparar)\M|(?<!calor )\msec[oa]s?\M`;
// Ingredientes que no son un plato, y vísceras.
const NOT_A_DISH_PATTERN = String.raw`\m(harinas?|en polvo|deshidratad[oa]s?|liofilizad[oa]s?|gluten|manteca|higado|corazon|rinon(es)?|lengua|sesos|bazo|pancreas|pulmon(es)?|molleja|menudencias|piel|patas?|sebo)\M`;

// El nombre como lo comparan los patrones: minúsculas y sin tildes, igual
// que normalizeText en el código.
const NAME = Prisma.raw('lower(unaccent(name))');

export type SearchFilters = {
  // Solo estas categorías
  categories?: readonly FoodCategory[];
  restrictions?: RestrictionFilters;
  // Para candidatos de menú: sin crudos, harinas ni vísceras
  dishesOnly?: boolean;
};

const escapeRegex = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

// Por si el término llega en plural ("huevos" también prueba "huevo").
function singularVariants(term: string): string[] {
  const word = normalizeText(term).trim().replace(/\s+/g, ' ');
  const variants = [word];
  if (word.length > 4 && word.endsWith('es')) variants.push(word.slice(0, -2));
  if (word.length > 3 && word.endsWith('s')) variants.push(word.slice(0, -1));
  return variants;
}

// Palabra completa con plural opcional: "huevo" encuentra "huevos", pero
// "res" no encuentra "fresas" ni "resto".
export function wordPattern(terms: readonly string[]): string {
  const variants = new Set(terms.flatMap(singularVariants).map(escapeRegex));
  return String.raw`\m(${[...variants].join('|')})(s|es)?\M`;
}

// El LLM interpreta el texto; este código decide qué se excluye. La
// similitud semántica no sirve para excluir: tiene que ser un filtro.
export function restrictionConditions(
  restrictions: RestrictionFilters,
): Prisma.Sql[] {
  const { vegetarian, pescatarian, excludeCategories, excludeTerms } =
    restrictions;
  const conditions: Prisma.Sql[] = [];

  const categories = new Set<string>(excludeCategories);
  if (vegetarian || pescatarian) categories.add('meats');
  if (vegetarian) categories.add('fish_seafood');
  if (categories.size > 0) {
    conditions.push(
      Prisma.sql`category NOT IN (${Prisma.join([...categories])})`,
    );
  }

  if (vegetarian || pescatarian) {
    const terms = vegetarian
      ? [...LAND_MEAT_TERMS, ...FISH_TERMS]
      : LAND_MEAT_TERMS;
    // Los huevos se salvan: "Huevo de pavo" nombra un ave pero no es carne
    conditions.push(
      Prisma.sql`(category = 'eggs' OR ${NAME} !~ ${wordPattern(terms)} OR ${NAME} ~ ${MEAT_FREE_PATTERN})`,
    );
  }
  // Cuando el dato existe se respeta
  if (vegetarian) {
    conditions.push(Prisma.sql`is_vegetarian IS NOT FALSE`);
  }

  if (excludeTerms.length > 0) {
    conditions.push(Prisma.sql`${NAME} !~ ${wordPattern(excludeTerms)}`);
  }
  return conditions;
}

// Filtros duros que toda búsqueda aplica en SQL, más los de la consulta.
// Cada ${valor} viaja como parámetro, también los patrones.
export function buildSearchWhere(filters: SearchFilters = {}): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`is_alcoholic = false`,
    Prisma.sql`category NOT IN (${Prisma.join([...EXCLUDED_CATEGORIES])})`,
  ];

  if (filters.categories && filters.categories.length > 0) {
    conditions.push(
      Prisma.sql`category IN (${Prisma.join([...filters.categories])})`,
    );
  }
  if (filters.dishesOnly) {
    conditions.push(
      Prisma.sql`${NAME} !~ ${NOT_A_DISH_PATTERN}`,
      Prisma.sql`NOT (category IN (${Prisma.join([...SERVED_COOKED])}) AND ${NAME} ~ ${UNCOOKED_PATTERN})`,
    );
  }
  if (filters.restrictions) {
    conditions.push(...restrictionConditions(filters.restrictions));
  }
  return Prisma.join(conditions, ' AND ');
}

// Consulta de texto completo con OR entre palabras: websearch_to_tsquery
// entiende "or" y nunca falla por sintaxis. Con AND, "desayuno con avena"
// exigiría que el nombre diga "desayuno".
export function toOrQuery(text: string): string | null {
  const words = normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 2);
  return words.length > 0 ? words.join(' or ') : null;
}
