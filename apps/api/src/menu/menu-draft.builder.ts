import type {
  LlmMenu,
  MealSlot,
  MenuDistribution,
  MenuDraft,
  MenuDraftMeal,
  MenuDraftWarning,
  Nutrients,
  RestrictionFilters,
} from '@bocado/shared';
import type { CandidateFood } from './candidate-selection.js';
import { mealName } from './draft-progress.js';
import { optimizeMeal, type PlannedMeal } from './meal-evaluation.js';
import { sumNutrients } from './nutrition.js';

type LlmItem = LlmMenu['meals'][number]['items'][number];

type PlanInput = {
  distribution: MenuDistribution;
  candidates: readonly CandidateFood[];
  llmMenu: LlmMenu;
};

// De la salida del modelo a comidas optimizadas: descarta lo que no se
// puede usar (con una advertencia por cada cosa) y el optimizador calcula
// los gramos. Los gramos del modelo son solo el punto de partida.
export function planMeals({ distribution, candidates, llmMenu }: PlanInput): {
  meals: PlannedMeal[];
  warnings: MenuDraftWarning[];
} {
  const foodsById = new Map(candidates.map((food) => [food.id, food]));
  const requested = new Set(distribution.meals.map((meal) => meal.slot));
  const warnings: MenuDraftWarning[] = [];

  const itemsBySlot = new Map<MealSlot, LlmItem[]>();
  for (const { slot, items } of llmMenu.meals) {
    if (!requested.has(slot)) {
      warnings.push({
        code: 'unrequested_meal',
        slot,
        message: `El modelo agregó ${mealName(slot)}, que no se pidió; se descartó`,
      });
      continue;
    }
    const previous = itemsBySlot.get(slot);
    if (previous) {
      warnings.push({
        code: 'duplicate_meal',
        slot,
        message: `El modelo devolvió ${mealName(slot)} más de una vez; se unieron sus alimentos`,
      });
    }
    itemsBySlot.set(slot, [...(previous ?? []), ...items]);
  }

  const meals = distribution.meals.map((meal): PlannedMeal => {
    const llmItems = itemsBySlot.get(meal.slot);
    if (!llmItems) {
      warnings.push({
        code: 'missing_meal',
        slot: meal.slot,
        message: `El modelo no devolvió ${mealName(meal.slot)}`,
      });
    }

    const chosen: { food: CandidateFood; grams: number }[] = [];
    for (const { foodId, grams } of llmItems ?? []) {
      const food = foodsById.get(foodId);
      if (!food) {
        warnings.push({
          code: 'unknown_food',
          slot: meal.slot,
          foodId,
          message: `Se descartó el foodId ${foodId} en ${mealName(meal.slot)}: no está entre los candidatos`,
        });
        continue;
      }
      // Repetido en la misma comida: se suman los gramos de partida
      const existing = chosen.find((item) => item.food.id === foodId);
      if (existing) existing.grams += grams;
      else chosen.push({ food, grams });
    }

    const target: Nutrients = {
      kcal: meal.kcal,
      proteinG: meal.proteinG,
      carbsG: meal.carbsG,
      fatG: meal.fatG,
    };
    const foods = chosen.map((item) => item.food);
    const { evaluation, status } = optimizeMeal(
      foods,
      chosen.map((item) => item.grams),
      target,
    );
    return {
      slot: meal.slot,
      target,
      foods,
      evaluation,
      status,
      revisions: 0,
    };
  });

  return { meals, warnings };
}

type DraftInput = {
  meals: readonly PlannedMeal[];
  warnings: readonly MenuDraftWarning[];
  restrictionFilters: RestrictionFilters;
  candidatesBySlot: MenuDraft['candidates'];
  usage: MenuDraft['usage'];
};

// Arma la respuesta con el estado final de cada comida
export function buildMenuDraft({
  meals,
  warnings,
  restrictionFilters,
  candidatesBySlot,
  usage,
}: DraftInput): MenuDraft {
  const atMax: MenuDraftWarning[] = meals.flatMap((meal) =>
    meal.evaluation.items
      .filter((item) => item.grams >= item.maxG)
      .map((item) => ({
        code: 'portion_at_max' as const,
        slot: meal.slot,
        foodId: item.foodId,
        message: `${item.name} quedó en su porción máxima (${item.maxG} g) en ${mealName(meal.slot)}`,
      })),
  );

  const draftMeals = meals.map((meal): MenuDraftMeal => ({
    slot: meal.slot,
    target: meal.target,
    items: meal.evaluation.items.map(
      ({ foodId, name, grams, kcal, proteinG, carbsG, fatG }) => ({
        foodId,
        name,
        grams,
        kcal,
        proteinG,
        carbsG,
        fatG,
      }),
    ),
    totals: meal.evaluation.totals,
    deviationPct: meal.evaluation.deviationPct,
    status: meal.status,
    revisions: meal.revisions,
  }));

  return {
    meals: draftMeals,
    totals: sumNutrients(draftMeals.map((meal) => meal.totals)),
    warnings: [...warnings, ...atMax],
    restrictionFilters,
    candidates: candidatesBySlot,
    usage,
  };
}
