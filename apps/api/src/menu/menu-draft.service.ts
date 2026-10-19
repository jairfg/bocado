import { Injectable } from '@nestjs/common';
import {
  LlmMenuSchema,
  type MenuDraft,
  type MenuRequest,
  type StageLatency,
} from '@bocado/shared';
import { LlmService, type TokenUsage } from '../llm/llm.service.js';
import { CandidatesService } from './candidates.service.js';
import { DistributionService } from './distribution.service.js';
import { LlmCallBudget } from './llm-call-budget.js';
import { MealRevisionService } from './meal-revision.service.js';
import { buildMenuDraft, planMeals } from './menu-draft.builder.js';
import { buildMenuPrompt, MENU_INSTRUCTIONS } from './menu-prompt.js';
import { RestrictionsService } from './restrictions.service.js';

// Baja para que el modelo se ciña a la lista de candidatos.
const TEMPERATURE = 0.2;

type Stage = Exclude<keyof StageLatency, 'total'>;

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
  // revisión con herramientas solo donde haga falta
  async createDraft(req: MenuRequest): Promise<MenuDraft> {
    const started = performance.now();
    const latency: Record<Stage, number> = {
      restrictions: 0,
      candidates: 0,
      menu: 0,
      optimizer: 0,
      revision: 0,
    };
    const timed = async <T>(stage: Stage, run: () => T | Promise<T>) => {
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
    const restrictions = await timed('restrictions', () =>
      this.restrictionsService.interpret(req.restrictions),
    );
    if (restrictions.usage) budget.use();

    const candidates = await timed('candidates', () =>
      this.candidatesService.forMeals(
        distribution.meals.map((meal) => meal.slot),
        restrictions.filters,
      ),
    );

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
      }),
    );

    return buildMenuDraft({
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
  }
}
