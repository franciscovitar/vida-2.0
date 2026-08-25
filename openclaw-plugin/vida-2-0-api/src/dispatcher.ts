/**
 * Core request dispatcher: the only place that builds, signs, and sends a
 * request to Vida's OpenClaw API. Everything here is pure and dependency-
 * injected (fetch, clock, request-id generator, secret resolver) so it is
 * fully unit-testable without a network, without OpenClaw installed, and
 * without any real secret.
 *
 * Fail-closed by construction:
 * - unknown agent, unsupported operation, operation not allowed for the
 *   agent, malformed call shape, missing credential, or a malformed base
 *   URL all short-circuit before any network call is made.
 * - a non-2xx or structurally unexpected Vida response never becomes a
 *   success result.
 * - there is exactly one fetch attempt per call. No retries, ever -- an
 *   ambiguous network outcome on a propose call is surfaced as a network
 *   error, never silently retried.
 * - returned results never carry the signing secret, the canonical
 *   string, the HMAC signature, Vida's raw error body, or a stack trace.
 */
import { isVidaAgentId, isOperationAllowedForAgent } from './agents.js';
import { buildCanonicalString, formatTimestamp, signCanonical } from './canonical.js';
import { resolveOperationRoute, type VidaOperationRoute } from './operations.js';
import type { SecretResolver } from './secrets.js';
import type { VidaOperationCall, VidaProposeCall } from './types.js';
import type { RequestIdGenerator } from './request-id.js';

export type VidaClientErrorCode =
  | 'unknown-agent'
  | 'unsupported-operation'
  | 'operation-not-allowed'
  | 'invalid-input'
  | 'missing-credential'
  | 'invalid-configuration'
  | 'network-error'
  | 'unexpected-response'
  | 'http-error';

export type VidaOperationResult =
  | {
      readonly ok: true;
      readonly status: number;
      readonly requestId: string;
      readonly data: unknown;
    }
  | {
      readonly ok: false;
      readonly status: number | null;
      readonly code: VidaClientErrorCode;
      readonly message: string;
    };

export type MinimalResponse = {
  readonly status: number;
  readonly ok: boolean;
  text(): Promise<string>;
};

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<MinimalResponse>;

export type ClockLike = () => number;

export type VidaClientConfig = {
  /** Vida origin only, e.g. https://vida.example.com -- no path, no trailing slash required. */
  readonly baseUrl: string;
};

export type VidaDispatchDeps = {
  readonly fetch: FetchLike;
  readonly now: ClockLike;
  readonly requestId: RequestIdGenerator;
  readonly resolveSecret: SecretResolver;
  readonly signal?: AbortSignal;
};

const GENERIC_HTTP_ERROR_MESSAGES: Readonly<Record<number, string>> = Object.freeze({
  400: 'Vida rejected the request as invalid.',
  401: 'Vida rejected the request credentials.',
  403: 'Vida denied this operation.',
  404: 'Vida reported the operation as unavailable.',
  409: 'Vida reported a conflicting request.',
  413: 'Vida rejected the request as too large.',
  415: 'Vida rejected the request content type.',
  429: 'Vida rate-limited this request.',
  503: 'A Vida security control is temporarily unavailable.',
});

