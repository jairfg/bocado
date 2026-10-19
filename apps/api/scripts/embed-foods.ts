// Embebe los alimentos que lo necesitan, en lotes y respetando los límites
// del plan gratuito de Gemini Embedding.
//
//   npm run db:embed -w api
//   npm run db:embed -w api -- --limit 50
//   npm run db:embed -w api -- --dry-run      (solo muestra el plan)
//
// Es idempotente y reanudable: solo procesa alimentos sin embedding, con
// otro modelo o cuyo texto cambió (compara el hash). Si se corta, o llega
// al tope diario, la siguiente corrida sigue donde quedó.
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { toVectorLiteral } from '../src/common/pgvector.js';
import { validateEnv } from '../src/config/env.js';
import {
  buildEmbeddingText,
  hashEmbeddingText,
} from '../src/foods/embedding-text.js';
import { EXCLUDED_CATEGORIES } from '../src/foods/search-filters.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { EmbeddingService } from '../src/llm/embedding.service.js';
import { createEmbeddingModels } from '../src/llm/llm.providers.js';
import { pacificDate, recordTexts, textsUsedToday } from './quota-ledger.js';

// Plan gratuito: Google cuenta cada texto de un lote como una solicitud,
// tanto en el límite por minuto (100) como en el diario (1,000). Se
// comprobó con un lote de 50: el contador de AI Studio subió 50 en ambos.
const TEXTS_PER_MINUTE = 90;
// 80 % de los 30,000 tokens por minuto
const TOKENS_PER_MINUTE = 24_000;
// Por corrida y por día. Deja 150 de los 1,000 para las consultas de
// búsqueda, la evaluación y los menús.
const DAILY_TEXT_LIMIT = 850;
// Dos lotes por minuto en lugar de uno grande: el ritmo es más parejo
const DEFAULT_BATCH_SIZE = 45;
// Google no informa tokens en embeddings: se estiman. En español rondan
// 4 caracteres por token; con 3 la estimación queda por encima.
const estimateTokens = (text: string): number => Math.ceil(text.length / 3);

const { values: args } = parseArgs({
  options: {
    limit: { type: 'string' },
    'batch-size': { type: 'string', default: String(DEFAULT_BATCH_SIZE) },
    'dry-run': { type: 'boolean', default: false },
  },
});

function positiveInt(name: string, value: string | undefined) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`--${name} debe ser un entero positivo`);
  }
  return number;
}

const limit = positiveInt('limit', args.limit);
const batchSize = positiveInt('batch-size', args['batch-size'])!;
if (batchSize > TEXTS_PER_MINUTE) {
  throw new Error(`--batch-size no puede superar ${TEXTS_PER_MINUTE}`);
}

// Ventana deslizante de 60 s con los textos y tokens ya enviados: en
// cualquier minuto, no más de TEXTS_PER_MINUTE textos.
class MinuteWindow {
  private sent: { at: number; texts: number; tokens: number }[] = [];

  async reserve(texts: number, tokens: number): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.sent = this.sent.filter((entry) => now - entry.at < 60_000);
      const usedTexts = this.sent.reduce((sum, e) => sum + e.texts, 0);
      const usedTokens = this.sent.reduce((sum, e) => sum + e.tokens, 0);
      if (
        usedTexts + texts <= TEXTS_PER_MINUTE &&
        usedTokens + tokens <= TOKENS_PER_MINUTE
      ) {
        this.sent.push({ at: now, texts, tokens });
        return;
      }
      const waitMs = 60_000 - (now - this.sent[0].at) + 250;
      console.log(
        `  Pausa de ${Math.ceil(waitMs / 1000)} s para respetar el límite por minuto`,
      );
      await sleep(waitMs);
    }
  }
}

if (existsSync('.env')) process.loadEnvFile('.env');
const env = validateEnv(process.env);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});
const models = createEmbeddingModels(env);
if (!models) {
  throw new Error(
    'Este script necesita embeddings reales: LLM_PROVIDER=google',
  );
}
const embeddings = new EmbeddingService(models);

const excluded = new Set<string>(EXCLUDED_CATEGORIES);
const format = (n: number) => n.toLocaleString('es-PE');

