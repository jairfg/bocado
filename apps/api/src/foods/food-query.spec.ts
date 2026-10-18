import { FoodQuerySchema } from '@bocado/shared';

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
    });
  });

  it('usa 20 como límite por defecto', () => {
    expect(FoodQuerySchema.parse({}).limit).toBe(20);
  });

  it('respeta el límite máximo de 50', () => {
    expect(FoodQuerySchema.safeParse({ limit: '50' }).success).toBe(true);
    expect(FoodQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });
});
