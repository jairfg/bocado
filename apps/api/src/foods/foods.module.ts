import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { FoodSearchService } from './food-search.service.js';
import { FoodsController } from './foods.controller.js';
import { FoodsService } from './foods.service.js';

@Module({
  imports: [LlmModule],
  providers: [FoodsService, FoodSearchService],
  controllers: [FoodsController],
  exports: [FoodSearchService],
})
export class FoodsModule {}
