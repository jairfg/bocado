import { Module } from '@nestjs/common';
import { FoodsService } from './foods.service.js';
import { FoodsController } from './foods.controller.js';

@Module({
  providers: [FoodsService],
  controllers: [FoodsController],
})
export class FoodsModule {}
