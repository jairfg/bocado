import {
  BadGatewayException,
  type HttpException,
  type Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APICallError } from 'ai';

// Excepciones con tipo propio para que el worker sepa qué código de falla
// informar, sin leer mensajes.

// El modelo respondió algo que no cumple el esquema
export class InvalidModelOutputException extends BadGatewayException {
  constructor() {
    super('El modelo devolvió una respuesta que no cumple el formato esperado');
  }
}

// El proveedor respondió 429 (cuota agotada)
export class ProviderUnavailableException extends ServiceUnavailableException {
  constructor() {
    super(
      'El proveedor de IA alcanzó su límite de solicitudes, intenta más tarde',
    );
  }
}

// Cualquier otro error del proveedor o de red
export class ProviderErrorException extends BadGatewayException {
  constructor() {
    super('No se pudo obtener respuesta del modelo');
  }
}

// Errores del proveedor de IA (LLM o embeddings) como respuestas HTTP.
// El detalle queda en el log; el cliente recibe un mensaje genérico.
export function providerHttpException(
  error: unknown,
  logger: Logger,
): HttpException {
  if (APICallError.isInstance(error) && error.statusCode === 429) {
    logger.warn('El proveedor de IA respondió 429 (límite de cuota)');
    return new ProviderUnavailableException();
  }

  const detail = error instanceof Error ? error.message : String(error);
  logger.error(`Error del proveedor de IA: ${detail}`);
  return new ProviderErrorException();
}
