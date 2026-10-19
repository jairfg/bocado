import { Controller, Get, Query } from '@nestjs/common';
import {
  FoodQuerySchema,
  FoodSearchQuerySchema,
  type FoodQuery,
  type FoodSearchQuery,
} from '@bocado/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { FoodSearchService } from './food-search.service.js';
import type { FoodSummary } from './food-summary.js';
import { FoodsService } from './foods.service.js';

@Controller('foods')
export class FoodsController {
  constructor(
    private readonly foodsService: FoodsService,
    private readonly foodSearchService: FoodSearchService,
  ) {}

  @Get()
  search(
    @Query(new ZodValidationPipe(FoodQuerySchema)) query: FoodQuery,
  ): Promise<FoodSummary[]> {
    return this.foodsService.search(query);
  }

  // Búsqueda híbrida: significado (embeddings) + texto, fusionados con RRF
  @Get('search')
  hybridSearch(
    @Query(new ZodValidationPipe(FoodSearchQuerySchema))
    { q, limit }: FoodSearchQuery,
  ): Promise<FoodSummary[]> {
    return this.foodSearchService.search(q, limit);
  }
}
