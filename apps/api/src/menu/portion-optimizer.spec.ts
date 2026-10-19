import {
  BROCCOLI,
  CHICKEN,
  EGG,
  FAT_FREE_CREAM_CHEESE,
  OATS,
  OLIVE_OIL,
  RICE,
  STRAWBERRIES,
  TARGETS,
} from '../../test/fixtures/foods.js';
import { evaluateGrams, optimizeMeal, TOLERANCES } from './meal-evaluation.js';
import { nutrientsFor, round1 } from './nutrition.js';
import { portionLimits } from './portion-limits.js';

const LUNCH = [CHICKEN, RICE, BROCCOLI, OLIVE_OIL];

describe('optimizeMeal', () => {
  it('llega a la meta en un caso factible', () => {
    const { evaluation, status } = optimizeMeal(
      LUNCH,
      [150, 200, 100, 10],
      TARGETS.almuerzo,
    );

    expect(status).toBe('adjusted');
    expect(evaluation.withinTolerance).toBe(true);
    expect(Math.abs(evaluation.deviationPct.kcal)).toBeLessThanOrEqual(
      TOLERANCES.kcal * 100,
    );
    expect(evaluation.problems).toEqual([]);
  });

  it('respeta los mínimos y máximos de cada alimento', () => {
    // Partida fuera de límites: 900 g de aceite y 1 g de arroz
    const { evaluation } = optimizeMeal(
      LUNCH,
      [500, 1, 900, 900],
      TARGETS.almuerzo,
    );

    evaluation.items.forEach((item, i) => {
      const { minG, maxG } = portionLimits(LUNCH[i]);
      expect(item.grams).toBeGreaterThanOrEqual(minG);
      expect(item.grams).toBeLessThanOrEqual(maxG);
    });
  });

  it('detecta un caso imposible y explica por qué', () => {
    // Arroz y aceite: no hay fuente de proteína
    const { evaluation, status } = optimizeMeal(
      [RICE, OLIVE_OIL],
      [300, 15],
      TARGETS.almuerzo,
    );

    expect(status).toBe('needs_revision');
    expect(evaluation.problems).toContainEqual(
      expect.stringMatching(
        /^falta proteína: incluso con todas las porciones al máximo queda \d+ % abajo$/,
      ),
    );
  });

  it('redondea a múltiplos de 5 y recalcula los totales con kcal declaradas', () => {
    const { evaluation } = optimizeMeal(
      LUNCH,
      [137, 222, 91, 12],
      TARGETS.almuerzo,
    );

    for (const [i, item] of evaluation.items.entries()) {
      expect(item.grams % 5).toBe(0);
      // kcal = declaradas por 100 g × gramos / 100, nunca 4-4-9
      expect(item).toMatchObject(nutrientsFor(LUNCH[i], item.grams));
    }
    const sum = evaluation.items.reduce((acc, item) => acc + item.kcal, 0);
    expect(evaluation.totals.kcal).toBe(round1(sum));
  });

  it('es determinista', () => {
    const run = () =>
      optimizeMeal(LUNCH, [150, 200, 100, 10], TARGETS.almuerzo).evaluation
        .items;

    expect(run()).toEqual(run());
  });

  it('es "ok" si la propuesta del modelo ya estaba dentro de tolerancia', () => {
    const optimized = optimizeMeal(
      LUNCH,
      [150, 200, 100, 10],
      TARGETS.almuerzo,
    );
    const grams = optimized.evaluation.items.map((item) => item.grams);

    expect(optimizeMeal(LUNCH, grams, TARGETS.almuerzo).status).toBe('ok');
  });

  it('acota el queso crema de 170 g del punto 4 a un máximo realista', () => {
    const breakfast = [EGG, FAT_FREE_CREAM_CHEESE, OATS, STRAWBERRIES];

    const { evaluation, status } = optimizeMeal(
      breakfast,
      [120, 170, 240, 140],
      TARGETS.desayuno,
    );

    const cheese = evaluation.items.find(
      (item) => item.foodId === FAT_FREE_CREAM_CHEESE.id,
    );
    expect(cheese?.grams).toBeLessThanOrEqual(45);
    // Con el queso acotado, la proteína no alcanza: ahora es un problema
    // explícito para la revisión, no una porción irreal
    expect(status).toBe('needs_revision');
    expect(evaluation.problems[0]).toMatch(/^falta proteína/);
  });
});

describe('evaluateGrams', () => {
  it('una comida sin alimentos no entra en tolerancia', () => {
    const evaluation = evaluateGrams([], [], TARGETS.cena);

    expect(evaluation.withinTolerance).toBe(false);
    expect(evaluation.problems).toEqual(['la comida no tiene alimentos']);
  });
});
