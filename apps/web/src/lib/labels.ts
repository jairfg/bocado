import type {
  DraftFailureCode,
  FoodCategory,
  MealSlot,
  MealStatus,
} from '@bocado/shared';

// Textos en español de los valores que llegan de la API, en un solo lugar

export const MEAL_LABELS: Record<MealSlot, string> = {
  desayuno: 'Desayuno',
  media_manana: 'Media mañana',
  almuerzo: 'Almuerzo',
  merienda: 'Merienda',
  cena: 'Cena',
};

// "Revisando el almuerzo"
export const MEAL_WITH_ARTICLE: Record<MealSlot, string> = {
  desayuno: 'el desayuno',
  media_manana: 'la media mañana',
  almuerzo: 'el almuerzo',
  merienda: 'la merienda',
  cena: 'la cena',
};

export const MEAL_ORDER: readonly MealSlot[] = [
  'desayuno',
  'media_manana',
  'almuerzo',
  'merienda',
  'cena',
];

export const STATUS_LABELS: Record<MealStatus, string> = {
  ok: 'En meta',
  adjusted: 'Ajustada',
  needs_revision: 'Necesita revisión',
};

export const CATEGORY_LABELS: Record<FoodCategory, string> = {
  beverages: 'bebidas',
  cereals: 'cereales',
  dairy: 'lácteos',
  eggs: 'huevos',
  fats_oils: 'grasas y aceites',
  fish_seafood: 'pescados y mariscos',
  fruits: 'frutas',
  legumes: 'legumbres',
  meats: 'carnes y aves',
  miscellaneous: 'especias y condimentos',
  nuts_seeds: 'frutos secos y semillas',
  sugars_sweets: 'azúcares y dulces',
  tubers_roots: 'tubérculos',
  vegetables: 'verduras',
};

// Título por código; el detalle lo trae la API (ya sin datos internos)
export const FAILURE_TITLES: Record<DraftFailureCode, string> = {
  timeout: 'El menú tardó demasiado',
  provider_unavailable: 'El proveedor de IA no está disponible',
  interrupted: 'El proceso se interrumpió',
  invalid_model_output: 'La IA respondió con un formato inválido',
  provider_error: 'No se pudo contactar al proveedor de IA',
  internal_error: 'Ocurrió un error inesperado',
};

export const NUTRIENT_LABELS = {
  kcal: 'Calorías',
  proteinG: 'Proteína',
  carbsG: 'Carbohidratos',
  fatG: 'Grasa',
} as const;
