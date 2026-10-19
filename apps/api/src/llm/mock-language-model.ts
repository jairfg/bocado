import {
  NO_RESTRICTIONS,
  RestrictionFiltersSchema,
  type LlmMenu,
  type RestrictionFilters,
} from '@bocado/shared';
import type { LanguageModel } from 'ai';
import { normalizeText } from '../common/normalize-text.js';
import { RESTRICTIONS_TAG } from './user-data.js';

// Modelo simulado para LLM_PROVIDER=mock: responde sin red y siempre igual
// ante la misma entrada, armando las respuestas desde los candidatos reales
// del prompt. Sirve para desarrollo local y para el frontend sin gastar
// cuota. Implementa la interfaz del SDK directamente (y no MockLanguageModelV4
// de ai/test, que guarda cada llamada en memoria).

type LanguageModelV4 = Extract<LanguageModel, { specificationVersion: 'v4' }>;
type CallOptions = Parameters<LanguageModelV4['doGenerate']>[0];
type GenerateResult = Awaited<ReturnType<LanguageModelV4['doGenerate']>>;
type JsonObject = Record<string, unknown>;

// Pausa por llamada, para que el progreso se vea en la interfaz
export const MOCK_LLM_DELAY_MS = 800;

const PROTEIN = ['meats', 'fish_seafood', 'eggs', 'legumes', 'dairy'];
const CARBS = ['cereals', 'tubers_roots'];
const PRODUCE = ['vegetables', 'fruits'];
const FATS = ['fats_oils', 'nuts_seeds'];

