import {
  DraftCreatedSchema,
  MenuDraftJobSchema,
  type DraftCreated,
  type MenuDraftJob,
  type MenuRequest,
} from '@bocado/shared';

// Lo único que el cliente usa de un esquema de Zod
type Schema<T> = {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
};

// Cliente de la API de Bocado. Sirve en el navegador (formulario, SSE) y en
// el servidor (carga inicial de /drafts/[id]). Valida cada respuesta con los
// esquemas de @bocado/shared: si la API cambia de forma, falla aquí y no en
// un componente.

// NEXT_PUBLIC_: Next la incrusta en el bundle al compilar
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
).replace(/\/$/, '');

export type ApiIssue = { path: PropertyKey[]; code: string; message: string };

export type ApiErrorKind =
  | 'validation' // 400: el formulario muestra los errores por campo
  | 'rate_limited' // 429: cola llena
  | 'not_found' // 404: no existe o expiró
  | 'unreachable' // la API no responde
  | 'unexpected';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly issues: readonly ApiIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  schema: Schema<T>,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    // Sin caché: el estado de un menú cambia mientras se genera
    res = await fetch(`${API_URL}${path}`, { ...init, cache: 'no-store' });
  } catch {
    throw new ApiError('unreachable', 'No se pudo conectar con el servidor.');
  }

  const body: unknown = await res.json().catch(() => null);
  const message =
    typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message: unknown }).message)
      : '';

  if (res.ok) {
    const parsed = schema.safeParse(body);
    if (parsed.success) return parsed.data;
    throw new ApiError(
      'unexpected',
      'La API respondió con un formato inesperado.',
    );
  }
  if (res.status === 400) {
    const issues =
      typeof body === 'object' && body !== null && 'issues' in body
        ? ((body as { issues: ApiIssue[] }).issues ?? [])
        : [];
    throw new ApiError('validation', message || 'Datos inválidos.', issues);
  }
  if (res.status === 404) {
    throw new ApiError('not_found', 'Este menú no existe o ya expiró.');
  }
  if (res.status === 429) {
    throw new ApiError(
      'rate_limited',
      message || 'Hay muchos menús en cola. Intenta de nuevo en unos minutos.',
    );
  }
  throw new ApiError('unexpected', 'El servidor respondió con un error.');
}

export function createDraft(menu: MenuRequest): Promise<DraftCreated> {
  return request('/menu/drafts', DraftCreatedSchema, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(menu),
  });
}

export function getDraft(id: string): Promise<MenuDraftJob> {
  return request(`/menu/drafts/${encodeURIComponent(id)}`, MenuDraftJobSchema);
}

export const draftEventsUrl = (id: string) =>
  `${API_URL}/menu/drafts/${encodeURIComponent(id)}/events`;
