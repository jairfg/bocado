import { z } from 'zod';
import { MenuDraftSchema } from './menu-draft.js';
import { MealSlotSchema, MenuRequestSchema } from './menu-request.js';

// Etapas del armado de un menú. Cada evento trae un mensaje corto en
// español para mostrar tal cual en la interfaz.
const stage = <T extends string>(name: T) => ({
  stage: z.literal(name),
  message: z.string(),
});

export const DraftProgressSchema = z.discriminatedUnion('stage', [
  z.object(stage('interpreting_restrictions')),
  z.object(stage('selecting_candidates')),
  z.object(stage('choosing_foods')),
  z.object(stage('optimizing_portions')),
  z.object({ ...stage('revising_meal'), slot: MealSlotSchema }),
  // El limitador de ritmo frenó una llamada para no superar la cuota
  z.object({ ...stage('waiting_for_quota'), seconds: z.int().min(1) }),
  z.object(stage('completed')),
]);

export type DraftProgress = z.infer<typeof DraftProgressSchema>;
export type DraftStage = DraftProgress['stage'];

export const DraftStatusSchema = z.enum([
  'queued',
  'active',
  'completed',
  'failed',
]);

export type DraftStatus = z.infer<typeof DraftStatusSchema>;

// Códigos de falla: el mensaje lo arma la API, nunca con detalles internos
export const DraftFailureSchema = z.object({
  code: z.enum([
    'invalid_model_output',
    'provider_unavailable',
    'provider_error',
    'timeout',
    'interrupted',
    'internal_error',
  ]),
  message: z.string(),
});

export type DraftFailure = z.infer<typeof DraftFailureSchema>;
export type DraftFailureCode = DraftFailure['code'];

// POST /menu/drafts
export const DraftCreatedSchema = z.object({
  id: z.uuid(),
  status: z.literal('queued'),
});

export type DraftCreated = z.infer<typeof DraftCreatedSchema>;

// GET /menu/drafts/:id y primer evento del SSE
export const MenuDraftJobSchema = z.object({
  id: z.uuid(),
  status: DraftStatusSchema,
  // Lo que se pidió: la web lo usa para "Generar otro menú" con los mismos
  // valores, también desde un enlace compartido
  request: MenuRequestSchema,
  // Última etapa reportada; null si el worker aún no empezó
  progress: DraftProgressSchema.nullable(),
  result: MenuDraftSchema.nullable(),
  error: DraftFailureSchema.nullable(),
});

export type MenuDraftJob = z.infer<typeof MenuDraftJobSchema>;
