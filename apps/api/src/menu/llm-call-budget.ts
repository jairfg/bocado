// Llamadas al LLM permitidas por request, sumando todas las etapas:
// interpretar restricciones (1), armar el menú (1) y cada paso de las
// revisiones con herramientas. Al agotarse, las comidas que falten
// quedan con su mejor resultado y una advertencia, nunca con un error.
export const LLM_CALL_BUDGET = 6;

export class LlmCallBudget {
  private used = 0;

  constructor(readonly limit = LLM_CALL_BUDGET) {}

  get calls(): number {
    return this.used;
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.used);
  }

  use(): void {
    this.used++;
  }
}
