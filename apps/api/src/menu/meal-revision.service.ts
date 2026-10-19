import { HttpException, Injectable, Logger } from '@nestjs/common';
import {
  LlmMealRevisionSchema,
  type FoodCategory,
  type LlmMealRevision,
  type MealSlot,
  type MenuDraftWarning,
  type RestrictionFilters,
} from '@bocado/shared';
import { FoodSearchService } from '../foods/food-search.service.js';
import {
  LlmService,
  type TokenUsage,
  type ToolLoopResult,
} from '../llm/llm.service.js';
import type { CandidateFood } from './candidate-selection.js';
import { CandidatesService } from './candidates.service.js';
import { capitalizedMealName, mealName } from './draft-progress.js';
import type { LlmCallBudget } from './llm-call-budget.js';
import { optimizeMeal, type PlannedMeal } from './meal-evaluation.js';
import {
  buildRevisionPrompt,
  REVISION_INSTRUCTIONS,
} from './revision-prompt.js';
import { ANSWER_TOOL, buildRevisionTools } from './revision-tools.js';

export const MAX_REVISIONS_PER_MEAL = 2;
// Pasos por revisión (cada uno es una llamada al LLM): buscar, evaluar,
// ajustar y entregar
export const MAX_TOOL_STEPS_PER_REVISION = 4;
// Con un solo paso el modelo tendría que responder sin buscar nada nuevo
const MIN_TOOL_STEPS_PER_REVISION = 2;
const SEARCH_RESULTS = 8;
const REVISION_TEMPERATURE = 0.2;

export type RevisionContext = {
  restrictions: RestrictionFilters;
  // Texto original, para el prompt (delimitado como dato del usuario)
  restrictionsText?: string;
  budget: LlmCallBudget;
  // Avisa al empezar cada revisión (progreso "revising_meal")
  onRevise?: (slot: MealSlot) => void;
};

export type RevisionOutcome = {
  meals: PlannedMeal[];
  warnings: MenuDraftWarning[];
  toolSteps: number;
  usage: TokenUsage;
};

type Tally = Omit<RevisionOutcome, 'meals'>;

type Evaluated = { meal: PlannedMeal | null; invalidIds: number[] };

const addTokens = (a: number | null, b: number | null) =>
  a === null || b === null ? null : a + b;

const truncate = (text: string, length = 40) =>
  text.length > length ? `${text.slice(0, length)}…` : text;

@Injectable()
export class MealRevisionService {
  private readonly logger = new Logger(MealRevisionService.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly foodSearch: FoodSearchService,
    private readonly candidates: CandidatesService,
  ) {}

