import { NO_RESTRICTIONS } from '@bocado/shared';
import {
  buildSearchWhere,
  restrictionConditions,
  toOrQuery,
  wordPattern,
} from './search-filters.js';

// Los patrones son regex de Postgres; para probarlos aquí se traducen los
// límites de palabra \m y \M a \b, que en JS significan lo mismo.
const toJsRegex = (pattern: string) =>
  new RegExp(pattern.replace(/\\[mM]/g, String.raw`\b`));

describe('buildSearchWhere', () => {
  it('siempre excluye alcohol y las categorías que no arman comidas', () => {
    const where = buildSearchWhere();

    expect(where.sql).toContain('is_alcoholic = false');
    expect(where.values).toEqual([
      'miscellaneous',
      'beverages',
      'sugars_sweets',
    ]);
  });
});

describe('restrictionConditions', () => {
  it('vegetariano excluye carnes y pescados por categoría y por nombre', () => {
    const sql = restrictionConditions({ ...NO_RESTRICTIONS, vegetarian: true });
    const values = sql.flatMap((condition) => condition.values);

    expect(values).toEqual(expect.arrayContaining(['meats', 'fish_seafood']));
    const meat = toJsRegex(
      values.find((v) => String(v).includes('cerdo')) as string,
    );
    expect(meat.test('frijoles horneados, con cerdo')).toBe(true);
    expect(meat.test('chili con carne y frijol')).toBe(true);
    expect(meat.test('aceite de pescado, salmon')).toBe(true);
    // "res" es palabra completa: "fresas" no es carne
    expect(meat.test('fresas crudas')).toBe(false);
    // y lo que dice "sin carne" se salva por la excepción
    const meatFree = toJsRegex(
      values.find((v) => String(v).includes('sin carne')) as string,
    );
    expect(meatFree.test('pollo vegetariano (sin carne)')).toBe(true);
    expect(sql.map((c) => c.sql).join(' ')).toContain(
      'is_vegetarian IS NOT FALSE',
    );
  });

  it('pescetariano excluye carnes pero no pescados', () => {
    const values = restrictionConditions({
      ...NO_RESTRICTIONS,
      pescatarian: true,
    }).flatMap((condition) => condition.values);

    expect(values).toContain('meats');
    expect(values).not.toContain('fish_seafood');
    const meat = toJsRegex(
      values.find((v) => String(v).includes('cerdo')) as string,
    );
    expect(meat.test('salmon rosado, cocido')).toBe(false);
  });

  it('excludeTerms filtra por nombre sin tildes, como palabra con plural', () => {
    const [condition] = restrictionConditions({
      ...NO_RESTRICTIONS,
      excludeTerms: ['Brócoli', 'huevos'],
    });

    expect(condition.sql).toContain('!~');
    const pattern = toJsRegex(condition.values[0] as string);
    expect(pattern.test('brocoli, cocido, hervido')).toBe(true);
    expect(pattern.test('huevo entero, cocido')).toBe(true);
    expect(pattern.test('huevos revueltos')).toBe(true);
    expect(pattern.test('brotes de soya')).toBe(false);
  });

  it('sin restricciones no agrega condiciones', () => {
    expect(restrictionConditions(NO_RESTRICTIONS)).toEqual([]);
  });
});

describe('wordPattern', () => {
  it('escapa los caracteres especiales de regex', () => {
    expect(wordPattern(['maní (tostado)'])).toContain(
      String.raw`mani \(tostado\)`,
    );
  });
});

describe('toOrQuery', () => {
  it('une las palabras con or, sin tildes ni signos', () => {
    expect(toOrQuery('Desayuno con avena, ¡rápido!')).toBe(
      'desayuno or con or avena or rapido',
    );
    expect(toOrQuery('¿?')).toBeNull();
  });
});
