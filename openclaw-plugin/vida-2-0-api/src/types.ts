/**
 * Closed type contracts for the Vida 2.0 OpenClaw plugin.
 *
 * These types mirror `types/openclaw.ts` and `types/actions.ts` in the main
 * Vida 2.0 web app (a separate npm project). They are redeclared here, not
 * imported, because this plugin ships and runs independently of the web app.
 * Vida's own server-side contract in `lib/openclaw/` remains the single
 * source of truth; this file must be kept in sync with it by hand.
 */

export type VidaAgentId = 'steward' | 'health-reflection' | 'digital-order' | 'technical-guardian';

export const VIDA_AGENT_IDS: readonly VidaAgentId[] = [
  'steward',
  'health-reflection',
  'digital-order',
  'technical-guardian',
] as const;

export type VidaAreaSlug = 'facultad' | 'genova-trabajo' | 'salud' | 'vida-personal';

export type VidaTaskStatus = 'Pendiente' | 'En progreso' | 'Bloqueada' | 'Hecha' | 'Algún día';

export type VidaProjectStatus = 'Activo' | 'En espera' | 'Bloqueado' | 'Completado' | 'Cancelado';

export type VidaProposalStatus =
  'pending' | 'approved' | 'rejected' | 'applied' | 'failed' | 'expired';

/** Read operations: routed to POST /api/openclaw/v1/read as `{ operation, input }`. */
export type VidaReadOperation =
  | 'system.overview'
  | 'areas.list'
  | 'areas.get'
  | 'tasks.list'
  | 'projects.list'
  | 'calendar.upcoming'
  | 'gym.summary'
  | 'approvals.list'
  | 'documents.search'
  | 'document.get'
  | 'technical.status'
  | 'technical.logs';

/** Propose operations: routed to POST /api/openclaw/v1/proposals as the full proposal envelope. */
export type VidaProposeOperation =
  | 'task.create.propose'
  | 'task.change-status.propose'
  | 'inbox.capture.propose'
  | 'gym.session.create.propose'
  | 'calendar.hold.create.propose';

/** Canary direct operation. Trusted transport fields are injected locally, never by the model. */
export type VidaDirectOperation = 'inbox.capture.direct';

/** Protocol-level operation: routed to GET /api/openclaw/v1/health. No Vida data capability. */
export type VidaProtocolOperation = 'system.health';

export type VidaOperation =
  VidaReadOperation | VidaProposeOperation | VidaDirectOperation | VidaProtocolOperation;

/* -------------------------------------------------------------------------- */
/* Read operation input shapes (mirrors types/openclaw.ts OpenClawReadRequest) */
/* -------------------------------------------------------------------------- */

export type VidaEmptyInput = Record<string, never>;

export type VidaAreasGetInput = { slug: VidaAreaSlug } | { areaKey: `area.${VidaAreaSlug}` };

export type VidaTasksListInput = {
  status?: VidaTaskStatus;
  areaKey?: string;
  projectKey?: string;
  dueBefore?: string;
  limit?: number;
  cursor?: string;
};

export type VidaProjectsListInput = {
  status?: VidaProjectStatus;
  areaKey?: string;
  limit?: number;
  cursor?: string;
};

export type VidaCalendarUpcomingInput = { days?: number };

export type VidaApprovalsListInput = { status?: VidaProposalStatus; limit?: number };

export type VidaDocumentsSearchInput = { query: string };

export type VidaDocumentGetInput = { slug: string };

/* -------------------------------------------------------------------------- */
/* Propose operation payload shapes (mirrors types/actions.ts)                */
/* -------------------------------------------------------------------------- */

export type VidaTaskCreatePayload = {
  title: string;
  priority: 'Alta' | 'Media' | 'Baja';
  areaKey: string;
  projectKey: string | null;
  date: string | null;
  duration: '5-15 min' | '30 min' | '1 h' | '2 h+' | null;
  energy: 'Baja' | 'Media' | 'Alta' | null;
  note: string | null;
};

export type VidaTaskChangeStatusPayload = {
  taskKey: string;
  nextStatus: VidaTaskStatus;
};

export type VidaInboxCapturePayload = {
  text: string;
  link: string | null;
  capturedAt: string;
  origin: 'web' | 'openclaw' | 'manual' | 'import';
};

export type VidaGymSetInput = {
  exerciseKey: string;
  exerciseName: string;
  setIndex: number;
  reps: number | null;
  weightKg: number | null;
  rpe: number | null;
  notes: string | null;
};

export type VidaGymSessionCreatePayload = {
  date: string;
  routineKey: string;
  workoutDayKey: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMinutes: number | null;
  energyBefore: number | null;
  notes: string | null;
  sets: readonly VidaGymSetInput[];
};

export type VidaCalendarHoldCreatePayload = {
  title: string;
  start: string;
  end: string;
  note?: string | null;
  relatedTaskKey?: string | null;
};

/* -------------------------------------------------------------------------- */
/* Operation calls: what the dispatcher sends after local trust resolution    */
/* -------------------------------------------------------------------------- */

export type VidaReadCall = {
  operation: VidaReadOperation;
  input: unknown;
};

export type VidaProposeCall = {
  operation: VidaProposeOperation;
  idempotencyKey: string;
  reason: string;
  expectedChange: string;
  risk: 'low' | 'medium' | 'high';
  reversible: boolean;
  targetKey?: string | null;
  payload: unknown;
};

export type VidaDirectCall = {
  operation: 'inbox.capture.direct';
  transport: {
    channel: 'telegram';
    principalId: string;
    sourceEventId: string;
  };
  input: {
    text: string;
    link: string | null;
  };
};

export type VidaHealthCall = {
  operation: VidaProtocolOperation;
};

export type VidaOperationCall = VidaReadCall | VidaProposeCall | VidaDirectCall | VidaHealthCall;
