// pgvector recibe vectores como texto '[0.1,0.2,...]'. Se envía como
// parámetro y se convierte en SQL con ::vector.
export const toVectorLiteral = (vector: readonly number[]): string =>
  `[${vector.join(',')}]`;
