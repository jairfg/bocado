import type { FoodCategory } from '@bocado/shared';
import { CHICKEN } from '../../test/fixtures/foods.js';
import {
  buildRevisionTools,
  SearchFoodsInputSchema,
} from './revision-tools.js';

describe('searchFoods', () => {
  it('solo usa query y category: los demás argumentos se descartan', async () => {
    const calls: [string, FoodCategory | undefined][] = [];
    const tools = buildRevisionTools({
      searchFoods: (query, category) => {
        calls.push([query, category]);
        return Promise.resolve([CHICKEN]);
      },
      evaluateMeal: () => Promise.resolve({}),
    });

    // Llamada directa, sin la validación del SDK
    const result = await tools.searchFoods.execute!(
      {
        query: 'pollo',
        category: 'meats',
        restrictions: { vegetarian: false },
        includeAlcoholic: true,
        dishesOnly: false,
      } as never,
      { toolCallId: 'call-1', messages: [] } as never,
    );

    expect(calls).toEqual([['pollo', 'meats']]);
    expect(result).toEqual([
      expect.objectContaining({ foodId: CHICKEN.id, minG: 25, maxG: 200 }),
    ]);
  });

  it('no acepta categorías excluidas', () => {
    expect(
      SearchFoodsInputSchema.safeParse({ query: 'vino', category: 'beverages' })
        .success,
    ).toBe(false);
  });
});