function genericHttpErrorMessage(status: number): string {
  return GENERIC_HTTP_ERROR_MESSAGES[status] ?? 'Vida rejected the request.';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidBaseUrl(baseUrl: string): boolean {
  if (typeof baseUrl !== 'string' || baseUrl.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && parsed.search === '' && parsed.hash === '';
}

function buildTargetUrl(baseUrl: string, pathname: string): string {
  const origin = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${origin}${pathname}`;
}

/** Builds the exact JSON bytes to hash and send. Returns null on a call shape that does not match the operation's kind. */
function buildRequestBody(
  call: VidaOperationCall,
  route: VidaOperationRoute,
): { ok: true; rawBody: string } | { ok: false } {
  if (route.kind === 'protocol') {
    return { ok: true, rawBody: '' };
  }

  if (route.kind === 'read') {
    if (!('input' in call)) return { ok: false };
    return {
      ok: true,
      rawBody: JSON.stringify({ operation: call.operation, input: call.input ?? {} }),
    };
  }

  // route.kind === 'propose'
  if (!('idempotencyKey' in call)) return { ok: false };
  const proposeCall = call as VidaProposeCall;
  const validRisk =
    proposeCall.risk === 'low' || proposeCall.risk === 'medium' || proposeCall.risk === 'high';
  if (
    typeof proposeCall.idempotencyKey !== 'string' ||
    proposeCall.idempotencyKey.length === 0 ||
    typeof proposeCall.reason !== 'string' ||
    proposeCall.reason.length === 0 ||
    typeof proposeCall.expectedChange !== 'string' ||
    proposeCall.expectedChange.length === 0 ||
    !validRisk ||
    typeof proposeCall.reversible !== 'boolean' ||
    proposeCall.payload === undefined
  ) {
    return { ok: false };
  }

  const envelope = {
    operation: proposeCall.operation,
    idempotencyKey: proposeCall.idempotencyKey,
    reason: proposeCall.reason,
    expectedChange: proposeCall.expectedChange,
    risk: proposeCall.risk,
    reversible: proposeCall.reversible,
    targetKey: proposeCall.targetKey ?? null,
    payload: proposeCall.payload,
  };
  return { ok: true, rawBody: JSON.stringify(envelope) };
}

export async function executeVidaOperation(params: {
  agentId: string;
  call: VidaOperationCall;
  config: VidaClientConfig;
  deps: VidaDispatchDeps;
}): Promise<VidaOperationResult> {
  const { agentId: rawAgentId, call, config, deps } = params;

  if (!isVidaAgentId(rawAgentId)) {
    return {
      ok: false,
      status: null,
      code: 'unknown-agent',
      message: 'Unknown or untrusted agent identity.',
    };
  }
  const agentId = rawAgentId;

  const route = resolveOperationRoute(call.operation);
  if (!route) {
    return {
      ok: false,
      status: null,
      code: 'unsupported-operation',
      message: 'Operation is not part of the closed contract.',
    };
  }
  const operation = call.operation;

  if (!isOperationAllowedForAgent(agentId, operation)) {
    return {
      ok: false,
      status: null,
      code: 'operation-not-allowed',
      message: 'Operation is not allowed for this agent.',
    };
  }

  const body = buildRequestBody(call, route);
  if (!body.ok) {
    return {
      ok: false,
      status: null,
      code: 'invalid-input',
      message: 'Call shape does not match the operation contract.',
    };
  }
  const rawBody = body.rawBody;

  if (!isValidBaseUrl(config.baseUrl)) {
    return {
      ok: false,
      status: null,
      code: 'invalid-configuration',
      message: 'Vida base URL is not configured correctly.',
    };
  }

  let credential;
  try {
    credential = await deps.resolveSecret(agentId);
  } catch {
    return {
      ok: false,
      status: null,
      code: 'missing-credential',
      message: 'Credential resolution failed.',
    };
  }
  if (!credential || !credential.keyId || !credential.secret) {
    return {
      ok: false,
      status: null,
      code: 'missing-credential',
      message: 'No credential configured for this agent.',
    };
  }

  const timestamp = formatTimestamp(deps.now());
  const requestId = deps.requestId();
  const canonical = buildCanonicalString({
    timestamp,
    requestId,
    method: route.method,
    pathname: route.pathname,
    rawBody,
  });
  const signature = signCanonical(credential.secret, canonical);

  const headers: Record<string, string> = {
    'X-Vida-Key-Id': credential.keyId,
    'X-Vida-Timestamp': timestamp,
    'X-Vida-Signature': signature,
    'X-Vida-Request-Id': requestId,
  };
  if (route.method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  const url = buildTargetUrl(config.baseUrl, route.pathname);

  let response: MinimalResponse;
  try {
    response = await deps.fetch(url, {
      method: route.method,
      headers,
      body: route.method === 'POST' ? rawBody : undefined,
      signal: deps.signal,
    });
  } catch {
    return {
      ok: false,
      status: null,
      code: 'network-error',
      message: 'Network error contacting Vida.',
    };
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    return {
      ok: false,
      status: response.status,
      code: 'unexpected-response',
      message: 'Vida response body was unreadable.',
    };
  }

  let parsed: unknown;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    return {
      ok: false,
      status: response.status,
      code: 'unexpected-response',
      message: 'Vida response was not valid JSON.',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      code: 'http-error',
      message: genericHttpErrorMessage(response.status),
    };
  }

  if (!isPlainObject(parsed) || parsed.ok !== true || !('requestId' in parsed)) {
    return {
      ok: false,
      status: response.status,
      code: 'unexpected-response',
      message: 'Vida response shape was unexpected.',
    };
  }

  const responseRequestId = typeof parsed.requestId === 'string' ? parsed.requestId : requestId;
  return { ok: true, status: response.status, requestId: responseRequestId, data: parsed };
}
