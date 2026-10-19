import {
  DraftFailureSchema,
  type DraftFailure,
  type DraftFailureCode,
} from '@bocado/shared';
import {
  InvalidModelOutputException,
  ProviderErrorException,
  ProviderUnavailableException,
} from '../llm/provider-errors.js';

// Lo que ve el usuario: nunca detalles internos ni del proveedor
const MESSAGES: Record<DraftFailureCode, string> = {
  invalid_model_output:
    'El modelo respondió con un formato inválido. Intenta de nuevo.',
  provider_unavailable:
    'El proveedor de IA alcanzó su límite de uso. Intenta más tarde.',
  provider_error: 'No se pudo contactar al proveedor de IA. Intenta de nuevo.',
  timeout: 'El menú tardó demasiado en generarse. Intenta de nuevo.',
  interrupted: 'El proceso se interrumpió antes de terminar. Intenta de nuevo.',
  internal_error: 'Ocurrió un error inesperado al generar el menú.',
};

export class DraftTimeoutError extends Error {
  constructor() {
    super('El job superó su tiempo máximo');
    this.name = 'DraftTimeoutError';
  }
}

// El worker guarda solo el código como motivo de la falla
export function failureCode(error: unknown): DraftFailureCode {
  if (error instanceof DraftTimeoutError) return 'timeout';
  if (error instanceof InvalidModelOutputException) {
    return 'invalid_model_output';
  }
  if (error instanceof ProviderUnavailableException) {
    return 'provider_unavailable';
  }
  if (error instanceof ProviderErrorException) return 'provider_error';
  return 'internal_error';
}

const CODES = DraftFailureSchema.shape.code;

// Del motivo guardado en BullMQ a lo que se muestra. Un worker caído deja
// el job "stalled" y BullMQ escribe su propio motivo.
export function failureFromReason(reason: string | undefined): DraftFailure {
  const parsed = CODES.safeParse(reason);
  const code: DraftFailureCode = parsed.success
    ? parsed.data
    : /stalled/i.test(reason ?? '')
      ? 'interrupted'
      : 'internal_error';
  return { code, message: MESSAGES[code] };
}
