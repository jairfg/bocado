import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Contador local de textos embebidos por día, en un archivo ignorado por
// git. Google reinicia la cuota diaria a medianoche hora del Pacífico, así
// que el día se calcula en esa zona y el contador vuelve a 0 al cambiar.
// Solo cuenta lo que embebe el script; las consultas de la API y de la
// evaluación también gastan cuota (por eso el tope deja margen).
const LEDGER_FILE = new URL('../.embedding-quota.json', import.meta.url);

type Ledger = { date: string; texts: number };

// en-CA da el formato AAAA-MM-DD
export const pacificDate = (now = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(
    now,
  );

export function textsUsedToday(): number {
  if (!existsSync(LEDGER_FILE)) return 0;
  const ledger = JSON.parse(readFileSync(LEDGER_FILE, 'utf8')) as Ledger;
  return ledger.date === pacificDate() ? ledger.texts : 0;
}

// Se llama después de cada lote: si la corrida se corta, el contador ya
// está al día.
export function recordTexts(count: number): void {
  const ledger: Ledger = {
    date: pacificDate(),
    texts: textsUsedToday() + count,
  };
  writeFileSync(LEDGER_FILE, `${JSON.stringify(ledger, null, 2)}\n`);
}
