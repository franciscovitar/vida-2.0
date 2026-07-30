/**
 * Contratos planos de la API OpenClaw (8F.1).
 */
import type {
  CalendarHoldCreatePayload,
  GymSessionCreatePayload,
  InboxCapturePayload,
  TaskChangeStatusPayload,
  TaskCreatePayload,
} from '@/types/actions';

export const OPENCLAW_API_VERSION = 'v1' as const;
export type OpenClawApiVersion = typeof OPENCLAW_API_VERSION;

export const OPENCLAW_CAPABILITIES_VERSION = '2026-07-30-agents-v1' as const;

export type OpenClawAccessMode = 'disabled' | 'read-only' | 'full';

export type OpenClawReadOperation =
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

export type OpenClawAreaSlug = 'facultad' | 'genova-trabajo' | 'salud' | 'vida-personal';
export type OpenClawCanonicalAreaKey = `area.${OpenClawAreaSlug}`;

export type OpenClawTaskStatus = 'Pendiente' | 'En progreso' | 'Bloqueada' | 'Hecha' | 'Algún día';
export type OpenClawProjectStatus =
  'Activo' | 'En espera' | 'Bloqueado' | 'Completado' | 'Cancelado';
export type OpenClawProposalStatus =
  'pending' | 'approved' | 'rejected' | 'applied' | 'failed' | 'expired';

/** Objeto JSON vacío exacto (sin propiedades). */
export type OpenClawEmptyInput = Record<string, never>;

export type OpenClawAreasGetInput =
  { slug: OpenClawAreaSlug } | { areaKey: OpenClawCanonicalAreaKey };

export type OpenClawTasksListInput = {
  status?: OpenClawTaskStatus;
  areaKey?: string;
  projectKey?: string;
  dueBefore?: string;
  limit?: number;
  cursor?: string;
};

export type OpenClawProjectsListInput = {
  status?: OpenClawProjectStatus;
  areaKey?: string;
  limit?: number;
  cursor?: string;
};

export type OpenClawCalendarUpcomingInput = {
  days?: number;
};

export type OpenClawApprovalsListInput = {
  status?: OpenClawProposalStatus;
  limit?: number;
};

export type OpenClawDocumentsSearchInput = {
  query: string;
};

export type OpenClawDocumentGetInput = {
  slug: string;
};

export type OpenClawProposeOperation =
  | 'task.create.propose'
  | 'task.change-status.propose'
  | 'inbox.capture.propose'
  | 'gym.session.create.propose'
  | 'calendar.hold.create.propose'
  /** @deprecated Usar calendar.hold.create.propose */
  | 'calendar.block.propose';

export const OPENCLAW_AGENT_IDS = [
  'steward',
  'health-reflection',
  'digital-order',
  'technical-guardian',
] as const;

export type OpenClawAgentId = (typeof OPENCLAW_AGENT_IDS)[number];

export type OpenClawAgentProfile = {
  id: OpenClawAgentId;
  name: string;
  allowedReads: readonly OpenClawReadOperation[];
  allowedProposals: readonly OpenClawProposeOperation[];
  areaScopes: readonly OpenClawAreaSlug[];
  approvalsScope: 'own' | 'none';
  documentScope: 'general' | 'health' | 'none';
  maxPrivacy: 'general' | 'health' | 'technical';
};

export type OpenClawAgentCredential = {
  agentId: OpenClawAgentId;
  keyId: string;
  secret: string;
};

export type OpenClawAgentCredentialsResolution =
  | { ok: true; credentials: readonly OpenClawAgentCredential[] }
  | {
      ok: false;
      reason: 'no-credentials' | 'incomplete-credentials' | 'duplicate-key-id';
    };

export type OpenClawErrorCode =
  | 'api-disabled'
  | 'unauthorized'
  | 'invalid-signature'
  | 'expired-request'
  | 'invalid-content-type'
  | 'body-too-large'
  | 'invalid-json'
  | 'invalid-operation'
  | 'invalid-input'
  | 'forbidden'
  | 'not-found'
  | 'source-unavailable'
  | 'conflict'
  | 'rate-limited'
  | 'replay-detected'
  | 'security-control-unavailable'
  | 'flag-disabled'
  | 'internal-error';

export type OpenClawApiError = {
  code: OpenClawErrorCode;
  message: string;
  retryable: boolean;
};

export type OpenClawErrorResponse = {
  ok: false;
  requestId: string;
  error: OpenClawApiError;
};

