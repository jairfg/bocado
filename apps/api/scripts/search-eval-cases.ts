import { NO_RESTRICTIONS, type FoodCategory } from '@bocado/shared';
import type { SearchFilters } from '../src/foods/search-filters.js';

export type EvalCase = {
  query: string;
  filters?: SearchFilters;
  // Aciertos: el nombre (en minúsculas y sin tildes) cumple `name` y la
  // categoría está en `categories`. recall@10 = aciertos en el top 10 /
  // min(10, aciertos posibles).
  relevant?: { name: RegExp; categories?: readonly FoodCategory[] };
  // Nunca debería aparecer en el top 10: la categoría está en `categories`
  // o el nombre cumple `name`.
  forbidden?: { name: RegExp; categories: readonly FoodCategory[] };
};

const MEAT = {
  categories: ['meats', 'fish_seafood'],
  // Carne nombrada, salvo "sin carne" o "vegetariano"
  name: /^(?!.*(sin carne|vegetarian)).*\b(carne|cerdo|res|pollo|pavo|tocino|jamon|salchicha|pescado|atun|salmon)\b/,
} as const;

export const EVAL_CASES: readonly EvalCase[] = [
  {
    query: 'desayuno con avena',
    relevant: { name: /\bavena\b/, categories: ['cereals'] },
  },
  { query: 'yogur natural', relevant: { name: /\byogur/ } },
  {
    query: 'pechuga de pollo a la plancha',
    relevant: { name: /pollo.*pechuga|pechuga.*pollo/ },
  },
  {
    query: 'pescado al horno',
    relevant: { name: /horne|calor seco/, categories: ['fish_seafood'] },
  },
  {
    query: 'fuente de omega 3',
    relevant: {
      name: /\b(salmon|sardina|caballa|arenque|atun|trucha|anchoa|chia|linaza|nuez|nueces)\b/,
    },
  },
  {
    query: 'proteína vegetal',
    relevant: { name: /\b(tofu|tempeh|lentej|garbanz|frijol|soya|edamame)/ },
  },
  {
    query: 'fruta fresca para el desayuno',
    relevant: { name: /crud|fresc/, categories: ['fruits'] },
  },
  {
    query: 'verduras al vapor',
    relevant: { name: /vapor|hervid|cocid/, categories: ['vegetables'] },
  },
  {
    query: 'arroz o papa para el almuerzo',
    relevant: { name: /\b(arroz|papas?)\b/ },
  },
  {
    query: 'grasa saludable para cocinar',
    relevant: { name: /^aceite\b/, categories: ['fats_oils'] },
  },
  {
    query: 'lácteo bajo en grasa',
    relevant: {
      name: /descremad|bajo en grasa|baja en grasa|sin grasa|light|\b[12] ?%/,
      categories: ['dairy'],
    },
  },
  // Exclusiones. Con el filtro duro no puede salir carne. Sin filtro, se ve
  // qué hace cada ranking con una consulta que nombra la carne para negarla.
  {
    query: 'plato vegetariano',
    filters: { restrictions: { ...NO_RESTRICTIONS, vegetarian: true } },
    forbidden: MEAT,
  },
  { query: 'sin carne ni pollo', forbidden: MEAT },
];
