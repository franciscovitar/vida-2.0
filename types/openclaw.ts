/**
 * Contratos planos de la API OpenClaw (8F.1).
 */
export const OPENCLAW_API_VERSION = 'v1' as const;
export type OpenClawApiVersion = typeof OPENCLAW_API_VERSION;

export const OPENCLAW_CAPABILITIES_VERSION = '2026-07-22' as const;

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
  | 'document.get';

export type OpenClawProposeOperation =
  | 'task.create.propose'
  | 'task.change-status.propose'
  | 'inbox.capture.propose'
  | 'gym.session.create.propose'
  | 'calendar.block.propose';

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

export type OpenClawReadRequest = {
  operation: OpenClawReadOperation;
  input: unknown;
};

export type OpenClawDataFreshness = 'live' | 'cached' | 'mock' | 'partial' | 'unavailable';

export type OpenClawReadResponse<T = unknown> = {
  ok: true;
  requestId: string;
  generatedAt: string;
  operation: OpenClawReadOperation;
  dataFreshness: OpenClawDataFreshness;
  sources: readonly string[];
  warnings: readonly string[];
  nextCursor: string | null;
  data: T;
};

export type OpenClawProposalRequest = {
  operation: OpenClawProposeOperation;
  idempotencyKey: string;
  reason: string;
  expectedChange: string;
  risk: 'low' | 'medium' | 'high';
  reversible: boolean;
  payload: Record<string, string | number | boolean | null>;
  targetKey?: string | null;
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
};

export type OpenClawCapability = {
  id: string;
  kind: 'read' | 'proposal' | 'forbidden';
  description: string;
};

export type OpenClawRequestContext = {
  requestId: string;
  keyId: string;
  actorId: string;
  method: string;
  pathname: string;
  receivedAt: string;
};

export type OpenClawAuthDecision =
  | { ok: true; keyId: string; actorId: string }
  | { ok: false; code: OpenClawErrorCode; message: string };

export type OpenClawRuntimeStatus = 'disabled' | 'ready' | 'misconfigured';
