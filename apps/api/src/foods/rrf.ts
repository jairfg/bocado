// Reciprocal Rank Fusion: score(d) = Σ 1 / (k + posición de d en cada
// ranking), con posiciones desde 1. Usa solo la posición, no la escala de
// cada score, por eso puede unir la distancia coseno con ts_rank, que no
// son comparables. k = 60 es el valor del artículo original (Cormack et
// al., 2009): suaviza la ventaja de los primeros puestos.
export const RRF_K = 60;

export type FusedResult = { id: number; score: number };

// Dos sumas iguales en teoría pueden diferir en el último bit
// (1/61 + 1/63 frente a 1/63 + 1/61); por debajo de esto es empate.
const SCORE_EPSILON = 1e-12;

export function reciprocalRankFusion(
  rankings: readonly (readonly number[])[],
  k = RRF_K,
): FusedResult[] {
  const scores = new Map<number, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }

  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) =>
      Math.abs(b.score - a.score) > SCORE_EPSILON
        ? b.score - a.score
        : a.id - b.id,
    );
}