async function main(): Promise<void> {
  const started = performance.now();
  const foods = await prisma.food.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      kcalPer100g: true,
      proteinGPer100g: true,
      carbsGPer100g: true,
      fatGPer100g: true,
      fiberGPer100g: true,
      sugarGPer100g: true,
      sodiumMgPer100g: true,
      embeddingModel: true,
      embeddingTextHash: true,
    },
    orderBy: { id: 'asc' },
  });
  // Prisma no puede leer columnas vector: basta saber cuáles tienen valor
  const withEmbedding = new Set(
    (
      await prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM foods WHERE embedding IS NOT NULL
      `
    ).map((row) => row.id),
  );

  // Bebidas, especias y dulces no se embeben: la búsqueda los excluye
  // siempre, así que solo gastarían cuota.
  const searchable = foods.filter((food) => !excluded.has(food.category));
  const pending = searchable
    .map((food) => {
      const text = buildEmbeddingText(food);
      return { ...food, text, hash: hashEmbeddingText(text) };
    })
    .filter(
      (food) =>
        !withEmbedding.has(food.id) ||
        food.embeddingModel !== embeddings.modelId ||
        food.embeddingTextHash !== food.hash,
    );

  const usedToday = textsUsedToday();
  const leftToday = Math.max(0, DAILY_TEXT_LIMIT - usedToday);
  const thisRun = pending.slice(0, Math.min(limit ?? Infinity, leftToday));
  const batchCount = Math.ceil(thisRun.length / batchSize);

  console.log(`Modelo: ${embeddings.modelId}`);
  console.log(
    `Pendientes: ${format(pending.length)} de ${format(searchable.length)} buscables (se omiten ${format(foods.length - searchable.length)} de categorías excluidas)`,
  );
  console.log(
    `Hoy (${pacificDate()}, hora del Pacífico): ${format(usedToday)} de ${format(DAILY_TEXT_LIMIT)} textos usados`,
  );
  console.log(
    `Esta corrida: ${format(thisRun.length)} alimentos en ${batchCount} lotes de hasta ${batchSize}, ~${Math.ceil(thisRun.length / TEXTS_PER_MINUTE)} min`,
  );
  if (thisRun.length > 0) console.log(`Ejemplo de texto: "${thisRun[0].text}"`);

  if (args['dry-run']) {
    const afterToday = Math.max(0, pending.length - leftToday);
    const days =
      (leftToday > 0 ? 1 : 0) + Math.ceil(afterToday / DAILY_TEXT_LIMIT);
    console.log(
      `Para terminar: ${days} corrida(s) en días distintos, ${format(pending.length)} textos, ~${format(pending.reduce((sum, f) => sum + estimateTokens(f.text), 0))} tokens`,
    );
    return;
  }

  const window = new MinuteWindow();
  let done = 0;
  let requests = 0;
  let tokensSent = 0;
  let stopReason: string | null = null;

  for (let b = 0; b < batchCount; b++) {
    const batch = thisRun.slice(b * batchSize, (b + 1) * batchSize);
    const tokens = batch.reduce((sum, f) => sum + estimateTokens(f.text), 0);

    // Se vuelve a mirar el contador antes de cada lote por si otra corrida
    // gastó cuota o cambió el día
    if (
      done + batch.length > DAILY_TEXT_LIMIT ||
      textsUsedToday() + batch.length > DAILY_TEXT_LIMIT
    ) {
      stopReason = `se alcanzó el tope de ${format(DAILY_TEXT_LIMIT)} textos`;
      break;
    }
    await window.reserve(batch.length, tokens);

    let vectors: number[][];
    try {
      vectors = await embeddings.embedDocuments(batch.map((f) => f.text));
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        // 429: no se reintenta. La próxima corrida sigue donde quedó.
        stopReason = 'el proveedor respondió 429 (límite de cuota)';
        break;
      }
      throw error;
    }
    requests++;
    tokensSent += tokens;
    recordTexts(batch.length);

    // SQL parametrizado: el vector viaja como texto y se convierte con
    // ::vector. Todo el lote en una transacción.
    await prisma.$transaction(
      batch.map(
        (food, i) => prisma.$executeRaw`
          UPDATE foods
          SET embedding = ${toVectorLiteral(vectors[i])}::vector,
              embedding_model = ${embeddings.modelId},
              embedding_text_hash = ${food.hash}
          WHERE id = ${food.id}
        `,
      ),
    );
    done += batch.length;
    console.log(
      `[lote ${b + 1}/${batchCount}] ${format(done)}/${format(thisRun.length)} (${Math.round((done / thisRun.length) * 100)} %) · ~${format(tokens)} tokens`,
    );
  }

  if (thisRun.length === 0 && pending.length > 0) {
    stopReason = `hoy ya se usaron ${format(usedToday)} de ${format(DAILY_TEXT_LIMIT)} textos`;
  }

  const seconds = Math.round((performance.now() - started) / 1000);
  console.log('\nResumen');
  console.log(`  Embebidos ahora:        ${format(done)}`);
  console.log(`  Pendientes al terminar: ${format(pending.length - done)}`);
  console.log(
    `  Solicitudes a la API:   ${requests} lotes (${format(done)} textos, ~${format(tokensSent)} tokens estimados)`,
  );
  console.log(
    `  Usados hoy:             ${format(textsUsedToday())} de ${format(DAILY_TEXT_LIMIT)} textos`,
  );
  console.log(
    `  Duración:               ${Math.floor(seconds / 60)} min ${seconds % 60} s`,
  );
  if (stopReason) {
    console.log(
      `\nSe detuvo porque ${stopReason}. Vuelve a correr el script para continuar donde quedó; el tope diario se reinicia a medianoche, hora del Pacífico.`,
    );
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
