/**
 * OFFLINE synthetic DEV execution-intent envelope; no route or live signer.
 *
 * A valid MAC proves only that a holder of the signing secret issued this
 * exact envelope. It does NOT prove authenticated user intent/realness by
 * itself. A future issuer MUST separately validate the actor's authenticated
 * session, positive normalized-report opt-in and independently grounded source.
 * Never expose the signing key or issuer to browser/user supplied inputs.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { compilePlanningV2AppendCells } from '@/lib/daily-planning/append-cells-v2';

import type {
  PlanningV2SyntheticPorts,
  PlanningV2ProtocolResult,
} from '@/lib/daily-planning/dispatch-protocol-v2';
import { simulatePlanningV2DispatchProtocol } from '@/lib/daily-planning/dispatch-protocol-v2';

const PURPOSE = 'planning-v2:normalized-execution:dev:write-intent-v1';
const ID = /^vida2:tasks-daily-planning:v2:execution:[a-f0-9]{64}$/;
const HASH = /^[0-9a-f]{64}$/;
const MAX_AGE_SECONDS = 300;

type IntentClaims = {
  purpose: typeof PURPOSE;
  recordId: string;
  payloadDigest: string;
  actorScope: string;
  workbookScope: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export interface PlanningV2SyntheticWriteIntent {
  payload: string;
  mac: string;
}

export interface PlanningV2IntentContext {
  /** Authenticated actor identity supplied by a future, independently verified server boundary. */
  actorId: string;
  /** DEV workbook ID resolved from the trusted server config, never a client URL. */
  devWorkbookId: string;
  /** Exact PAS-validated 17-column execution row. */
  executionRow: readonly unknown[];
  /** Injected time for deterministic tests. */
  nowSeconds: number;
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function rowDigest(row: readonly unknown[]): string | null {
  if (
    !Array.isArray(row) ||
    row.length !== 17 ||
    typeof row[0] !== 'string' ||
    !ID.test(row[0]) ||
    row[16] !== 'planning-execution-v2' ||
    !compilePlanningV2AppendCells({ kind: 'execution', row, sheetId: 0, target: 'dev' }).ok
  )
    return null;
  try {
    const raw = JSON.stringify(['execution', row]);
    if (!raw || Buffer.byteLength(raw, 'utf8') > 32 * 1024) return null;
    return digest(raw);
  } catch {
    return null;
  }
}

function validContext(context: PlanningV2IntentContext, secret: string): boolean {
  return (
    typeof secret === 'string' &&
    Buffer.byteLength(secret, 'utf8') >= 32 &&
    !!context &&
    typeof context === 'object' &&
    typeof context.actorId === 'string' &&
    context.actorId.length >= 3 &&
    context.actorId.length <= 256 &&
    !!context.actorId.trim() &&
    !/[\r\n]/.test(context.actorId) &&
    typeof context.devWorkbookId === 'string' &&
    context.devWorkbookId.length >= 10 &&
    context.devWorkbookId.length <= 256 &&
    !!context.devWorkbookId.trim() &&
    !/[\r\n]/.test(context.devWorkbookId) &&
    Number.isSafeInteger(context.nowSeconds) &&
    context.nowSeconds > 0 &&
    rowDigest(context.executionRow) !== null
  );
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Test-only mint operation. Its inputs are NOT verified user evidence.
 * This must not be exported by an authenticated API or wired to real secrets.
 */
export function issueSyntheticPlanningV2WriteIntent(
  context: PlanningV2IntentContext,
  secret: string,
): PlanningV2SyntheticWriteIntent | null {
  if (!validContext(context, secret)) return null;
  const claims: IntentClaims = {
    purpose: PURPOSE,
    recordId: context.executionRow[0] as string,
    payloadDigest: rowDigest(context.executionRow)!,
    actorScope: digest(context.actorId),
    workbookScope: digest(context.devWorkbookId),
    issuedAt: context.nowSeconds,
    expiresAt: context.nowSeconds + MAX_AGE_SECONDS,
    nonce: randomBytes(16).toString('hex'),
  };
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return { payload, mac: sign(payload, secret) };
}

/** Exact-bound, short-lived MAC validation with no plaintext ID in results. */
export function verifySyntheticPlanningV2WriteIntent(
  intent: PlanningV2SyntheticWriteIntent | null,
  context: PlanningV2IntentContext,
  secret: string,
): boolean {
  if (
    !validContext(context, secret) ||
    !intent ||
    typeof intent.payload !== 'string' ||
    typeof intent.mac !== 'string' ||
    intent.payload.length > 2048 ||
    intent.payload.length === 0 ||
    !HASH.test(intent.mac)
  )
    return false;
  const expected = Buffer.from(sign(intent.payload, secret), 'hex');
  const actual = Buffer.from(intent.mac, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const raw = Buffer.from(intent.payload, 'base64url').toString('utf8');
    const claims = JSON.parse(raw) as IntentClaims;
    if (
      Buffer.from(raw, 'utf8').toString('base64url') !== intent.payload ||
      JSON.stringify(claims) !== raw ||
      !claims ||
      typeof claims !== 'object' ||
      Object.keys(claims).length !== 8 ||
      claims.purpose !== PURPOSE ||
      claims.recordId !== context.executionRow[0] ||
      claims.payloadDigest !== rowDigest(context.executionRow) ||
      claims.actorScope !== digest(context.actorId) ||
      claims.workbookScope !== digest(context.devWorkbookId) ||
      typeof claims.nonce !== 'string' ||
      !/^[a-f0-9]{32}$/.test(claims.nonce) ||
      !Number.isSafeInteger(claims.issuedAt) ||
      !Number.isSafeInteger(claims.expiresAt) ||
      claims.issuedAt > context.nowSeconds ||
      claims.expiresAt <= context.nowSeconds ||
      claims.expiresAt - claims.issuedAt !== MAX_AGE_SECONDS
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * This connects the synthetic intent check to the EXISTING synthetic-port
 * protocol. It still must NEVER be supplied real provider ports: a caller
 * could fabricate attested context until a trusted server issuer exists.
 */
export async function simulateIntentGatedPlanningV2Write(
  input: { context: PlanningV2IntentContext; intent: PlanningV2SyntheticWriteIntent | null },
  secret: string,
  ports: PlanningV2SyntheticPorts,
): Promise<PlanningV2ProtocolResult> {
  if (!verifySyntheticPlanningV2WriteIntent(input.intent, input.context, secret)) {
    return { status: 'blocked', sendAttempts: 0, retryAllowed: false };
  }
  return simulatePlanningV2DispatchProtocol(
    {
      kind: 'execution',
      candidateRow: input.context.executionRow,
    },
    ports,
  );
}
