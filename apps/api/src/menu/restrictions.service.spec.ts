import { BadGatewayException, Logger } from '@nestjs/common';
import { NO_RESTRICTIONS, type RestrictionFilters } from '@bocado/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { LlmService } from '../llm/llm.service.js';
import { RestrictionsService } from './restrictions.service.js';

function mockModel(text: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: {
          total: 300,
          noCache: 300,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 40, text: 40, reasoning: undefined },
      },
      warnings: [],
    },
  });
}

const vegetarianNoBroccoli: RestrictionFilters = {
  ...NO_RESTRICTIONS,
  vegetarian: true,
  excludeTerms: ['brócoli'],
};

describe('RestrictionsService', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  it('sin restricciones no llama al LLM', async () => {
    const model = mockModel('{}');
    const service = new RestrictionsService(new LlmService(model));

    await expect(service.interpret(undefined)).resolves.toEqual({
      filters: NO_RESTRICTIONS,
      usage: null,
    });
    await expect(service.interpret('   ')).resolves.toMatchObject({
      usage: null,
    });
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it('convierte el texto en filtros validados y delimita los datos', async () => {
    const model = mockModel(JSON.stringify(vegetarianNoBroccoli));
    const service = new RestrictionsService(new LlmService(model));

    const result = await service.interpret(
      'vegetariano, no me gusta el brócoli',
    );

    expect(result.filters).toEqual(vegetarianNoBroccoli);
    expect(result.usage).toMatchObject({ inputTokens: 300, outputTokens: 40 });
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain(
      String.raw`<restricciones_usuario>\nvegetariano, no me gusta el brócoli\n</restricciones_usuario>`,
    );
  });

  it('responde 502 si la salida no cumple el esquema', async () => {
    const model = mockModel(JSON.stringify({ vegetarian: 'sí' }));
    const service = new RestrictionsService(new LlmService(model));

    await expect(service.interpret('vegetariano')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
