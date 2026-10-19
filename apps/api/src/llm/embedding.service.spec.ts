import { ServiceUnavailableException } from '@nestjs/common';
import { APICallError } from 'ai';
import { MockEmbeddingModelV4 } from 'ai/test';
import { EmbeddingService, normalize } from './embedding.service.js';
import { EMBEDDING_DIMENSIONS } from './llm.providers.js';

// Vector de 768 dimensiones con norma 2 (sin normalizar)
const rawVector = (first: number) => {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  vector[0] = first;
  vector[1] = Math.sqrt(4 - first * first);
  return vector;
};

function mockModel(vectors: number[][]): MockEmbeddingModelV4 {
  return new MockEmbeddingModelV4({
    maxEmbeddingsPerCall: 100,
    doEmbed: { embeddings: vectors, warnings: [] },
  });
}

describe('EmbeddingService', () => {
  it('usa el modelo de documentos o el de consultas y normaliza', async () => {
    const document = mockModel([rawVector(1), rawVector(2)]);
    const query = mockModel([rawVector(0)]);
    const service = new EmbeddingService({
      modelId: 'modelo-de-prueba',
      document,
      query,
    });

    const docs = await service.embedDocuments(['pollo', 'arroz']);
    const [search] = await service.embedQueries(['proteína']);

    // Ambos textos van en una sola llamada
    expect(document.doEmbedCalls).toHaveLength(1);
    expect(document.doEmbedCalls[0].values).toEqual(['pollo', 'arroz']);
    expect(query.doEmbedCalls).toHaveLength(1);
    for (const vector of [...docs, search]) {
      expect(Math.hypot(...vector)).toBeCloseTo(1, 10);
    }
    expect(docs[1][0]).toBeCloseTo(1, 10);
  });

  it('no llama al modelo si no hay textos', async () => {
    const document = mockModel([]);
    const service = new EmbeddingService({
      modelId: 'modelo-de-prueba',
      document,
      query: document,
    });

    await expect(service.embedDocuments([])).resolves.toEqual([]);
    expect(document.doEmbedCalls).toHaveLength(0);
  });

  it('responde 503 ante un 429, sin reintentar', async () => {
    const model = new MockEmbeddingModelV4({
      maxEmbeddingsPerCall: 100,
      doEmbed: () => {
        throw new APICallError({
          message: 'Resource exhausted',
          url: 'https://example.test',
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: true,
        });
      },
    });
    const service = new EmbeddingService({
      modelId: 'modelo-de-prueba',
      document: model,
      query: model,
    });
    // Sin ruido de logs en la salida de los tests
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(service.embedQueries(['avena'])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(model.doEmbedCalls).toHaveLength(1);
  });

  it('rechaza vectores con otra cantidad de dimensiones', async () => {
    const model = mockModel([[0.1, 0.2, 0.3]]);
    const service = new EmbeddingService({
      modelId: 'modelo-de-prueba',
      document: model,
      query: model,
    });

    await expect(service.embedQueries(['avena'])).rejects.toThrow(
      /768 dimensiones/,
    );
  });
});

describe('normalize', () => {
  it('deja el vector con norma 1 y respeta el vector nulo', () => {
    expect(normalize([3, 4])).toEqual([0.6, 0.8]);
    expect(normalize([0, 0])).toEqual([0, 0]);
  });
});
