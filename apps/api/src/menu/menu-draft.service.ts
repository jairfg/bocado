import { Injectable } from '@nestjs/common';
import {
  LlmMenuSchema,
  type MenuDraft,
  type MenuRequest,
} from '@bocado/shared';
import { LlmService } from '../llm/llm.service.js';
import { CandidatesService } from './candidates.service.js';
import { DistributionService } from './distribution.service.js';
import { buildMenuDraft, sumUsage } from './menu-draft.builder.js';
import { buildMenuPrompt, MENU_INSTRUCTIONS } from './menu-prompt.js';
import { RestrictionsService } from './restrictions.service.js';

// Baja para que el modelo se ciña a la lista y a las metas.
const TEMPERATURE = 0.2;

@Injectable()
export class MenuDraftService {
  constructor(
    private readonly distributionService: DistributionService,
    private readonly restrictionsService: RestrictionsService,
    private readonly candidatesService: CandidatesService,
    private readonly llmService: LlmService,
  ) {}

  async createDraft(req: MenuRequest): Promise<MenuDraft> {
    const distribution = this.distributionService.calculate(req);
    // 1.ª llamada al LLM (solo si hay restricciones): texto libre → filtros
    const restrictions = await this.restrictionsService.interpret(
      req.restrictions,
    );
    const candidates = await this.candidatesService.forMeals(
      distribution.meals.map((meal) => meal.slot),
      restrictions.filters,
    );

    // 2.ª llamada: elegir alimentos y gramos entre los candidatos
    const { output, usage, latencyMs } =
      await this.llmService.generateStructured({
        instructions: MENU_INSTRUCTIONS,
        prompt: buildMenuPrompt({
          meals: distribution.meals,
          candidates: candidates.foods,
          suggestions: candidates.bySlot,
          restrictions: req.restrictions,
        }),
        schema: LlmMenuSchema,
        temperature: TEMPERATURE,
      });

    return buildMenuDraft({
      distribution,
      candidates: candidates.foods,
      candidatesBySlot: candidates.bySlot,
      restrictionFilters: restrictions.filters,
      llmMenu: output,
      usage: sumUsage(restrictions.usage, { ...usage, latencyMs }),
    });
  }
}
