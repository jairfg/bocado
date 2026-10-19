import {
  buildEmbeddingText,
  describeFood,
  hashEmbeddingText,
  type EmbeddableFood,
} from './embedding-text.js';

const chicken: EmbeddableFood = {
  name: 'Pechuga de pollo, asada',
  category: 'meats',
  kcalPer100g: 165,
  proteinGPer100g: 31,
  carbsGPer100g: 0,
  fatGPer100g: 3,
  fiberGPer100g: 0,
  sugarGPer100g: 0,
  sodiumMgPer100g: 74,
};

describe('buildEmbeddingText', () => {
  it('combina nombre, categoría legible y descriptores', () => {
    expect(buildEmbeddingText(chicken)).toBe(
      'Pechuga de pollo, asada. Categoría: carnes y aves. Alto en proteína, bajo en grasa.',
    );
  });

  it('omite los descriptores si ninguno aplica', () => {
    const text = buildEmbeddingText({
      ...chicken,
      name: 'Papa cocida',
      category: 'tubers_roots',
      kcalPer100g: 87,
      proteinGPer100g: 1.9,
      carbsGPer100g: 20,
      fatGPer100g: 3.5,
    });

    expect(text).toBe('Papa cocida. Categoría: tubérculos y raíces.');
  });

  it('no deriva descriptores de valores no medidos (null)', () => {
    const lentils = {
      ...chicken,
      name: 'Lentejas cocidas',
      category: 'legumes',
      proteinGPer100g: 9,
      fatGPer100g: 0.4,
      carbsGPer100g: 20,
      kcalPer100g: 116,
      sugarGPer100g: null,
      sodiumMgPer100g: null,
    };

    expect(describeFood({ ...lentils, fiberGPer100g: 7.9 })).toContain(
      'alto en fibra',
    );
    expect(describeFood({ ...lentils, fiberGPer100g: null })).not.toContain(
      'alto en fibra',
    );
  });
});

describe('hashEmbeddingText', () => {
  it('es estable y cambia si cambia el texto', () => {
    const text = buildEmbeddingText(chicken);

    expect(hashEmbeddingText(text)).toBe(hashEmbeddingText(text));
    expect(hashEmbeddingText(text)).toMatch(/^[0-9a-f]{64}$/);
    // Otro valor de grasa cambia el descriptor y, con él, el hash
    const leaner = buildEmbeddingText({ ...chicken, fatGPer100g: 1 });
    const fattier = buildEmbeddingText({ ...chicken, fatGPer100g: 8 });
    expect(hashEmbeddingText(fattier)).not.toBe(hashEmbeddingText(text));
    expect(hashEmbeddingText(leaner)).toBe(hashEmbeddingText(text));
  });
});
