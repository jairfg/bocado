import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  MenuRequestSchema,
  type MenuDistribution,
  type MenuRequest,
} from '@bocado/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DistributionService } from './distribution.service.js';

@Controller('menu')
export class MenuController {
  constructor(private readonly distributionService: DistributionService) {}

  @Post('distribution')
  @HttpCode(HttpStatus.OK)
  calculateDistribution(
    @Body(new ZodValidationPipe(MenuRequestSchema)) req: MenuRequest,
  ): MenuDistribution {
    return this.distributionService.calculate(req);
  }
}
