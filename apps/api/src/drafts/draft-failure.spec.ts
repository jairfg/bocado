import {
  InvalidModelOutputException,
  ProviderErrorException,
  ProviderUnavailableException,
} from '../llm/provider-errors.js';
import {
  DraftTimeoutError,
  failureCode,
  failureFromReason,
} from './draft-failure.js';

describe('failureCode', () => {
  it.each([
    [new DraftTimeoutError(), 'timeout'],
    [new InvalidModelOutputException(), 'invalid_model_output'],
    [new ProviderUnavailableException(), 'provider_unavailable'],
    [new ProviderErrorException(), 'provider_error'],
    [new Error('connection refused at 10.0.0.3:5432'), 'internal_error'],
  ])('%s → %s', (error, code) => {
    expect(failureCode(error)).toBe(code);
  });
});

describe('failureFromReason', () => {
  it('traduce el código guardado a un mensaje para el usuario', () => {
    expect(failureFromReason('timeout')).toEqual({
      code: 'timeout',
      message: 'El menú tardó demasiado en generarse. Intenta de nuevo.',
    });
  });

  it('un job abandonado por un worker caído queda como interrumpido', () => {
    expect(
      failureFromReason('job stalled more than allowable limit').code,
    ).toBe('interrupted');
  });

  it('nunca expone un motivo desconocido', () => {
    const failure = failureFromReason('TypeError: secret is undefined');

    expect(failure.code).toBe('internal_error');
    expect(failure.message).not.toContain('secret');
  });
});
