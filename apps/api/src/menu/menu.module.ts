import { Module } from '@nestjs/common';
import { DistributionService } from './distribution.service.js';
import { MenuController } from './menu.controller.js';

@Module({
  providers: [DistributionService],
  controllers: [MenuController],
})
export class MenuModule {}
