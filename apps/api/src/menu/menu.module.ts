import { Module } from '@nestjs/common';
import { FoodsModule } from '../foods/foods.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { CandidatesService } from './candidates.service.js';
import { DistributionService } from './distribution.service.js';
import { MealRevisionService } from './meal-revision.service.js';
import { MenuDraftService } from './menu-draft.service.js';
import { MenuController } from './menu.controller.js';
import { RestrictionsService } from './restrictions.service.js';

@Module({
  imports: [LlmModule, FoodsModule],
  providers: [
    DistributionService,
    RestrictionsService,
    CandidatesService,
    MealRevisionService,
    MenuDraftService,
  ],
  controllers: [MenuController],
  exports: [MenuDraftService],
})
export class MenuModule {}
