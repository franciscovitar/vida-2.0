/**
 * Contratos del sistema de acciones seguras (Block 3 — reversible writes).
 * Planos, serializables, sin IDs internos ni secretos en respuestas al cliente.
 */

export const WRITE_CONTRACT_VERSION = 'vida2-writes-v1' as const;
export type WriteContractVersion = typeof WRITE_CONTRACT_VERSION;

export type AllowedActionType =
  | 'task.create'
  | 'task.change-status'
  | 'inbox.capture'
  | 'gym.session.create'
  | 'calendar.hold.create'
  | 'proposal.create'
  | 'proposal.approve'
  | 'proposal.reject'
  | 'action.rollback';

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

/** Acciones de negocio que pueden vivir dentro de una propuesta. */
export type ProposedBusinessActionType =
  | 'inbox.capture'
  | 'task.create'
  | 'task.change-status'
  | 'gym.session.create'
  | 'calendar.hold.create';

export type ActionTargetType =
  'task' | 'inbox' | 'gym-session' | 'proposal' | 'calendar-hold' | 'calendar-block' | 'system';

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
  /** Hash opaco del actor (nunca email crudo). */
  actorHash: string;
  /** Hint sanitizado para auditoría / UI. */
  actorHint: string;
  payload: TPayload;
  idempotencyKey: IdempotencyKey;
  confirmation: ActionConfirmation;
  /** Estado previo esperado cuando aplica (p. ej. status de tarea). */
  expectedPrevious: string | null;
  context: {
    source: 'web' | 'openclaw' | `agent:${string}`;
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
  | 'policy-denied'
  | 'in-progress'
  | 'applied-audit-pending'
  | 'expired'
  | 'rolled-back'
  | 'rollback-failed'
  | 'lease-conflict'
  | 'misconfigured';

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
  /** Fase de saga (reservation / intention / finalize). */
  sagaPhase?: string | null;
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

export const INBOX_CAPTURE_ORIGINS = ['web', 'openclaw', 'chatgpt', 'manual', 'import'] as const;
export type InboxCaptureOrigin = (typeof INBOX_CAPTURE_ORIGINS)[number];

export interface InboxCapturePayload {
  text: string;
  link: string | null;
  capturedAt: string;
  origin: InboxCaptureOrigin;
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

export interface CalendarHoldCreatePayload {
  title: string;
  /** ISO-8601 start. */
  start: string;
  /** ISO-8601 end. */
  end: string;
  note?: string | null;
  relatedTaskKey?: string | null;
}

export type ProposalStatus =
  | 'pending'
  | 'executing'
  | 'applied'
  | 'rejected'
  | 'failed'
  | 'expired'
  | 'rolling-back'
  | 'rolled-back'
  | 'rollback-failed';

export type ProposalBusinessPayload =
  | { proposedActionType: 'task.create'; payload: TaskCreatePayload }
  | { proposedActionType: 'task.change-status'; payload: TaskChangeStatusPayload }
  | { proposedActionType: 'inbox.capture'; payload: InboxCapturePayload }
  | { proposedActionType: 'gym.session.create'; payload: GymSessionCreatePayload }
  | { proposedActionType: 'calendar.hold.create'; payload: CalendarHoldCreatePayload };

export interface ProposalCreatePayload {
  name: string;
  proposedActionType: ProposedBusinessActionType;
  targetType: ActionTargetType;
  targetKey: string | null;
  reason: string;
  expectedChange: string;
  risk: 'low' | 'medium' | 'high';
  reversible: boolean;
  /** Payload de negocio a ejecutar al aprobar (cifrado en reposo). */
  payload: ProposalBusinessPayload['payload'];
}

export interface ProposalDecidePayload {
  proposalKey: string;
}

export interface RollbackPayload {
  proposalKey: string;
}

export interface ActionDiffField {
  field: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface ActionDiff {
  fields: ActionDiffField[];
  warnings?: string[];
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
  expiresAt: string | null;
  executionStartedAt: string | null;
  rollbackDeadline: string | null;
  rolledBackAt: string | null;
  payloadDigest: string | null;
  contractVersion: WriteContractVersion | string;
  source: 'web' | 'openclaw' | string;
  beforeDigest: string | null;
  diff: ActionDiff | null;
  /** Referencia opaca al ciphertext (nunca el plaintext). */
  encryptedPayloadKey?: string | null;
  /** Token de ownership sanitizado / digest (no secretos de proveedor). */
  ownershipDigest?: string | null;
}
