import { FoodCategorySchema, type MenuRequest } from '@bocado/shared';
import {
  CATEGORY_QUOTAS,
  EXCLUDED_CATEGORIES,
  requestSeed,
  selectCandidates,
  type CandidateFood,
} from './candidate-selection.js';

let nextId = 1;
function food(
  category: string,
  name: string,
  isAlcoholic = false,
): CandidateFood {
  return {
    id: nextId++,
    name,
    category,
    isAlcoholic,
    kcalPer100g: 100,
    proteinGPer100g: 5,
    carbsGPer100g: 10,
    fatGPer100g: 3,
  };
}

// `perCategory` alimentos válidos en cada una de las 14 categorías.
function validFoods(perCategory: number): CandidateFood[] {
  return FoodCategorySchema.options.flatMap((category) =>
    Array.from({ length: perCategory }, (_, i) =>
      food(category, `${category} ${i}, cocido`),
    ),
  );
}

const ids = (foods: CandidateFood[]) => foods.map((f) => f.id);

describe('selectCandidates', () => {
  const pool = validFoods(20);

  it('elige 60 alimentos repartidos según las cuotas', () => {
    const candidates = selectCandidates(pool, 42);

    expect(candidates).toHaveLength(60);
    for (const [category, quota] of Object.entries(CATEGORY_QUOTAS)) {
      expect(candidates.filter((f) => f.category === category)).toHaveLength(
        quota,
      );
    }
  });

  it('es determinista: misma semilla, mismos candidatos', () => {
    const first = selectCandidates(pool, 42);

    expect(ids(selectCandidates(pool, 42))).toEqual(ids(first));
    // El orden en que llegan de la base no cambia el resultado
    expect(ids(selectCandidates([...pool].reverse(), 42))).toEqual(ids(first));
    expect(ids(selectCandidates(pool, 7))).not.toEqual(ids(first));
  });

  it('no incluye alcohol, categorías excluidas ni alimentos crudos', () => {
    // Menos alimentos válidos que la cuota: todo lo elegible sale elegido,
    // así que un alimento que no se filtre aparecería sí o sí.
    const valid = validFoods(1);
    const excluded = [
      food('fruits', 'Cerezas en licor', true),
      food('beverages', 'Vino tinto de mesa', true),
      food('meats', 'Res, hígado, cocido'),
      food('legumes', 'Lentejas crudas'),
      food('cereals', 'Harina de trigo integral'),
    ];

    const candidates = selectCandidates([...valid, ...excluded], 42);

    expect(candidates.some((f) => f.isAlcoholic)).toBe(false);
    for (const id of ids(excluded)) {
      expect(ids(candidates)).not.toContain(id);
    }
    for (const category of EXCLUDED_CATEGORIES) {
      expect(candidates.some((f) => f.category === category)).toBe(false);
    }
    // Lo cocido a calor seco sí es válido
    const baked = food('fish_seafood', 'Bacalao, cocido, calor seco');
    expect(ids(selectCandidates([baked], 42))).toEqual([baked.id]);
  });
});

describe('requestSeed', () => {
  const req: MenuRequest = {
    kcal: 2000,
    macros: { proteinPct: 30, carbsPct: 45, fatPct: 25 },
    meals: ['desayuno', 'almuerzo', 'cena'],
  };

  it('no depende del orden de las comidas', () => {
    expect(
      requestSeed({ ...req, meals: ['cena', 'desayuno', 'almuerzo'] }),
    ).toBe(requestSeed(req));
  });

  it('cambia si cambia el request', () => {
    expect(requestSeed({ ...req, kcal: 2100 })).not.toBe(requestSeed(req));
  });
});
