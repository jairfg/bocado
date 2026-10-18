import { Injectable } from '@nestjs/common';
import {
  LlmMenuSchema,
  type MenuDraft,
  type MenuRequest,
} from '@bocado/shared';
import { LlmService } from '../llm/llm.service.js';
import { CandidatesService } from './candidates.service.js';
import { DistributionService } from './distribution.service.js';
import { buildMenuDraft } from './menu-draft.builder.js';
import { buildMenuPrompt, MENU_INSTRUCTIONS } from './menu-prompt.js';

// Baja para que el modelo se ciña a la lista y a las metas.
const TEMPERATURE = 0.2;

@Injectable()
export class MenuDraftService {
  constructor(
    private readonly distributionService: DistributionService,
    private readonly candidatesService: CandidatesService,
    private readonly llmService: LlmService,
  ) {}

  async createDraft(req: MenuRequest): Promise<MenuDraft> {
    const distribution = this.distributionService.calculate(req);
    const candidates = await this.candidatesService.forRequest(req);

    const { output, usage, latencyMs } =
      await this.llmService.generateStructured({
        instructions: MENU_INSTRUCTIONS,
        prompt: buildMenuPrompt({
          meals: distribution.meals,
          candidates,
          restrictions: req.restrictions,
        }),
        schema: LlmMenuSchema,
        temperature: TEMPERATURE,
      });

    return buildMenuDraft({
      distribution,
      candidates,
      llmMenu: output,
      usage: { ...usage, latencyMs },
    });
  }
}
