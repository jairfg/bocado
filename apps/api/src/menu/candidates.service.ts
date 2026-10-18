import { Injectable } from '@nestjs/common';
import type { MenuRequest } from '@bocado/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  requestSeed,
  selectCandidates,
  type CandidateFood,
} from './candidate-selection.js';

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  // Carga la base completa (unos 2900 registros con 8 columnas) y filtra en
  // memoria, así la regla vive en una sola función pura y testeada.
  async forRequest(req: MenuRequest): Promise<CandidateFood[]> {
    const foods = await this.prisma.food.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        isAlcoholic: true,
        kcalPer100g: true,
        proteinGPer100g: true,
        carbsGPer100g: true,
        fatGPer100g: true,
      },
    });
    return selectCandidates(foods, requestSeed(req));
  }
}
