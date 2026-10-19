export const RESTRICTIONS_TAG = 'restricciones_usuario';

// Envuelve el texto del usuario en una etiqueta para que el modelo lo trate
// como dato. Sin < ni > el usuario no puede cerrar la etiqueta y escribir
// fuera del bloque. null si no hay texto.
export function delimitRestrictions(text: string | undefined): string | null {
  const clean = text?.replace(/[<>]/g, '').trim();
  return clean
    ? `<${RESTRICTIONS_TAG}>\n${clean}\n</${RESTRICTIONS_TAG}>`
    : null;
}
