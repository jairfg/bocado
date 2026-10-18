import { Injectable } from '@nestjs/common';
import type {
  MealSlot,
  MealTarget,
  MenuDistribution,
  MenuRequest,
} from '@bocado/shared';

// En orden canónico. Los pesos suman 100 y se renormalizan según las
// comidas elegidas.
const DEFAULT_WEIGHTS: ReadonlyArray<{ slot: MealSlot; weight: number }> = [
  { slot: 'desayuno', weight: 25 },
  { slot: 'media_manana', weight: 10 },
  { slot: 'almuerzo', weight: 35 },
  { slot: 'merienda', weight: 10 },
  { slot: 'cena', weight: 20 },
];

const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

const round1 = (value: number): number => Math.round(value * 10) / 10;

function macroGrams(kcal: number, macros: MenuRequest['macros']) {
  return {
    proteinG: round1((kcal * macros.proteinPct) / 100 / KCAL_PER_GRAM.protein),
    carbsG: round1((kcal * macros.carbsPct) / 100 / KCAL_PER_GRAM.carbs),
    fatG: round1((kcal * macros.fatPct) / 100 / KCAL_PER_GRAM.fat),
  };
}

@Injectable()
export class DistributionService {
  calculate(req: MenuRequest): MenuDistribution {
    const selected = new Set(req.meals);
    const slots = DEFAULT_WEIGHTS.filter(({ slot }) => selected.has(slot));
    const totalWeight = slots.reduce((sum, { weight }) => sum + weight, 0);

    const kcalPerMeal = slots.map(({ weight }) =>
      Math.round((req.kcal * weight) / totalWeight),
    );

    // Redondear cada comida puede dejar unas pocas kcal de más o de menos;
    // se ajustan en la comida más grande para que la suma sea exacta.
    const remainder = req.kcal - kcalPerMeal.reduce((sum, k) => sum + k, 0);
    const largest = slots.reduce(
      (best, { weight }, i) => (weight > slots[best].weight ? i : best),
      0,
    );
    kcalPerMeal[largest] += remainder;

    const meals: MealTarget[] = slots.map(({ slot, weight }, i) => ({
      slot,
      sharePct: round1((weight / totalWeight) * 100),
      kcal: kcalPerMeal[i],
      ...macroGrams(kcalPerMeal[i], req.macros),
    }));

    return {
      totals: { kcal: req.kcal, ...macroGrams(req.kcal, req.macros) },
      meals,
    };
  }
}
