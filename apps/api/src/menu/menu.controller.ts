import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  MenuRequestSchema,
  type MenuDistribution,
  type MenuDraft,
  type MenuRequest,
} from '@bocado/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DistributionService } from './distribution.service.js';
import { MenuDraftService } from './menu-draft.service.js';

@Controller('menu')
export class MenuController {
  constructor(
    private readonly distributionService: DistributionService,
    private readonly menuDraftService: MenuDraftService,
  ) {}

  @Post('distribution')
  @HttpCode(HttpStatus.OK)
  calculateDistribution(
    @Body(new ZodValidationPipe(MenuRequestSchema)) req: MenuRequest,
  ): MenuDistribution {
    return this.distributionService.calculate(req);
  }

  // 200 y no 201: el borrador no se guarda, igual que la distribución.
  @Post('draft')
  @HttpCode(HttpStatus.OK)
  createDraft(
    @Body(new ZodValidationPipe(MenuRequestSchema)) req: MenuRequest,
  ): Promise<MenuDraft> {
    return this.menuDraftService.createDraft(req);
  }
}
