import type {
  LlmMenu,
  MealSlot,
  MenuDistribution,
  MenuDraft,
  MenuDraftItem,
  MenuDraftMeal,
  MenuDraftWarning,
  Nutrients,
  RestrictionFilters,
} from '@bocado/shared';
import type { CandidateFood } from './candidate-selection.js';

type LlmItem = LlmMenu['meals'][number]['items'][number];

type Usage = MenuDraft['usage'];

export type DraftInput = {
  distribution: MenuDistribution;
  candidates: readonly CandidateFood[];
  candidatesBySlot: MenuDraft['candidates'];
  restrictionFilters: RestrictionFilters;
  llmMenu: LlmMenu;
  usage: Usage;
};

// Suma el uso de varias llamadas al LLM. Si una no reportó tokens, el total
// tampoco se conoce (null), igual que con los nutrientes no medidos.
export function sumUsage(...calls: readonly (Usage | null)[]): Usage {
  const made = calls.filter((call): call is Usage => call !== null);
  const total = (key: 'inputTokens' | 'outputTokens') =>
    made.some((call) => call[key] === null)
      ? null
      : made.reduce((sum, call) => sum + (call[key] ?? 0), 0);
  return {
    inputTokens: total('inputTokens'),
    outputTokens: total('outputTokens'),
    latencyMs: made.reduce((sum, call) => sum + call.latencyMs, 0),
  };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

const mapNutrients = (fn: (key: keyof Nutrients) => number): Nutrients => ({
  kcal: fn('kcal'),
  proteinG: fn('proteinG'),
  carbsG: fn('carbsG'),
  fatG: fn('fatG'),
});

// kcal declaradas en la base, nunca recalculadas con 4-4-9.
function nutrientsFor(food: CandidateFood, grams: number): Nutrients {
  const per100g: Nutrients = {
    kcal: food.kcalPer100g,
    proteinG: food.proteinGPer100g,
    carbsG: food.carbsGPer100g,
    fatG: food.fatGPer100g,
  };
  return mapNutrients((key) => round1((per100g[key] * grams) / 100));
}

// Suma los valores ya redondeados para que los totales cuadren con lo que
// se muestra; round1 limpia el error de punto flotante de la suma.
const sumNutrients = (rows: readonly Nutrients[]): Nutrients =>
  mapNutrients((key) => round1(rows.reduce((sum, row) => sum + row[key], 0)));

const deviationPct = (totals: Nutrients, target: Nutrients): Nutrients =>
  mapNutrients((key) =>
    round1(((totals[key] - target[key]) / target[key]) * 100),
  );

// Transforma la salida del modelo en el borrador: descarta lo que no se
// puede usar, con una advertencia por cada cosa, y calcula los nutrientes
// desde la base. No corrige gramos ni completa comidas.
export function buildMenuDraft({
  distribution,
  candidates,
  candidatesBySlot,
  restrictionFilters,
  llmMenu,
  usage,
}: DraftInput): MenuDraft {
  const foodsById = new Map(candidates.map((food) => [food.id, food]));
  const requested = new Set(distribution.meals.map((meal) => meal.slot));
  const warnings: MenuDraftWarning[] = [];

  const itemsBySlot = new Map<MealSlot, LlmItem[]>();
  for (const { slot, items } of llmMenu.meals) {
    if (!requested.has(slot)) {
      warnings.push({
        code: 'unrequested_meal',
        slot,
        message: `El modelo agregó ${slot}, que no se pidió; se descartó`,
      });
      continue;
    }
    const previous = itemsBySlot.get(slot);
    if (previous) {
      warnings.push({
        code: 'duplicate_meal',
        slot,
        message: `El modelo devolvió ${slot} más de una vez; se unieron sus alimentos`,
      });
    }
    itemsBySlot.set(slot, [...(previous ?? []), ...items]);
  }

  const meals = distribution.meals.map((meal): MenuDraftMeal => {
    const llmItems = itemsBySlot.get(meal.slot);
    if (!llmItems) {
      warnings.push({
        code: 'missing_meal',
        slot: meal.slot,
        message: `El modelo no devolvió ${meal.slot}`,
      });
    }

    const items = (llmItems ?? []).flatMap(
      ({ foodId, grams }): MenuDraftItem[] => {
        const food = foodsById.get(foodId);
        if (!food) {
          warnings.push({
            code: 'unknown_food',
            slot: meal.slot,
            foodId,
            message: `El foodId ${foodId} de ${meal.slot} no está entre los candidatos; se descartó`,
          });
          return [];
        }
        return [
          { foodId, name: food.name, grams, ...nutrientsFor(food, grams) },
        ];
      },
    );

    const target: Nutrients = {
      kcal: meal.kcal,
      proteinG: meal.proteinG,
      carbsG: meal.carbsG,
      fatG: meal.fatG,
    };
    const totals = sumNutrients(items);
    return {
      slot: meal.slot,
      target,
      items,
      totals,
      deviationPct: deviationPct(totals, target),
    };
  });

  return {
    meals,
    totals: sumNutrients(meals.map((meal) => meal.totals)),
    warnings,
    restrictionFilters,
    candidates: candidatesBySlot,
    usage,
  };
}
