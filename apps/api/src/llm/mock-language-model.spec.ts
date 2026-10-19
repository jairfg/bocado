import { LlmMenuSchema, NO_RESTRICTIONS } from '@bocado/shared';
import { ALL_FOODS, TARGETS } from '../../test/fixtures/foods.js';
import { buildMenuPrompt } from '../menu/menu-prompt.js';
import { LlmService } from './llm.service.js';
import {
  buildMenu,
  createMockLanguageModel,
  interpretRestrictions,
} from './mock-language-model.js';

describe('interpretRestrictions (modelo simulado)', () => {
  it('reconoce vegetariano, lo que no le gusta y lo que prefiere', () => {
    expect(
      interpretRestrictions(
        'Soy vegetariano, no me gusta el brócoli y prefiero la avena.',
      ),
    ).toEqual({
      ...NO_RESTRICTIONS,
      vegetarian: true,
      excludeTerms: ['brocoli'],
      preferTerms: ['avena'],
    });
  });

  it('vegano excluye lácteos y huevos', () => {
    expect(interpretRestrictions('vegana')).toMatchObject({
      vegetarian: true,
      excludeCategories: ['dairy', 'eggs'],
    });
  });
});

describe('buildMenu (modelo simulado)', () => {
  const prompt = buildMenuPrompt({
    meals: Object.entries(TARGETS).map(([slot, target]) => ({
      slot: slot as keyof typeof TARGETS,
      sharePct: 0,
      ...target,
    })),
    candidates: ALL_FOODS,
  });

  it('arma una comida con proteína, carbohidrato y verdura o fruta', () => {
    const menu = LlmMenuSchema.parse(buildMenu(prompt));

    expect(menu.meals.map((meal) => meal.slot)).toEqual([
      'desayuno',
      'almuerzo',
      'cena',
    ]);
    for (const meal of menu.meals) {
      const categories = meal.items.map(
        (item) => ALL_FOODS.find((food) => food.id === item.foodId)?.category,
      );
      expect(categories).toEqual(
        expect.arrayContaining(['vegetables', 'cereals']),
      );
    }
  });

  it('pasa por el SDK como un modelo más y es determinista', async () => {
    const llm = new LlmService(createMockLanguageModel(0));
    const run = () =>
      llm.generateStructured({
        instructions: '',
        prompt,
        schema: LlmMenuSchema,
        temperature: 0,
      });

    const first = await run();
    expect((await run()).output).toEqual(first.output);
  });
});
