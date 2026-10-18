import { MenuRequestSchema } from '@bocado/shared';

describe('@bocado/shared MenuRequestSchema', () => {
  it('acepta un request válido', () => {
    const result = MenuRequestSchema.safeParse({
      kcal: 2000,
      macros: { proteinPct: 30, carbsPct: 45, fatPct: 25 },
      meals: ['desayuno', 'almuerzo', 'cena'],
      restrictions: 'sin lactosa',
    });

    expect(result.success).toBe(true);
  });

  it('rechaza macros que no suman 100', () => {
    const result = MenuRequestSchema.safeParse({
      kcal: 2000,
      macros: { proteinPct: 30, carbsPct: 45, fatPct: 20 },
      meals: ['almuerzo'],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'proteinPct + carbsPct + fatPct deben sumar 100',
    );
  });
});
