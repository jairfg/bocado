import type { DraftProgress, MealSlot } from '@bocado/shared';

// Eventos de progreso con su mensaje para la interfaz, en un solo lugar

export type ProgressCallback = (event: DraftProgress) => void;

const MEAL_NAMES: Record<MealSlot, string> = {
  desayuno: 'el desayuno',
  media_manana: 'la media mañana',
  almuerzo: 'el almuerzo',
  merienda: 'la merienda',
  cena: 'la cena',
};

export const progress = {
  interpretingRestrictions: (): DraftProgress => ({
    stage: 'interpreting_restrictions',
    message: 'Interpretando tus restricciones',
  }),
  selectingCandidates: (): DraftProgress => ({
    stage: 'selecting_candidates',
    message: 'Buscando alimentos candidatos',
  }),
  choosingFoods: (): DraftProgress => ({
    stage: 'choosing_foods',
    message: 'Eligiendo los alimentos de cada comida',
  }),
  optimizingPortions: (): DraftProgress => ({
    stage: 'optimizing_portions',
    message: 'Ajustando las porciones',
  }),
  revisingMeal: (slot: MealSlot): DraftProgress => ({
    stage: 'revising_meal',
    slot,
    message: `Corrigiendo ${MEAL_NAMES[slot]}`,
  }),
  waitingForQuota: (seconds: number): DraftProgress => ({
    stage: 'waiting_for_quota',
    seconds,
    message: `Esperando la cuota del proveedor de IA (${seconds} s)`,
  }),
  completed: (): DraftProgress => ({
    stage: 'completed',
    message: 'Menú listo',
  }),
};
