import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { parse } from 'yaml';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  checkAtwater,
  FoodSeedSchema,
  isAlcoholic,
} from './food-seed.schema.js';

const DATA_FILE = new URL('../../../data/foods/usda.yml', import.meta.url);

// `prisma db seed` carga el .env a través de prisma.config.ts
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Falta DATABASE_URL: ejecuta el seed con npm run db:seed');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

type Rejected = { name: string; reason: string };
type Warning = {
  name: string;
  kcal: number;
  expectedKcal: number;
  deviation: number | null;
};

function nameOf(item: unknown, index: number): string {
  if (typeof item === 'object' && item !== null && 'name' in item) {
    const { name } = item;
    if (typeof name === 'string' && name.trim()) return name;
  }
  return `(alimento #${index + 1} sin nombre)`;
}

function formatDeviation(deviation: number | null): string {
  if (deviation === null) return 'calculadas = 0';
  const pct = (deviation * 100).toFixed(1);
  return `${deviation > 0 ? '+' : ''}${pct} %`;
}

async function main(): Promise<void> {
  const data: unknown = parse(readFileSync(DATA_FILE, 'utf8'));
  if (!Array.isArray(data)) {
    throw new Error(`${DATA_FILE.pathname} debe contener una lista`);
  }

  const rejected: Rejected[] = [];
  const warnings: Warning[] = [];
  const alcoholic: string[] = [];
  let imported = 0;

  for (const [index, item] of data.entries()) {
    const result = FoodSeedSchema.safeParse(item);
    if (!result.success) {
      rejected.push({
        name: nameOf(item, index),
        reason: result.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      });
      continue;
    }

    const { measures, ...data } = result.data;
    const food = { ...data, isAlcoholic: isAlcoholic(data) };
    if (food.isAlcoholic) {
      alcoholic.push(`${food.name} (FDC ${food.sourceKey})`);
    }

    const atwater = checkAtwater(food);
    if (!atwater.consistent) {
      warnings.push({
        name: food.name,
        kcal: food.kcalPer100g,
        expectedKcal: atwater.expectedKcal,
        deviation: atwater.deviation,
      });
    }

    // Upsert por sourceKey: si ya existe se actualiza y sus medidas se
    // reemplazan, así correr el seed dos veces deja el mismo resultado.
    await prisma.food.upsert({
      where: { sourceKey: food.sourceKey },
      create: { ...food, measures: { create: measures } },
      update: { ...food, measures: { deleteMany: {}, create: measures } },
    });
    imported++;
  }

  if (rejected.length > 0) {
    console.log(`\nRechazados (${rejected.length}):`);
    for (const { name, reason } of rejected) {
      console.log(`  - ${name}: ${reason}`);
    }
  }

  if (warnings.length > 0) {
    console.log(
      `\nAdvertencias Atwater (${warnings.length}), kcal declaradas vs calculadas:`,
    );
    for (const w of warnings) {
      console.log(
        `  - ${w.name}: ${w.kcal} vs ${w.expectedKcal.toFixed(1)} (${formatDeviation(w.deviation)})`,
      );
    }
  }

  console.log(`\nMarcados como alcohólicos (${alcoholic.length}):`);
  for (const name of alcoholic) {
    console.log(`  - ${name}`);
  }

  console.log('\nResumen');
  console.log(`  Importados:   ${imported}`);
  console.log(`  Rechazados:   ${rejected.length}`);
  console.log(`  Advertencias: ${warnings.length}`);
  console.log(`  Alcohólicos:  ${alcoholic.length}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
