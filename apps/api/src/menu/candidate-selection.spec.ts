import {
  interleave,
  missingGroups,
  pickMealCandidates,
} from './candidate-selection.js';

// id → categoría de los alimentos de prueba
const categoryOf = new Map<number, string>([
  [1, 'dairy'],
  [2, 'dairy'],
  [3, 'fruits'],
  [4, 'fruits'],
  [5, 'cereals'],
  [6, 'cereals'],
  [7, 'eggs'],
  [8, 'legumes'],
  [9, 'nuts_seeds'],
  [10, 'tubers_roots'],
]);

describe('interleave', () => {
  it('toma el 1.º de cada consulta, luego el 2.º, sin duplicados', () => {
    expect(
      interleave([
        [1, 2, 3],
        [4, 1],
        [5, 6, 7, 9],
      ]),
    ).toEqual([1, 4, 5, 2, 6, 3, 7, 9]);
  });
});

describe('pickMealCandidates', () => {
  it('incluye proteína, carbohidrato y verdura o fruta aunque no estén arriba', () => {
    // Con size 3, solo intercalando saldrían 1, 9 y 2 (sin fruta ni cereal)
    const picked = pickMealCandidates({
      rankings: [
        [1, 2, 3],
        [9, 5],
      ],
      categoryOf,
      size: 3,
    });

    expect(picked).toEqual([1, 5, 3]);
    expect(missingGroups(picked, categoryOf)).toEqual([]);
  });

  it('completa un grupo faltante con el respaldo de su categoría', () => {
    // Desayuno vegano: las consultas no traen ninguna proteína
    const rankings = [[3, 4], [5, 6], [9]];
    expect(
      missingGroups(rankings.flat(), categoryOf).map((g) => g.name),
    ).toEqual(['proteína']);

    const picked = pickMealCandidates({
      rankings,
      fallbacks: new Map([['proteína', [9, 8]]]),
      categoryOf,
      size: 4,
    });

    // 9 (frutos secos) no cuenta como proteína: se usa 8 (legumbres).
    // El cuarto lugar se llena con el intercalado (3, 5, 9...).
    expect(picked).toEqual([8, 5, 3, 9]);
    expect(missingGroups(picked, categoryOf)).toEqual([]);
  });

  it('no supera el tamaño ni repite alimentos', () => {
    const picked = pickMealCandidates({
      rankings: [
        [1, 3, 5, 7],
        [1, 3, 5, 7],
        [2, 4, 6, 8],
      ],
      categoryOf,
      size: 5,
    });

    expect(picked).toHaveLength(5);
    expect(new Set(picked).size).toBe(5);
  });
});
