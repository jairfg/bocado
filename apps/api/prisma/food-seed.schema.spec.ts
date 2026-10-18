import {
  checkAtwater,
  FoodSeedSchema,
  isAlcoholic,
} from './food-seed.schema.js';

// Basado en "Fruta deshidratada en trozos" (FDC 167540) de usda.yml
function buildFood(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Fruta deshidratada en trozos (fruit leather)',
    category: 'sugars_sweets',
    data_source: 'USDA FoodData Central',
    source_dataset: 'SR Legacy',
    source_key: '167540',
    serving_size_g: 27,
    kcal_per_100g: 359,
    protein_g_per_100g: 1.0,
    carbs_g_per_100g: 82.8,
    fat_g_per_100g: 2.68,
    fiber_g_per_100g: null,
    sugar_g_per_100g: 57.6,
    sodium_mg_per_100g: 199,
    saturated_fat_g_per_100g: 0.65,
    vitamin_a_rae_mcg_per_100g: 3.0,
    vitamin_a_re_mcg_per_100g: null,
    vitamin_b1_mg_per_100g: 0.043,
    vitamin_b2_mg_per_100g: 0.1,
    vitamin_b3_mg_per_100g: 0.1,
    vitamin_b5_mg_per_100g: 0.319,
    vitamin_b6_mg_per_100g: 0.3,
    vitamin_b12_mcg_per_100g: 0.0,
    folate_dfe_mcg_per_100g: 4.0,
    ins_folic_acid_mcg_per_100g: null,
    vitamin_c_mg_per_100g: 56.0,
    vitamin_d_mcg_per_100g: 0.0,
    vitamin_e_mg_per_100g: 0.56,
    vitamin_k_mcg_per_100g: 18.2,
    choline_mg_per_100g: 12.9,
    calcium_mg_per_100g: 18.0,
    iron_mg_per_100g: 0.75,
    magnesium_mg_per_100g: 14.0,
    phosphorus_mg_per_100g: 24.0,
    potassium_mg_per_100g: 164,
    zinc_mg_per_100g: 0.19,
    selenium_mcg_per_100g: 2.7,
    copper_mg_per_100g: 0.171,
    manganese_mg_per_100g: 0.184,
    fluoride_mcg_per_100g: null,
    monounsaturated_fat_g_per_100g: 1.48,
    polyunsaturated_fat_g_per_100g: 0.55,
    trans_fat_g_per_100g: null,
    cholesterol_mg_per_100g: 0.0,
    measures: [{ name: 'package', grams: 27 }],
    ...overrides,
  };
}

describe('FoodSeedSchema', () => {
  it('acepta un alimento válido y conserva los null', () => {
    const result = FoodSeedSchema.safeParse(buildFood());

    expect(result.success).toBe(true);
    const food = result.data!;
    expect(food.fiberGPer100g).toBeNull();
    expect(food.micros.fluoride_mcg_per_100g).toBeNull();
    expect(food.micros.trans_fat_g_per_100g).toBeNull();
    // 0 reportado sigue siendo 0, distinto de null
    expect(food.micros.vitamin_d_mcg_per_100g).toBe(0);
    expect(food.micros).not.toHaveProperty('vitamin_a_re_mcg_per_100g');
    expect(food.micros).not.toHaveProperty('ins_folic_acid_mcg_per_100g');
    expect(food.measures).toEqual([{ name: 'package', grams: 27 }]);
  });

  it('rechaza un alimento sin kcal', () => {
    const { kcal_per_100g: _omitted, ...withoutKcal } = buildFood();

    const result = FoodSeedSchema.safeParse(withoutKcal);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['kcal_per_100g']);
  });

  it('rechaza una categoría inexistente', () => {
    const result = FoodSeedSchema.safeParse(buildFood({ category: 'snacks' }));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['category']);
  });
});

describe('checkAtwater', () => {
  it('marca un alimento con kcal inconsistentes', () => {
    // 1×4 + 10×4 + 1×9 = 53 kcal calculadas frente a 300 declaradas
    const check = checkAtwater({
      kcalPer100g: 300,
      proteinGPer100g: 1,
      carbsGPer100g: 10,
      fatGPer100g: 1,
    });

    expect(check.consistent).toBe(false);
    expect(check.expectedKcal).toBe(53);
  });

  it('acepta un alimento consistente', () => {
    // 1×4 + 82.8×4 + 2.68×9 = 359.32 kcal calculadas frente a 359
    const check = checkAtwater({
      kcalPer100g: 359,
      proteinGPer100g: 1,
      carbsGPer100g: 82.8,
      fatGPer100g: 2.68,
    });

    expect(check.consistent).toBe(true);
  });

  it('no advierte por diferencias pequeñas en alimentos casi sin calorías', () => {
    // Café colado (FDC 171890): 0.12×4 + 0×4 + 0.02×9 = 0.66 kcal calculadas
    // frente a 1 declarada. Es +52 %, pero solo 0.34 kcal de diferencia.
    const check = checkAtwater({
      kcalPer100g: 1,
      proteinGPer100g: 0.12,
      carbsGPer100g: 0,
      fatGPer100g: 0.02,
    });

    expect(check.deviation).toBeGreaterThan(0.15);
    expect(check.consistent).toBe(true);
  });

  it('advierte si las calculadas son 0 y las declaradas superan 20 kcal', () => {
    // Licor destilado (FDC 174815): las kcal vienen del alcohol (7 kcal/g)
    const check = checkAtwater({
      kcalPer100g: 231,
      proteinGPer100g: 0,
      carbsGPer100g: 0,
      fatGPer100g: 0,
    });

    expect(check.deviation).toBeNull();
    expect(check.consistent).toBe(false);
  });
});

describe('isAlcoholic', () => {
  it.each([
    ['Vino tinto de mesa', true],
    ['Cerveza light, promedio de todas las marcas', true],
    [
      'Licor destilado (ginebra, ron, vodka o whisky), 80 proof (40% alc.)',
      true,
    ],
    ['Vino sin alcohol', false],
    ['Bebida de malta (incluye cerveza sin alcohol)', false],
    ['Refresco de cola, regular', false],
  ])('%s → %s', (name, expected) => {
    expect(isAlcoholic({ name, category: 'beverages' })).toBe(expected);
  });

  it('solo marca bebidas', () => {
    expect(
      isAlcoholic({ name: 'Vinagre de vino tinto', category: 'miscellaneous' }),
    ).toBe(false);
  });
});
