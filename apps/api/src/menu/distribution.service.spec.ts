import type { MenuRequest } from '@bocado/shared';
import { DistributionService } from './distribution.service.js';

const ALL_MEALS: MenuRequest['meals'] = [
  'desayuno',
  'media_manana',
  'almuerzo',
  'merienda',
  'cena',
];

function buildRequest(overrides: Partial<MenuRequest> = {}): MenuRequest {
  return {
    kcal: 2000,
    macros: { proteinPct: 30, carbsPct: 45, fatPct: 25 },
    meals: ALL_MEALS,
    ...overrides,
  };
}

describe('DistributionService', () => {
  const service = new DistributionService();

  it('calcula los gramos totales para 2000 kcal 30/45/25', () => {
    const { totals } = service.calculate(buildRequest());

    expect(totals).toEqual({
      kcal: 2000,
      proteinG: 150,
      carbsG: 225,
      fatG: 55.6,
    });
  });

  it('reparte 1999 kcal con suma exacta', () => {
    const { meals } = service.calculate(buildRequest({ kcal: 1999 }));

    const sum = meals.reduce((acc, meal) => acc + meal.kcal, 0);
    expect(sum).toBe(1999);
    expect(meals.every((meal) => Number.isInteger(meal.kcal))).toBe(true);
  });

  it('renormaliza los pesos con desayuno, almuerzo y cena', () => {
    const { meals } = service.calculate(
      buildRequest({ meals: ['desayuno', 'almuerzo', 'cena'] }),
    );

    expect(meals.map((meal) => meal.kcal)).toEqual([625, 875, 500]);
  });

  it('devuelve las comidas en orden canónico', () => {
    const { meals } = service.calculate(
      buildRequest({ meals: ['cena', 'merienda', 'desayuno', 'almuerzo'] }),
    );

    expect(meals.map((meal) => meal.slot)).toEqual([
      'desayuno',
      'almuerzo',
      'merienda',
      'cena',
    ]);
  });

  it('asigna el 100 % a una sola comida', () => {
    const { totals, meals } = service.calculate(
      buildRequest({ meals: ['almuerzo'] }),
    );

    expect(meals).toEqual([
      {
        slot: 'almuerzo',
        sharePct: 100,
        kcal: 2000,
        proteinG: totals.proteinG,
        carbsG: totals.carbsG,
        fatG: totals.fatG,
      },
    ]);
  });

  it('los macros por comida suman aproximadamente el total', () => {
    const { totals, meals } = service.calculate(buildRequest({ kcal: 1999 }));

    // Cada valor redondeado a 1 decimal se desvía como máximo 0.05,
    // y el total también está redondeado.
    const maxDrift = 0.05 * (meals.length + 1);

    for (const key of ['proteinG', 'carbsG', 'fatG'] as const) {
      const sum = meals.reduce((acc, meal) => acc + meal[key], 0);
      expect(Math.abs(sum - totals[key])).toBeLessThanOrEqual(maxDrift);
    }
  });
});
