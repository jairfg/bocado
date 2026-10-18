import { FoodQuerySchema } from '@bocado/shared';
import { buildFoodFilters } from './foods.service.js';

describe('FoodQuerySchema', () => {
  it('convierte los query params de string a número', () => {
    const query = FoodQuerySchema.parse({
      q: 'platano',
      maxKcal: '200',
      minProtein: '10.5',
      limit: '30',
    });

    expect(query).toEqual({
      q: 'platano',
      maxKcal: 200,
      minProtein: 10.5,
      limit: 30,
      includeAlcoholic: false,
    });
  });

  it('interpreta includeAlcoholic como booleano', () => {
    const parse = (value: string) =>
      FoodQuerySchema.parse({ includeAlcoholic: value }).includeAlcoholic;

    expect(parse('true')).toBe(true);
    expect(parse('false')).toBe(false);
    expect(FoodQuerySchema.safeParse({ includeAlcoholic: 'x' }).success).toBe(
      false,
    );
  });

  it('usa 20 como límite por defecto', () => {
    expect(FoodQuerySchema.parse({}).limit).toBe(20);
  });

  it('respeta el límite máximo de 50', () => {
    expect(FoodQuerySchema.safeParse({ limit: '50' }).success).toBe(true);
    expect(FoodQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });
});

describe('buildFoodFilters', () => {
  it('excluye los alcohólicos por defecto', () => {
    const where = buildFoodFilters(FoodQuerySchema.parse({ q: 'vino' }));

    expect(where.sql).toContain('is_alcoholic = false');
  });

  it('los incluye con includeAlcoholic=true', () => {
    const where = buildFoodFilters(
      FoodQuerySchema.parse({ q: 'vino', includeAlcoholic: 'true' }),
    );

    expect(where.sql).not.toContain('is_alcoholic');
    expect(where.values).toEqual(['%vino%']);
  });
});
