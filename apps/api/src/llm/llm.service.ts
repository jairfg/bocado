import {
  BadGatewayException,
  HttpException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  generateText,
  NoObjectGeneratedError,
  Output,
  type LanguageModel,
} from 'ai';
import type { z } from 'zod';
import { providerHttpException } from './provider-errors.js';

// Token de inyección: el modelo concreto lo arma LlmModule desde la
// configuración y los tests lo reemplazan por un modelo simulado.
export const LANGUAGE_MODEL = Symbol('LANGUAGE_MODEL');

export type StructuredRequest<T> = {
  instructions: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature: number;
};

export type StructuredResult<T> = {
  output: T;
  usage: { inputTokens: number | null; outputTokens: number | null };
  latencyMs: number;
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(@Inject(LANGUAGE_MODEL) private readonly model: LanguageModel) {}

  async generateStructured<T>({
    instructions,
    prompt,
    schema,
    temperature,
  }: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const start = performance.now();
    try {
      const result = await generateText({
        model: this.model,
        instructions,
        prompt,
        temperature,
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
      throw this.toHttpException(error);
    }
  }

  // El detalle del proveedor queda en el log; el cliente recibe un mensaje
  // genérico sin datos internos.
  private toHttpException(error: unknown): HttpException {
    if (NoObjectGeneratedError.isInstance(error)) {
      this.logger.warn(
        `Salida del modelo fuera del esquema: ${String(error.cause)}`,
      );
      return new BadGatewayException(
        'El modelo devolvió una respuesta que no cumple el formato esperado',
      );
    }
    return providerHttpException(error, this.logger);
  }
}