export type OpenClawReadRequest =
  | { operation: 'system.overview'; input: OpenClawEmptyInput }
  | { operation: 'areas.list'; input: OpenClawEmptyInput }
  | { operation: 'areas.get'; input: OpenClawAreasGetInput }
  | { operation: 'tasks.list'; input: OpenClawTasksListInput }
  | { operation: 'projects.list'; input: OpenClawProjectsListInput }
  | { operation: 'calendar.upcoming'; input: OpenClawCalendarUpcomingInput }
  | { operation: 'gym.summary'; input: OpenClawEmptyInput }
  | { operation: 'approvals.list'; input: OpenClawApprovalsListInput }
  | { operation: 'documents.search'; input: OpenClawDocumentsSearchInput }
  | { operation: 'document.get'; input: OpenClawDocumentGetInput }
  | { operation: 'technical.status'; input: OpenClawEmptyInput }
  | { operation: 'technical.logs'; input: OpenClawEmptyInput };

export type OpenClawDataFreshness = 'live' | 'cached' | 'mock' | 'partial' | 'unavailable';
export type OpenClawReadAvailability = 'ready' | 'degraded' | 'unavailable';
export type OpenClawSourceReadiness = 'ready' | 'mock' | 'unavailable';
export type OpenClawApiStatus = 'disabled' | 'misconfigured' | 'read-only';
export type OpenClawReadinessStatus = 'disabled' | 'blocked' | 'degraded' | 'ready';

export type OpenClawProposalsComponentStatus = 'disabled' | 'ready' | 'misconfigured';

export type OpenClawReadiness = {
  apiStatus: OpenClawApiStatus;
  status: OpenClawReadinessStatus;
  securityControls: 'ready' | 'blocked';
  sources: {
    notion: OpenClawSourceReadiness;
    sheets: OpenClawSourceReadiness;
    calendar: OpenClawSourceReadiness;
    catalog: OpenClawSourceReadiness;
  };
  readers: Record<OpenClawReadOperation, OpenClawReadAvailability>;
  /** Proposal-only (nunca approve/direct-write). Depende de ambas flags. */
  openclawProposals: OpenClawProposalsComponentStatus;
};

export type OpenClawReadResponse<T = unknown> = {
  ok: true;
  requestId: string;
  generatedAt: string;
  operation: OpenClawReadOperation;
  dataFreshness: OpenClawDataFreshness;
  sources: readonly string[];
  warnings: readonly string[];
  nextCursor: string | null;
  itemCount: number;
  data: T;
};

type OpenClawProposalRequestBase = {
  idempotencyKey: string;
  reason: string;
  expectedChange: string;
  risk: 'low' | 'medium' | 'high';
  reversible: boolean;
  targetKey?: string | null;
};

export type OpenClawProposalRequest =
  | (OpenClawProposalRequestBase & {
      operation: 'task.create.propose';
      payload: TaskCreatePayload;
    })
  | (OpenClawProposalRequestBase & {
      operation: 'task.change-status.propose';
      payload: TaskChangeStatusPayload;
    })
  | (OpenClawProposalRequestBase & {
      operation: 'inbox.capture.propose';
      payload: InboxCapturePayload;
    })
  | (OpenClawProposalRequestBase & {
      operation: 'gym.session.create.propose';
      payload: GymSessionCreatePayload;
    })
  | (OpenClawProposalRequestBase & {
      operation: 'calendar.hold.create.propose';
      payload: CalendarHoldCreatePayload;
    })
  | (OpenClawProposalRequestBase & {
      operation: 'calendar.block.propose';
      payload: CalendarHoldCreatePayload;
    });

export type OpenClawProposalDiffField = {
  field: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
};

export type OpenClawProposalDiff = {
  fields: OpenClawProposalDiffField[];
  warnings?: string[];
};

export type OpenClawProposalResponse = {
  ok: true;
  requestId: string;
  generatedAt: string;
  proposalKey: string;
  status: 'pending';
  operation: OpenClawProposeOperation;
  replay: boolean;
  summary: string | null;
  risk: 'low' | 'medium' | 'high';
  expiresAt: string | null;
  diff: OpenClawProposalDiff | null;
};

export type OpenClawProposalGetResponse = {
  ok: true;
  requestId: string;
  generatedAt: string;
  proposalKey: string;
  status: string;
  operation: string;
  risk: 'low' | 'medium' | 'high';
  reversible: boolean;
  expiresAt: string | null;
  summary: string | null;
  diff: OpenClawProposalDiff | null;
  source: string;
};

export type OpenClawCapability = {
  id: string;
  kind: 'read' | 'proposal' | 'forbidden';
  description: string;
  availability?: OpenClawReadAvailability;
};

export type OpenClawRequestContext = {
  requestId: string;
  keyId: string;
  agentId: OpenClawAgentId;
  actorId: string;
  method: string;
  pathname: string;
  receivedAt: string;
};

export type OpenClawReplayKeys = {
  requestKey: string;
  canonicalKey: string;
};

export type OpenClawAuthDecision =
  | {
      ok: true;
      keyId: string;
      agentId: OpenClawAgentId;
      actorId: string;
      requestId: string;
      replayKeys: OpenClawReplayKeys;
    }
  | { ok: false; code: OpenClawErrorCode; message: string };

export type OpenClawRuntimeStatus = 'disabled' | 'read-only' | 'misconfigured';
