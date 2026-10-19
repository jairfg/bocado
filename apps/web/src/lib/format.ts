const integer = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 1,
});

export const formatKcal = (kcal: number) => `${integer.format(kcal)} kcal`;

export const formatGrams = (grams: number) => `${oneDecimal.format(grams)} g`;

export const formatInteger = (value: number) => integer.format(value);

// +3,2 % / −4 %: signo explícito para leer desvíos de un vistazo
export function formatDeviation(pct: number): string {
  if (pct === 0) return '0 %';
  const sign = pct > 0 ? '+' : '−';
  return `${sign}${oneDecimal.format(Math.abs(pct))} %`;
}

export function formatMs(ms: number): string {
  return ms < 1000
    ? `${integer.format(ms)} ms`
    : `${oneDecimal.format(ms / 1000)} s`;
}
