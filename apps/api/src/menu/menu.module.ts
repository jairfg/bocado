import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { CandidatesService } from './candidates.service.js';
import { DistributionService } from './distribution.service.js';
import { MenuDraftService } from './menu-draft.service.js';
import { MenuController } from './menu.controller.js';

@Module({
  imports: [LlmModule],
  providers: [DistributionService, CandidatesService, MenuDraftService],
  controllers: [MenuController],
})
export class MenuModule {}
