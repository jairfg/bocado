import { FAT_FREE_CREAM_CHEESE, OLIVE_OIL } from '../../test/fixtures/foods.js';
import { CATEGORY_LIMITS, portionLimits } from './portion-limits.js';

describe('portionLimits', () => {
  it('con porción de referencia: de un cuarto a 2.5 porciones', () => {
    // Queso crema libre de grasa: porción de 18 g → máximo 45 g
    expect(portionLimits(FAT_FREE_CREAM_CHEESE)).toEqual({ minG: 5, maxG: 45 });
  });

  it('redondea a múltiplos de 5 hacia adentro', () => {
    // Aceite: 13.5 g × 2.5 = 33.75 → 30 (también es el techo de la categoría)
    expect(portionLimits(OLIVE_OIL)).toEqual({ minG: 5, maxG: 30 });
    // 0.25 × 85 = 21.25 → 25; 2.5 × 85 = 212.5 → techo de carnes, 200
    expect(
      portionLimits({ name: 'Pollo', category: 'meats', servingSizeG: 85 }),
    ).toEqual({ minG: 25, maxG: 200 });
  });

  it('acota porciones que en USDA son la pieza entera', () => {
    // Pierna de pavo entera: porción de 816 g. Sin techo serían 800 g.
    expect(
      portionLimits({
        name: 'Pierna de pavo (corte completo), con piel, cruda',
        category: 'meats',
        servingSizeG: 816,
      }),
    ).toEqual(CATEGORY_LIMITS.meats);
  });

  it('sin porción de referencia usa la tabla por categoría', () => {
    expect(
      portionLimits({ name: 'Arroz', category: 'cereals', servingSizeG: null }),
    ).toEqual({ minG: 30, maxG: 350 });
    expect(
      portionLimits({
        name: 'Aceite de canola',
        category: 'fats_oils',
        servingSizeG: null,
      }),
    ).toEqual({ minG: 5, maxG: 30 });
  });

  it('sin porción, los quesos usan límites propios dentro de lácteos', () => {
    expect(
      portionLimits({
        name: 'Queso cheddar',
        category: 'dairy',
        servingSizeG: null,
      }),
    ).toEqual({ minG: 10, maxG: 60 });
    // La leche, el yogur y el queso cottage siguen la tabla de lácteos
    expect(
      portionLimits({
        name: 'Queso cottage, bajo en grasa',
        category: 'dairy',
        servingSizeG: null,
      }),
    ).toEqual(CATEGORY_LIMITS.dairy);
  });

  it('siempre entre 5 y 800 g, con el mínimo menor o igual al máximo', () => {
    const tiny = portionLimits({
      name: 'Pimienta',
      category: 'miscellaneous',
      servingSizeG: 0.5,
    });
    expect(tiny).toEqual({ minG: 5, maxG: 5 });
  });
});
