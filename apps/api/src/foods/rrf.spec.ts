import { reciprocalRankFusion, RRF_K } from './rrf.js';

describe('reciprocalRankFusion', () => {
  it('suma 1 / (k + posición) de cada ranking', () => {
    const fused = reciprocalRankFusion([
      [10, 20, 30],
      [30, 10],
    ]);

    expect(fused.map((r) => r.id)).toEqual([10, 30, 20]);
    // 10: 1.º y 2.º → 1/61 + 1/62
    expect(fused[0].score).toBeCloseTo(1 / (RRF_K + 1) + 1 / (RRF_K + 2), 12);
    // 20 solo aparece en el primero, 2.º lugar
    expect(fused[2].score).toBeCloseTo(1 / (RRF_K + 2), 12);
  });

  it('premia aparecer en ambos rankings sobre ganar solo uno', () => {
    // 1 es primero solo en texto; 2 es segundo en ambos
    const fused = reciprocalRankFusion([
      [1, 2],
      [3, 2],
    ]);

    expect(fused[0].id).toBe(2);
  });

  it('desempata por id cuando los scores son iguales', () => {
    // 7 y 4 tienen las mismas posiciones cruzadas: 1/61 + 1/63 en ambos,
    // sumados en distinto orden (en coma flotante pueden diferir).
    const fused = reciprocalRankFusion([
      [7, 9, 4],
      [4, 9, 7],
    ]);

    expect(fused.map((r) => r.id)).toEqual([4, 7, 9]);
  });

  it('es determinista con un solo ranking y con rankings vacíos', () => {
    expect(reciprocalRankFusion([[5, 3, 8], []]).map((r) => r.id)).toEqual([
      5, 3, 8,
    ]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });
});
