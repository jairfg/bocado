import { Controller, Get, Query } from '@nestjs/common';
import { FoodQuerySchema, type FoodQuery } from '@bocado/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { FoodsService, type FoodSummary } from './foods.service.js';

@Controller('foods')
export class FoodsController {
  constructor(private readonly foodsService: FoodsService) {}

  @Get()
  search(
    @Query(new ZodValidationPipe(FoodQuerySchema)) query: FoodQuery,
  ): Promise<FoodSummary[]> {
    return this.foodsService.search(query);
  }
}
