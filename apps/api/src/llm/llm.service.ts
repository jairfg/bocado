import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  generateText,
  isStepCount,
  NoObjectGeneratedError,
  Output,
  type LanguageModel,
  type ToolSet,
} from 'ai';
import type { z } from 'zod';
import { currentRun } from '../common/run-context.js';
import {
  InvalidModelOutputException,
  providerHttpException,
} from './provider-errors.js';
import {
  LLM_RATE_LIMITER,
  SlidingWindowLimiter,
  UNLIMITED,
} from './rate-limiter.js';

// Token de inyección: el modelo concreto lo arma LlmModule desde la
// configuración y los tests lo reemplazan por un modelo simulado.
export const LANGUAGE_MODEL = Symbol('LANGUAGE_MODEL');

export type StructuredRequest<T> = {
  instructions: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature: number;
};

export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

// Uso de una llamada (o de un bucle con herramientas)
export type LlmCallUsage = TokenUsage & { latencyMs: number };

export type StructuredResult<T> = {
  output: T;
  usage: TokenUsage;
  latencyMs: number;
};

export type ToolLoopRequest = {
  instructions: string;
  prompt: string;
  // Sin contexto por herramienta: con un tipo genérico, TypeScript no puede
  // resolver los ajustes de contexto que el SDK exige.
  tools: ToolSet;
  // Herramienta sin execute con la que el modelo entrega su respuesta: al
  // llamarla, el bucle termina. Su inputSchema (Zod) valida la respuesta.
  answerTool: string;
  // Pasos máximos; cada paso es una llamada al LLM
  maxSteps: number;
  temperature: number;
  // Se llama antes de cada paso, para descontar del presupuesto
  onStep?: () => void;
  // Uso de cada paso al terminar: si el bucle falla a mitad, lo ya gastado
  // queda contado
  onStepEnd?: (usage: TokenUsage) => void;
};

export type ToolLoopResult = {
  // Argumentos de answerTool, ya validados; null si no llegó a llamarla
  answer: unknown;
  steps: number;
  latencyMs: number;
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    @Inject(LANGUAGE_MODEL) private readonly model: LanguageModel,
    // Cada llamada al proveedor espera su turno: en vez de recibir un 429,
    // espera a que haya lugar en la ventana de LLM_RPM
    @Inject(LLM_RATE_LIMITER)
    private readonly limiter: SlidingWindowLimiter = UNLIMITED,
  ) {}

  async generateStructured<T>({
    instructions,
    prompt,
    schema,
    temperature,
  }: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const start = performance.now();
    await this.limiter.acquire();
    try {
      const result = await generateText({
        model: this.model,
        instructions,
        prompt,
        temperature,
        abortSignal: currentRun().signal,
        // El SDK valida la respuesta con el esquema y lanza
        // NoObjectGeneratedError si no lo cumple.
        output: Output.object({ schema }),
        // Por defecto reintenta 2 veces. Con la cuota del plan gratuito
        // (5 por minuto, 20 por día) cada reintento gasta una solicitud,
        // así que el error llega al cliente y él decide cuándo volver.
        maxRetries: 0,
      });

      return {
        output: result.output,
        usage: {
          inputTokens: result.usage.inputTokens ?? null,
          outputTokens: result.usage.outputTokens ?? null,
        },
        latencyMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      throw this.toError(error);
    }
  }

  // Bucle con herramientas: el modelo llama herramientas (ejecutadas en
  // código) hasta entregar su respuesta con answerTool o agotar los pasos.
  // La respuesta llega por una herramienta y no con Output.object porque
  // así no depende de que el proveedor admita JSON forzado y llamadas a
  // funciones en la misma solicitud.
  async runToolLoop({
    instructions,
    prompt,
    tools,
    answerTool,
    maxSteps,
    temperature,
    onStep,
    onStepEnd,
  }: ToolLoopRequest): Promise<ToolLoopResult> {
    const start = performance.now();
    try {
      const result = await generateText({
        model: this.model,
        instructions,
        prompt,
        tools,
        temperature,
        maxRetries: 0,
        abortSignal: currentRun().signal,
        stopWhen: isStepCount(maxSteps),
        // Antes de cada paso (cada uno es una llamada): presupuesto y ritmo
        prepareStep: async ({ stepNumber }) => {
          onStep?.();
          await this.limiter.acquire();
          // En el último paso permitido solo puede responder: el bucle
          // nunca se corta a mitad de una búsqueda.
          if (stepNumber < maxSteps - 1) return {};
          return {
            activeTools: [answerTool],
            toolChoice: { type: 'tool' as const, toolName: answerTool },
          };
        },
        onStepEnd: ({ usage }) =>
          onStepEnd?.({
            inputTokens: usage.inputTokens ?? null,
            outputTokens: usage.outputTokens ?? null,
          }),
      });

      const answer = result.steps
        .flatMap((step) => step.toolCalls)
        .find((call) => call.toolName === answerTool && !call.invalid);
      return {
        answer: answer?.input ?? null,
        steps: result.steps.length,
        latencyMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      throw this.toError(error);
    }
  }

  // El detalle del proveedor queda en el log; el cliente recibe un mensaje
  // genérico sin datos internos.
  private toError(error: unknown): unknown {
    // Cancelado por el tiempo máximo del job: no es culpa del proveedor y
    // no debe confundirse con una falla que la revisión pueda absorber
    const { signal } = currentRun();
    if (signal?.aborted) return signal.reason;
    if (NoObjectGeneratedError.isInstance(error)) {
      this.logger.warn(
        `Salida del modelo fuera del esquema: ${String(error.cause)}`,
      );
      return new InvalidModelOutputException();
    }
    return providerHttpException(error, this.logger);
  }
}
