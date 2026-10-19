// Evalúa la búsqueda de alimentos sin LLM: recall@10 de un set fijo de
// consultas, comparando solo texto, solo semántica e híbrida.
//
//   npm run eval:search -w api
//
// Necesita embeddings reales (corre en local, no en CI). Gasta 1 solicitud
// de embeddings: todas las consultas van en un solo lote.
import { existsSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { normalizeText } from '../src/common/normalize-text.js';
import { validateEnv, type Env } from '../src/config/env.js';
import {
  FoodSearchService,
  type SearchMode,
} from '../src/foods/food-search.service.js';
import { buildSearchWhere } from '../src/foods/search-filters.js';
import { EmbeddingService } from '../src/llm/embedding.service.js';
import { createEmbeddingModels } from '../src/llm/llm.providers.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { EVAL_CASES, type EvalCase } from './search-eval-cases.js';

const K = 10;
const MODES: readonly SearchMode[] = ['text', 'semantic', 'hybrid'];

if (existsSync('.env')) process.loadEnvFile('.env');
const env = validateEnv(process.env);
// Fuera de Nest las dependencias se arman a mano (tsx no emite los
// metadatos de tipos que usa la inyección de dependencias).
const prisma = new PrismaService(new ConfigService<Env, true>(env));
const embeddings = new EmbeddingService(createEmbeddingModels(env));
const search = new FoodSearchService(prisma, embeddings);

type Food = { id: number; name: string; category: string };

// Alimentos que la búsqueda puede devolver para esta consulta (mismos
// filtros duros), con el nombre normalizado para los patrones
async function eligible(evalCase: EvalCase): Promise<Food[]> {
  const rows = await prisma.$queryRaw<Food[]>`
    SELECT id, name, category FROM foods
    WHERE ${buildSearchWhere(evalCase.filters)}
  `;
  return rows.map((row) => ({ ...row, name: normalizeText(row.name) }));
}

const isRelevant = (relevant: NonNullable<EvalCase['relevant']>) => (f: Food) =>
  relevant.name.test(f.name) &&
  (!relevant.categories ||
    (relevant.categories as readonly string[]).includes(f.category));

const isForbidden =
  (forbidden: NonNullable<EvalCase['forbidden']>) => (f: Food) =>
    (forbidden.categories as readonly string[]).includes(f.category) ||
    forbidden.name.test(f.name);

const percent = (value: number) => `${Math.round(value * 100)} %`.padStart(6);

async function main(): Promise<void> {
  await prisma.$connect();
  const [{ total, embedded }] = await prisma.$queryRaw<
    { total: number; embedded: number }[]
  >`
    SELECT count(*)::int AS total, count(embedding)::int AS embedded
    FROM foods WHERE ${buildSearchWhere()}
  `;
  console.log(`Alimentos buscables con embedding: ${embedded} de ${total}\n`);

  const requests = EVAL_CASES.map((c) => ({
    text: c.query,
    filters: c.filters,
    limit: K,
  }));
  // Una sola solicitud de embeddings para todas las consultas; los modos
  // semántico e híbrido reutilizan los mismos vectores.
  const vectors = await embeddings.embedQueries(requests.map((r) => r.text));
  const results = new Map<SearchMode, number[][]>();
  for (const mode of MODES) {
    results.set(mode, await search.rankMany(requests, vectors, mode));
  }

  const header = `${'Consulta'.padEnd(34)}${MODES.map((m) => m.padStart(10)).join('')}`;
  console.log(`recall@${K}\n${header}`);
  const recalls = new Map<SearchMode, number[]>(MODES.map((m) => [m, []]));
  const violations: string[] = [];

  for (const [i, evalCase] of EVAL_CASES.entries()) {
    const foods = await eligible(evalCase);
    const byId = new Map(foods.map((f) => [f.id, f]));
    const top = (mode: SearchMode) =>
      results.get(mode)![i].flatMap((id) => byId.get(id) ?? []);

    if (evalCase.relevant) {
      const relevant = foods.filter(isRelevant(evalCase.relevant));
      const cells = MODES.map((mode) => {
        const hits = top(mode).filter(isRelevant(evalCase.relevant!)).length;
        const recall = hits / Math.min(K, relevant.length);
        recalls.get(mode)!.push(recall);
        return percent(recall).padStart(10);
      });
      console.log(
        `${`${evalCase.query} (${relevant.length})`.padEnd(34)}${cells.join('')}`,
      );
    }
    if (evalCase.forbidden) {
      const cells = MODES.map((mode) => {
        const bad = top(mode).filter(isForbidden(evalCase.forbidden!));
        return `${mode}: ${bad.length}${
          bad.length > 0
            ? ` (${bad
                .map((f) => f.name)
                .slice(0, 3)
                .join('; ')})`
            : ''
        }`;
      });
      violations.push(
        `${evalCase.query}${evalCase.filters ? ' [con filtro vegetariano]' : ' [sin filtro]'}\n  ${cells.join('\n  ')}`,
      );
    }
  }

  const mean = (values: number[]) =>
    values.reduce((sum, v) => sum + v, 0) / values.length;
  console.log(
    `${'Promedio'.padEnd(34)}${MODES.map((m) => percent(mean(recalls.get(m)!)).padStart(10)).join('')}`,
  );
  console.log(`\nCarnes en el top ${K} (deberían ser 0):`);
  for (const line of violations) console.log(line);
  console.log(
    `\nSolicitudes de embeddings: 1 (${requests.length} textos en un lote)`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