type Candidate = {
  id: number;
  category: string;
  kcal: number;
  protein: number;
  minG: number;
  maxG: number;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

// Todo el texto que escribió el código (system + user)
function promptText(options: CallOptions): string {
  return options.prompt
    .flatMap((message) =>
      message.role === 'system'
        ? [message.content]
        : message.role === 'user'
          ? message.content.flatMap((part) =>
              part.type === 'text' ? [part.text] : [],
            )
          : [],
    )
    .join('\n');
}

// Último resultado de herramienta del bucle, si lo hay
function lastToolResult(
  options: CallOptions,
): { toolName: string; value: unknown } | null {
  for (const message of [...options.prompt].reverse()) {
    if (message.role !== 'tool') continue;
    const part = message.content.at(-1);
    if (part?.type === 'tool-result') {
      const { output } = part;
      return {
        toolName: part.toolName,
        value: output.type === 'json' ? output.value : null,
      };
    }
  }
  return null;
}

// Reglas simples en lugar del modelo
export function interpretRestrictions(text: string): RestrictionFilters {
  const normalized = normalizeText(text);
  const vegan = /\bvegan[oa]s?\b/.test(normalized);
  const terms = (pattern: RegExp) =>
    [...normalized.matchAll(pattern)]
      .map((match) => match[1].trim())
      .filter((term) => term.length >= 2 && term.length <= 40);

  const excludeCategories = new Set<
    RestrictionFilters['excludeCategories'][number]
  >();
  if (vegan) {
    excludeCategories.add('dairy');
    excludeCategories.add('eggs');
  }
  if (
    /\b(sin lactosa|sin lacteos|intolerante a la lactosa)\b/.test(normalized)
  ) {
    excludeCategories.add('dairy');
  }

  const end = String.raw`(?=[,.;]|\sy\s|$)`;
  return RestrictionFiltersSchema.parse({
    vegetarian: vegan || /\bvegetarian[oa]s?\b/.test(normalized),
    pescatarian: /\bpesc[ae]tarian[oa]s?\b/.test(normalized),
    excludeCategories: [...excludeCategories],
    excludeTerms: terms(
      new RegExp(
        String.raw`(?:no me gustan?|no como|alergic[oa] (?:al?|a la)|evito)\s+(?:el |la |los |las )?([a-z ]+?)${end}`,
        'g',
      ),
    ).slice(0, 20),
    preferTerms: terms(
      new RegExp(
        String.raw`(?<!no )(?:me gustan?|prefiero)\s+(?:el |la |los |las )?([a-z ]+?)${end}`,
        'g',
      ),
    ).slice(0, 10),
  });
}

const CANDIDATE_LINE =
  /^(\d+) \| .+ \| ([a-z_]+) \| ([\d.]+), ([\d.]+), [\d.]+, [\d.]+ \| (\d+)–(\d+)$/;
const SUGGESTION_LINE = /^- ([a-z_]+): ([\d, ]+)$/;
const TARGET_LINE = /^- ([a-z_]+): \d+ kcal/;

// Por comida: la proteína más densa y el primer carbohidrato, verdura o
// fruta y grasa entre sus sugeridos, en la mitad de su porción. El
// optimizador ajusta los gramos.
export function buildMenu(prompt: string): LlmMenu {
  const lines = prompt.split('\n');
  const candidates = new Map<number, Candidate>();
  const suggestions = new Map<string, number[]>();
  const slots: string[] = [];
  for (const line of lines) {
    const candidate = CANDIDATE_LINE.exec(line);
    if (candidate) {
      const [, id, category, kcal, protein, minG, maxG] = candidate;
      candidates.set(Number(id), {
        id: Number(id),
        category,
        kcal: Number(kcal),
        protein: Number(protein),
        minG: Number(minG),
        maxG: Number(maxG),
      });
      continue;
    }
    const suggestion = SUGGESTION_LINE.exec(line);
    if (suggestion) {
      suggestions.set(
        suggestion[1],
        suggestion[2].split(',').map((id) => Number(id.trim())),
      );
      continue;
    }
    const target = TARGET_LINE.exec(line);
    if (target) slots.push(target[1]);
  }

  return {
    meals: slots.map((slot) => {
      const pool = (suggestions.get(slot) ?? [...candidates.keys()]).flatMap(
        (id) => candidates.get(id) ?? [],
      );
      const inGroup = (group: string[]) =>
        pool.filter((food) => group.includes(food.category));
      const proteinDensity = (food: Candidate) =>
        food.kcal > 0 ? food.protein / food.kcal : 0;
      const chosen = [
        inGroup(PROTEIN).sort(
          (a, b) => proteinDensity(b) - proteinDensity(a),
        )[0],
        inGroup(CARBS)[0],
        inGroup(PRODUCE)[0],
        inGroup(FATS)[0],
      ].filter((food): food is Candidate => food !== undefined);

      return {
        slot: slot as LlmMenu['meals'][number]['slot'],
        items: chosen.map((food) => ({
          foodId: food.id,
          grams: Math.round((food.minG + food.maxG) / 2 / 5) * 5,
        })),
      };
    }),
  };
}

// Revisión con herramientas: buscar según el problema, evaluar la comida
// con el primer alimento nuevo y entregar lo evaluado
function reviseStep(options: CallOptions, prompt: string) {
  const current = [...prompt.matchAll(/^- (\d+) \|/gm)].map((m) =>
    Number(m[1]),
  );
  const last = lastToolResult(options);
  const forced =
    options.toolChoice?.type === 'tool' &&
    options.toolChoice.toolName === 'submitMeal';

  if (forced || last?.toolName === 'evaluateMeal') {
    const evaluated = (last?.value as JsonObject | null)?.items;
    const items = Array.isArray(evaluated)
      ? evaluated.map((item: JsonObject) => ({
          foodId: item.foodId,
          grams: item.grams,
        }))
      : current.map((foodId) => ({ foodId }));
    return { toolName: 'submitMeal', input: { items } };
  }

  if (last?.toolName === 'searchFoods' && Array.isArray(last.value)) {
    const found = (last.value as JsonObject[])
      .map((food) => Number(food.foodId))
      .find((id) => !current.includes(id));
    const ids = found === undefined ? current : [...current, found];
    return {
      toolName: 'evaluateMeal',
      input: { items: ids.map((foodId) => ({ foodId })) },
    };
  }

  // Nombres concretos: con LLM_PROVIDER=mock la búsqueda es solo por texto
  const problems = normalizeText(prompt.split('Problemas:')[1] ?? '');
  const query = /proteina/.test(problems)
    ? 'pollo pescado huevo tofu lentejas yogur queso'
    : /carbohidratos/.test(problems)
      ? 'arroz papa pan avena pasta'
      : /grasa/.test(problems)
        ? 'aceite palta nueces mani'
        : 'brocoli zanahoria espinaca tomate manzana';
  return { toolName: 'searchFoods', input: { query } };
}

const usage = (input: string, output: string) => ({
  inputTokens: {
    total: Math.ceil(input.length / 4),
    noCache: Math.ceil(input.length / 4),
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: Math.ceil(output.length / 4),
    text: Math.ceil(output.length / 4),
    reasoning: undefined,
  },
});

function respond(options: CallOptions): GenerateResult {
  const prompt = promptText(options);

  if (options.tools?.some((tool) => tool.name === 'submitMeal')) {
    const { toolName, input } = reviseStep(options, prompt);
    const json = JSON.stringify(input);
    return {
      content: [
        {
          type: 'tool-call',
          toolCallId: `mock-${options.prompt.length}`,
          toolName,
          input: json,
        },
      ],
      finishReason: { unified: 'tool-calls', raw: undefined },
      usage: usage(prompt, json),
      warnings: [],
    };
  }

  const schema =
    options.responseFormat?.type === 'json'
      ? (options.responseFormat.schema as { properties?: JsonObject })
      : undefined;
  let output: unknown = {};
  if (schema?.properties && 'vegetarian' in schema.properties) {
    const delimited = new RegExp(
      `<${RESTRICTIONS_TAG}>\\n([\\s\\S]*?)\\n</${RESTRICTIONS_TAG}>`,
    ).exec(prompt);
    output = delimited ? interpretRestrictions(delimited[1]) : NO_RESTRICTIONS;
  } else if (schema?.properties && 'meals' in schema.properties) {
    output = buildMenu(prompt);
  }

  const text = JSON.stringify(output);
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: undefined },
    usage: usage(prompt, text),
    warnings: [],
  };
}

export function createMockLanguageModel(
  delayMs = MOCK_LLM_DELAY_MS,
): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'bocado-mock',
    modelId: 'mock',
    supportedUrls: {},
    doGenerate: async (options) => {
      await sleep(delayMs, options.abortSignal);
      return respond(options);
    },
    doStream: () => {
      throw new Error('El modelo simulado no implementa streaming');
    },
  };
}
