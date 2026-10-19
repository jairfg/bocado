import {
  BadGatewayException,
  type HttpException,
  type Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APICallError } from 'ai';

// Errores del proveedor de IA (LLM o embeddings) como respuestas HTTP.
// El detalle queda en el log; el cliente recibe un mensaje genérico.
export function providerHttpException(
  error: unknown,
  logger: Logger,
): HttpException {
  if (APICallError.isInstance(error) && error.statusCode === 429) {
    logger.warn('El proveedor de IA respondió 429 (límite de cuota)');
    return new ServiceUnavailableException(
      'El proveedor de IA alcanzó su límite de solicitudes, intenta más tarde',
    );
  }

  const detail = error instanceof Error ? error.message : String(error);
  logger.error(`Error del proveedor de IA: ${detail}`);
  return new BadGatewayException('No se pudo obtener respuesta del modelo');
}
