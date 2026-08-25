/**
 * Closed operation -> {method, path} routing table.
 *
 * This is the ONLY place that decides which HTTP method and pathname a
 * request uses. No caller-supplied value ever reaches the method or the
 * pathname: both come exclusively from this fixed table, keyed by a closed
 * operation id. There is no arbitrary-URL, arbitrary-path, or
 * arbitrary-method escape hatch, and Journaling has no operation id at all
 * so it cannot be reached through this contract.
 */
import type { VidaOperation, VidaProposeOperation, VidaReadOperation } from './types.js';

export type VidaHttpMethod = 'GET' | 'POST';

export type VidaOperationKind = 'read' | 'propose' | 'protocol';

export type VidaOperationRoute = {
  readonly method: VidaHttpMethod;
  readonly pathname: string;
  readonly kind: VidaOperationKind;
};

const READ_OPERATIONS: readonly VidaReadOperation[] = [
  'system.overview',
  'areas.list',
  'areas.get',
  'tasks.list',
  'projects.list',
  'calendar.upcoming',
  'gym.summary',
  'approvals.list',
  'documents.search',
  'document.get',
  'technical.status',
  'technical.logs',
];

const PROPOSE_OPERATIONS: readonly VidaProposeOperation[] = [
  'task.create.propose',
  'task.change-status.propose',
  'inbox.capture.propose',
  'gym.session.create.propose',
  'calendar.hold.create.propose',
];

const READ_ROUTE: VidaOperationRoute = Object.freeze({
  method: 'POST',
  pathname: '/api/openclaw/v1/read',
  kind: 'read',
});

const PROPOSE_ROUTE: VidaOperationRoute = Object.freeze({
  method: 'POST',
  pathname: '/api/openclaw/v1/proposals',
  kind: 'propose',
});

const HEALTH_ROUTE: VidaOperationRoute = Object.freeze({
  method: 'GET',
  pathname: '/api/openclaw/v1/health',
  kind: 'protocol',
});

const ROUTES: ReadonlyMap<VidaOperation, VidaOperationRoute> = new Map([
  ...READ_OPERATIONS.map((op) => [op, READ_ROUTE] as const),
  ...PROPOSE_OPERATIONS.map((op) => [op, PROPOSE_ROUTE] as const),
  ['system.health', HEALTH_ROUTE] as const,
]);

export function isVidaReadOperation(value: string): value is VidaReadOperation {
  return (READ_OPERATIONS as readonly string[]).includes(value);
}

export function isVidaProposeOperation(value: string): value is VidaProposeOperation {
  return (PROPOSE_OPERATIONS as readonly string[]).includes(value);
}

export function isVidaOperation(value: string): value is VidaOperation {
  return ROUTES.has(value as VidaOperation);
}

export function listVidaOperations(): readonly VidaOperation[] {
  return Array.from(ROUTES.keys());
}

/** Fail-closed lookup: returns null for anything outside the closed operation set. */
export function resolveOperationRoute(operation: string): VidaOperationRoute | null {
  if (!isVidaOperation(operation)) return null;
  return ROUTES.get(operation) ?? null;
}
