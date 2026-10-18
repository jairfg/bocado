// Minúsculas y sin tildes, para comparar nombres de alimentos con regex.
export const normalizeText = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
