import { MockLanguageModelV4 } from 'ai/test';

// Una respuesta del modelo: texto (JSON o no) o una llamada a herramienta
export type MockStep = { text: string } | { tool: string; input: unknown };

const USAGE = {
  inputTokens: {
    total: 1000,
    noCache: 1000,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 100, text: 100, reasoning: undefined },
};

// Cada paso consume la siguiente respuesta, en orden. Cada respuesta
// reporta 1000 tokens de entrada y 100 de salida.
export function mockModel(steps: readonly MockStep[]): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: steps.map((step, i) =>
      'tool' in step
        ? {
            content: [
              {
                type: 'tool-call' as const,
                toolCallId: `call-${i}`,
                toolName: step.tool,
                input: JSON.stringify(step.input),
              },
            ],
            finishReason: { unified: 'tool-calls' as const, raw: undefined },
            usage: USAGE,
            warnings: [],
          }
        : {
            content: [{ type: 'text' as const, text: step.text }],
            finishReason: { unified: 'stop' as const, raw: undefined },
            usage: USAGE,
            warnings: [],
          },
    ),
  });
}
