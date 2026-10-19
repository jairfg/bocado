import { Injectable } from '@nestjs/common';
import {
  LlmMenuSchema,
  type MenuDraft,
  type MenuRequest,
  type StageLatency,
} from '@bocado/shared';
import { withRunContext } from '../common/run-context.js';
import { LlmService, type TokenUsage } from '../llm/llm.service.js';
import { CandidatesService } from './candidates.service.js';
import { DistributionService } from './distribution.service.js';
import { progress, type ProgressCallback } from './draft-progress.js';
import { LlmCallBudget } from './llm-call-budget.js';
import { MealRevisionService } from './meal-revision.service.js';
import { buildMenuDraft, planMeals } from './menu-draft.builder.js';
import { buildMenuPrompt, MENU_INSTRUCTIONS } from './menu-prompt.js';
import { RestrictionsService } from './restrictions.service.js';

// Baja para que el modelo se ciña a la lista de candidatos.
const TEMPERATURE = 0.2;

type Stage = Exclude<keyof StageLatency, 'total'>;

export type GenerateOptions = {
  // Cancela la generación (por ejemplo, el tiempo máximo del job)
  signal?: AbortSignal;
};

// Suma tokens de varias llamadas. Si una no los reportó, el total tampoco
// se conoce (null), igual que con los nutrientes no medidos.
export function sumTokens(...calls: readonly TokenUsage[]): TokenUsage {
  const total = (key: keyof TokenUsage) =>
    calls.some((call) => call[key] === null)
      ? null
      : calls.reduce((sum, call) => sum + (call[key] ?? 0), 0);
  return {
    inputTokens: total('inputTokens'),
    outputTokens: total('outputTokens'),
  };
}

@Injectable()
export class MenuDraftService {
  constructor(
    private readonly distributionService: DistributionService,
    private readonly restrictionsService: RestrictionsService,
    private readonly candidatesService: CandidatesService,
    private readonly llmService: LlmService,
    private readonly revisionService: MealRevisionService,
  ) {}

  // restricciones → candidatos → el LLM elige alimentos → optimizador →
  // revisión con herramientas solo donde haga falta.
  //
  // No sabe de HTTP ni de colas: el worker lo llama con un callback que
  // guarda el progreso en el job, y las evaluaciones pueden llamarlo
  // directo.
  generate(
    req: MenuRequest,
    onProgress: ProgressCallback = () => undefined,
    { signal }: GenerateOptions = {},
  ): Promise<MenuDraft> {
    // El limitador de ritmo, en lo profundo de LlmService, avisa por aquí
    // cuando una llamada tiene que esperar
    return withRunContext(
      {
        signal,
        onWait: (seconds) => onProgress(progress.waitingForQuota(seconds)),
      },
      () => this.run(req, onProgress, signal),
    );
  }

  private async run(
    req: MenuRequest,
    onProgress: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<MenuDraft> {
    const started = performance.now();
    const latency: Record<Stage, number> = {
      restrictions: 0,
      candidates: 0,
      menu: 0,
      optimizer: 0,
      revision: 0,
    };
    const timed = async <T>(stage: Stage, run: () => T | Promise<T>) => {
      signal?.throwIfAborted();
      const start = performance.now();
      try {
        return await run();
      } finally {
        latency[stage] = Math.round(performance.now() - start);
      }
    };
    const budget = new LlmCallBudget();
    const distribution = this.distributionService.calculate(req);

    // Solo llama al LLM si hay restricciones
    if (req.restrictions?.trim()) {
      onProgress(progress.interpretingRestrictions());
    }
    const restrictions = await timed('restrictions', () =>
      this.restrictionsService.interpret(req.restrictions),
    );
    if (restrictions.usage) budget.use();

    onProgress(progress.selectingCandidates());
    const candidates = await timed('candidates', () =>
      this.candidatesService.forMeals(
        distribution.meals.map((meal) => meal.slot),
        restrictions.filters,
      ),
    );

    onProgress(progress.choosingFoods());
    budget.use();
    const menu = await timed('menu', () =>
      this.llmService.generateStructured({
        instructions: MENU_INSTRUCTIONS,
        prompt: buildMenuPrompt({
          meals: distribution.meals,
          candidates: candidates.foods,
          suggestions: candidates.bySlot,
          restrictions: req.restrictions,
        }),
        schema: LlmMenuSchema,
        temperature: TEMPERATURE,
      }),
    );

    onProgress(progress.optimizingPortions());
    const planned = await timed('optimizer', () =>
      planMeals({
        distribution,
        candidates: candidates.foods,
        llmMenu: menu.output,
      }),
    );

    const revised = await timed('revision', () =>
      this.revisionService.reviseMeals(planned.meals, {
        restrictions: restrictions.filters,
        restrictionsText: req.restrictions,
        budget,
        onRevise: (slot) => onProgress(progress.revisingMeal(slot)),
      }),
    );
    signal?.throwIfAborted();

    const draft = buildMenuDraft({
      meals: revised.meals,
      warnings: [...planned.warnings, ...revised.warnings],
      restrictionFilters: restrictions.filters,
      candidatesBySlot: candidates.bySlot,
      usage: {
        llmCalls: budget.calls,
        toolSteps: revised.toolSteps,
        ...sumTokens(
          ...(restrictions.usage ? [restrictions.usage] : []),
          menu.usage,
          revised.usage,
        ),
        latencyMs: {
          ...latency,
          total: Math.round(performance.now() - started),
        },
      },
    });
    onProgress(progress.completed());
    return draft;
  }
}
