/**
 * Contratos del sistema de acciones seguras (8E.1).
 * Planos, serializables, sin IDs internos ni secretos en respuestas al cliente.
 */

export type AllowedActionType =
  | 'task.create'
  | 'task.change-status'
  | 'inbox.capture'
  | 'gym.session.create'
  | 'proposal.create'
  | 'proposal.approve'
  | 'proposal.reject';

/** Acciones que nunca deben existir como endpoints públicos. */
export type ForbiddenActionType =
  | 'content.delete'
  | 'content.archive'
  | 'content.merge'
  | 'architecture.change'
  | 'rules.change'
  | 'journaling.read'
  | 'journaling.write'
  | 'message.send'
  | 'purchase.execute'
  | 'credentials.modify'
  | 'calendar.event.create'
  | 'medical.conclusive.write';

export type ActionType = AllowedActionType;

export type ActionTargetType =
  'task' | 'inbox' | 'gym-session' | 'proposal' | 'calendar-block' | 'system';

export interface ActionTarget {
  type: ActionTargetType;
  /** Clave opaca de dominio (no UUID de proveedor). */
  key: string | null;
}

export type ConfirmationMode = 'explicit' | 'reinforced';

export interface ActionConfirmation {
  mode: ConfirmationMode;
  /** Debe ser true para confirmación explícita. */
  acknowledged: boolean;
  /** Frase de refuerzo cuando mode === reinforced. */
  phrase: string | null;
}

export type IdempotencyKey = string;

export interface ActionRequest<TPayload = unknown> {
  actionType: ActionType;
  /** Email sanitizado del actor (nunca token). */
  actorEmail: string;
  payload: TPayload;
  idempotencyKey: IdempotencyKey;
  confirmation: ActionConfirmation;
  /** Estado previo esperado cuando aplica (p. ej. status de tarea). */
  expectedPrevious: string | null;
  context: {
    source: 'web';
    targetDate: string | null;
  };
}

export type ActionPolicyDecision =
  | {
      ok: true;
      actionType: AllowedActionType;
      confirmationRequired: ConfirmationMode;
      risk: 'low' | 'medium' | 'high';
      reversible: boolean;
    }
  | {
      ok: false;
      code:
        | 'flag-disabled'
        | 'unauthenticated'
        | 'unknown-action'
        | 'forbidden-action'
        | 'confirmation-missing'
        | 'confirmation-insufficient'
        | 'policy-denied';
      message: string;
    };

export type ActionResultCode =
  | 'applied'
  | 'idempotent-replay'
  | 'rejected'
  | 'conflict'
  | 'verification-failed'
  | 'partial'
  | 'failed'
  | 'not-configured'
  | 'flag-disabled'
  | 'unauthorized'
  | 'invalid-payload'
  | 'policy-denied';

export interface ActionError {
  code: ActionResultCode;
  message: string;
}

export interface ActionResult {
  ok: boolean;
  code: ActionResultCode;
  message: string;
  idempotencyKey: IdempotencyKey;
  actionType: ActionType | 'forbidden';
  target: ActionTarget | null;
  /** Resumen sanitizado post-acción. */
  summary: string | null;
  verified: boolean | null;
}

export interface ActionAuditRecord {
  actionType: string;
  actorHint: string;
  at: string;
  resultCode: ActionResultCode;
  confirmationMode: ConfirmationMode | 'none';
  idempotencyKey: IdempotencyKey;
  errorCode: string | null;
  targetKey: string | null;
  verified: boolean | null;
  /** Campos opcionales para ledger persistente (sanitizados). */
  targetType?: string | null;
  risk?: string | null;
  reversible?: boolean | null;
  beforeSummary?: string | null;
  afterSummary?: string | null;
  /** Digest determinista; no es el correo ni el UUID de Notion. */
  idempotencyDigest?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Payloads tipados                                                           */
/* -------------------------------------------------------------------------- */

export interface TaskCreatePayload {
  title: string;
  priority: 'Alta' | 'Media' | 'Baja';
  areaKey: string;
  projectKey: string | null;
  date: string | null;
  duration: '5-15 min' | '30 min' | '1 h' | '2 h+' | null;
  energy: 'Baja' | 'Media' | 'Alta' | null;
  note: string | null;
}

export interface TaskChangeStatusPayload {
  taskKey: string;
  nextStatus: 'Pendiente' | 'En progreso' | 'Bloqueada' | 'Hecha' | 'Algún día';
}

export interface InboxCapturePayload {
  text: string;
  link: string | null;
  capturedAt: string;
  origin: string;
}

export interface GymSetInput {
  exerciseKey: string;
  exerciseName: string;
  setIndex: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  rpe: number | null;
  completed: boolean;
  notes: string | null;
}

export interface GymSessionCreatePayload {
  date: string;
  routineKey: string;
  workoutDayKey: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMinutes: number | null;
  energyBefore: number | null;
  notes: string | null;
  sets: readonly GymSetInput[];
}

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'failed' | 'expired';

export interface ProposalCreatePayload {
  name: string;
  /** Acción que se ejecutaría al aprobar (nunca calendar.event.create). */
  proposedActionType: AllowedActionType | 'calendar.block.propose';
  targetType: ActionTargetType;
  targetKey: string | null;
  reason: string;
  expectedChange: string;
  risk: 'low' | 'medium' | 'high';
  reversible: boolean;
  /** Payload sanitizado (sin secretos). */
  sanitizedPayload: Record<string, string | number | boolean | null>;
}

export interface ProposalDecidePayload {
  proposalKey: string;
}

export interface CalendarBlockProposePayload {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  relatedTaskKey: string | null;
}

export interface ActionProposalSummary {
  key: string;
  name: string;
  actionType: string;
  targetType: ActionTargetType;
  targetKey: string | null;
  status: ProposalStatus;
  confirmationMode: ConfirmationMode;
  risk: 'low' | 'medium' | 'high';
  reversible: boolean;
  reason: string;
  expectedChange: string;
  beforeSummary: string | null;
  afterSummary: string | null;
  createdAt: string;
  decidedAt: string | null;
  appliedAt: string | null;
  resultCode: string | null;
}