  // Solo las comidas "needs_revision" llaman al LLM. Van en orden porque
  // comparten el presupuesto de llamadas.
  async reviseMeals(
    meals: readonly PlannedMeal[],
    context: RevisionContext,
  ): Promise<RevisionOutcome> {
    const tally: Tally = {
      warnings: [],
      toolSteps: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    const revised: PlannedMeal[] = [];
    for (const meal of meals) {
      revised.push(
        meal.status === 'needs_revision'
          ? await this.reviseMeal(meal, context, tally)
          : meal,
      );
    }
    return { meals: revised, ...tally };
  }

  private async reviseMeal(
    meal: PlannedMeal,
    context: RevisionContext,
    tally: Tally,
  ): Promise<PlannedMeal> {
    let best = meal;
    let revisions = 0;
    let stopReason: string | null = null;

    while (best.status === 'needs_revision') {
      if (revisions >= MAX_REVISIONS_PER_MEAL) {
        stopReason = `se hicieron las ${MAX_REVISIONS_PER_MEAL} revisiones permitidas`;
        break;
      }
      if (context.budget.remaining < MIN_TOOL_STEPS_PER_REVISION) {
        stopReason = `se agotó el presupuesto de ${context.budget.limit} llamadas al LLM`;
        break;
      }
      revisions++;
      context.onRevise?.(meal.slot);
      const outcome = await this.runRevision(best, revisions, context, tally);
      best = outcome.best;
      if (outcome.failure) {
        // Revisar es una mejora opcional: si el proveedor falla, se
        // entrega lo mejor que se alcanzó en vez de perder todo el menú
        tally.warnings.push({
          code: 'revision_failed',
          slot: meal.slot,
          message: `La revisión falló en ${mealName(meal.slot)} (${outcome.failure.message}); se usa el mejor resultado`,
        });
        break;
      }
    }

    if (best.status === 'needs_revision' && stopReason) {
      tally.warnings.push({
        code: 'revision_exhausted',
        slot: meal.slot,
        message: `${capitalizedMealName(meal.slot)} sigue fuera de tolerancia: ${stopReason}. Se usa el mejor resultado`,
      });
    }
    return { ...best, revisions };
  }

  private async runRevision(
    meal: PlannedMeal,
    revision: number,
    context: RevisionContext,
    tally: Tally,
  ): Promise<{ best: PlannedMeal; failure: HttpException | null }> {
    const label = `[revisión ${meal.slot} #${revision}]`;
    // Todas las combinaciones que el optimizador evaluó en esta revisión
    const attempts: PlannedMeal[] = [];

    const tools = buildRevisionTools({
      searchFoods: (query, category) =>
        this.traced(
          `${label} searchFoods("${truncate(query)}"${category ? `, ${category}` : ''})`,
          tally,
          () => this.search(query, category, context.restrictions),
          (foods) => `${foods.length} resultados`,
        ),
      evaluateMeal: (items) =>
        this.traced(
          `${label} evaluateMeal(${items.map((item) => item.foodId).join(', ')})`,
          tally,
          async () => {
            const { meal: evaluated, invalidIds } = await this.evaluate(
              meal,
              items,
              context.restrictions,
            );
            if (invalidIds.length > 0 || !evaluated) {
              return {
                error: `Estos foodId no existen o no cumplen las restricciones: ${invalidIds.join(', ')}. Usa solo ids de searchFoods o de la comida actual.`,
              };
            }
            attempts.push(evaluated);
            const { evaluation } = evaluated;
            return {
              withinTolerance: evaluation.withinTolerance,
              items: evaluation.items.map(
                ({ foodId, name, grams, minG, maxG }) => ({
                  foodId,
                  name,
                  grams,
                  minG,
                  maxG,
                }),
              ),
              totals: evaluation.totals,
              target: meal.target,
              deviationPct: evaluation.deviationPct,
              problems: evaluation.problems,
            };
          },
          (result) =>
            'error' in result
              ? 'ids inválidos'
              : result.withinTolerance
                ? 'dentro de tolerancia'
                : 'fuera de tolerancia',
        ),
    });

    let result: ToolLoopResult | null = null;
    let failure: HttpException | null = null;
    try {
      result = await this.llmService.runToolLoop({
        instructions: REVISION_INSTRUCTIONS,
        prompt: buildRevisionPrompt(meal, context.restrictionsText),
        tools,
        answerTool: ANSWER_TOOL,
        maxSteps: Math.min(
          MAX_TOOL_STEPS_PER_REVISION,
          context.budget.remaining,
        ),
        temperature: REVISION_TEMPERATURE,
        onStep: () => context.budget.use(),
        onStepEnd: (usage) => {
          tally.usage = {
            inputTokens: addTokens(tally.usage.inputTokens, usage.inputTokens),
            outputTokens: addTokens(
              tally.usage.outputTokens,
              usage.outputTokens,
            ),
          };
        },
      });
    } catch (error) {
      // También cuando el modelo no entrega respuesta en el último paso
      // (el SDK lo informa como error): lo evaluado hasta ahí se conserva
      if (!(error instanceof HttpException)) throw error;
      failure = error;
    }

    // La respuesta ya pasó por el esquema de submitMeal; aquí se valida
    // contra la base y el optimizador calcula los gramos finales
    let submitted: PlannedMeal | null = null;
    if (result && result.answer !== null) {
      const { items } = LlmMealRevisionSchema.parse(result.answer);
      const evaluated = await this.evaluate(meal, items, context.restrictions);
      submitted = evaluated.meal;
      for (const foodId of evaluated.invalidIds) {
        tally.warnings.push({
          code: 'unknown_food',
          slot: meal.slot,
          foodId,
          message: `En ${mealName(meal.slot)}, la revisión propuso el foodId ${foodId}, que no existe o no cumple las restricciones; se descartó`,
        });
      }
    }

    const best = pickBest(meal, attempts, submitted);
    this.logger.log(
      result
        ? `${label} ${result.steps} pasos, ${result.latencyMs} ms → ${best.status}${submitted ? '' : ' (sin respuesta final)'}`
        : `${label} falló → se conserva ${best.status}`,
    );
    return { best, failure };
  }

  // Las restricciones, el alcohol y las categorías excluidas vienen del
  // request, no de los argumentos del modelo
  private async search(
    query: string,
    category: FoodCategory | undefined,
    restrictions: RestrictionFilters,
  ): Promise<CandidateFood[]> {
    const [ids] = await this.foodSearch.searchMany([
      {
        text: query,
        filters: {
          categories: category ? [category] : undefined,
          restrictions,
          dishesOnly: true,
        },
        limit: SEARCH_RESULTS,
      },
    ]);
    return this.candidates.loadEligible(ids, restrictions);
  }

  private async evaluate(
    meal: PlannedMeal,
    items: LlmMealRevision['items'],
    restrictions: RestrictionFilters,
  ): Promise<Evaluated> {
    const unique = [
      ...new Map(items.map((item) => [item.foodId, item])).values(),
    ];
    const foods = await this.candidates.loadEligible(
      unique.map((item) => item.foodId),
      restrictions,
    );
    const byId = new Map(foods.map((food) => [food.id, food]));
    const valid = unique.filter((item) => byId.has(item.foodId));
    const invalidIds = unique
      .filter((item) => !byId.has(item.foodId))
      .map((item) => item.foodId);
    if (valid.length === 0) return { meal: null, invalidIds };

    const chosen = valid.map((item) => byId.get(item.foodId)!);
    const { evaluation, status } = optimizeMeal(
      chosen,
      valid.map((item) => item.grams),
      meal.target,
    );
    return {
      meal: { ...meal, foods: chosen, evaluation, status },
      invalidIds,
    };
  }

  // Traza de cada herramienta en los logs: qué se llamó, con argumentos
  // resumidos, y cuánto tardó. Sin el texto de las restricciones.
  private async traced<T>(
    call: string,
    tally: Tally,
    run: () => Promise<T>,
    summarize: (result: T) => string,
  ): Promise<T> {
    tally.toolSteps++;
    const start = performance.now();
    const result = await run();
    this.logger.log(
      `${call} → ${summarize(result)} · ${Math.round(performance.now() - start)} ms`,
    );
    return result;
  }
}

// Si la respuesta final entra en tolerancia, se respeta. Si no, gana la
// versión con menor error entre la comida de partida, las combinaciones
// evaluadas y la respuesta; ante empate, la anterior.
export function pickBest(
  current: PlannedMeal,
  attempts: readonly PlannedMeal[],
  submitted: PlannedMeal | null,
): PlannedMeal {
  if (submitted && submitted.status !== 'needs_revision') return submitted;
  return [...attempts, ...(submitted ? [submitted] : [])].reduce(
    (best, candidate) =>
      candidate.evaluation.score < best.evaluation.score ? candidate : best,
    current,
  );
}
