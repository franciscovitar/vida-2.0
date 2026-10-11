/**
 * DEVELOPMENT STAGING ONLY: an at-most-one DISPATCH DECISION per immutable V2 ID.
 * NOT a Sheets writer, credential boundary, distributed full-transaction lock,
 * remote provider certification, or exactly-once guarantee.
 *
 * Once DISPATCHED the key must NEVER expire/release/auto-retry. A crash before
 * making the provider request is intentionally indistinguishable from a lost
 * response. Resolve only by independently audited read-back; no manual clear.
 */
import { createHash } from 'node:crypto';
import {
  evalRedisScript,
  resolveUpstashRestConfig,
  type UpstashRedisFetch,
  type UpstashRestConfig,
} from '@/lib/actions/upstash-rest';
import { resolveSpreadsheetTarget } from '@/lib/google/spreadsheet-target-core';

export type PlanningV2TransportKind = 'execution' | 'orientation' | 'assessment';
export type PlanningV2LedgerStatus =
  | 'prepared'
  | 'already-prepared'
  | 'dispatch-once'
  | 'uncertain'
  | 'conflict'
  | 'blocked'
  | 'unavailable';
export type PlanningV2LedgerOperation = 'prepare' | 'dispatch';

export interface PlanningV2LedgerRecord {
  kind: PlanningV2TransportKind;
  recordId: string;
  /** SHA-256 over canonical full candidate row, checked separately at source. */
  payloadDigest: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const IDS: Readonly<Record<PlanningV2TransportKind, RegExp>> = {
  execution: /^vida2:tasks-daily-planning:v2:execution:[a-f0-9]{64}$/,
  orientation: /^vida2:tasks-daily-planning:v2:orientation:\d{4}-\d{2}-\d{2}:[a-f0-9]{64}$/,
  assessment: /^vida2:assessment-progress:v1:[a-f0-9]{64}$/,
};
const STATUS = new Set<PlanningV2LedgerStatus>([
  'prepared',
  'already-prepared',
  'dispatch-once',
  'uncertain',
  'conflict',
  'blocked',
]);

/**
 * Pure atomic Redis EVAL. No EX/PX, lease timeout, DEL or force-reserve route.
 * If EVAL succeeds but its HTTP response is lost, the NEXT dispatch is blocked.
 * Existing corrupted state is blocked, never replaced with a fresh reservation.
 */
export const PLANNING_V2_DISPATCH_LUA = `
local key = KEYS[1]
local operation = ARGV[1]
local digest = ARGV[2]
if (operation ~= 'prepare' and operation ~= 'dispatch') or not string.match(digest, '^[a-f0-9]+$') or string.len(digest) ~= 64 then
  return 'blocked'
end
local stored = redis.call('GET', key)
if not stored then
  if operation ~= 'prepare' then return 'blocked' end
  redis.call('SET', key, cjson.encode({state='prepared', digest=digest}))
  return 'prepared'
end
local ok, row = pcall(cjson.decode, stored)
if not ok or type(row) ~= 'table' or type(row.digest) ~= 'string' or type(row.state) ~= 'string' then
  return 'blocked'
end
if row.digest ~= digest then return 'conflict' end
if operation == 'prepare' then
  if row.state == 'prepared' then return 'already-prepared' end
  if row.state == 'dispatched' then return 'uncertain' end
  return 'blocked'
end
if row.state == 'prepared' then
  redis.call('SET', key, cjson.encode({state='dispatched', digest=digest}))
  return 'dispatch-once'
end
if row.state == 'dispatched' then return 'uncertain' end
return 'blocked'
`;

export type PlanningV2LedgerConfigResult = { ok: true; value: UpstashRestConfig } | { ok: false };

/** Strict OFF-by-default DEV-only configuration; namespaced per DEV workbook. */
export function resolvePlanningV2LedgerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PlanningV2LedgerConfigResult {
  if (env.PLANNING_V2_DEV_LEDGER_ENABLED !== 'true' || env.VERCEL_ENV === 'production') {
    return { ok: false };
  }
  const target = resolveSpreadsheetTarget(env);
  if (
    !target.ok ||
    target.target !== 'dev' ||
    target.spreadsheetId.length < 10 ||
    (env.GOOGLE_SHEETS_PROD_ID?.trim() && env.GOOGLE_SHEETS_PROD_ID.trim() === target.spreadsheetId)
  ) {
    return { ok: false };
  }
  // The identifier is never persisted in clear text in Redis keys/logs.
  const scope = createHash('sha256').update(target.spreadsheetId).digest('hex').slice(0, 24);
  return resolveUpstashRestConfig(env, `vida2:planning-v2:dev:${scope}:dispatch-v1`);
}

export function validPlanningV2LedgerRecord(record: PlanningV2LedgerRecord): boolean {
  return (
    !!record &&
    typeof record === 'object' &&
    Object.keys(record).length === 3 &&
    Object.hasOwn(IDS, record.kind) &&
    typeof record.recordId === 'string' &&
    IDS[record.kind].test(record.recordId) &&
    typeof record.payloadDigest === 'string' &&
    SHA256.test(record.payloadDigest)
  );
}

/** Never accepts raw activities, journal, provider credentials or row payloads. */
export function createPlanningV2DispatchLedger(
  config: UpstashRestConfig,
  fetchImpl: UpstashRedisFetch = fetch,
): {
  transition: (
    operation: PlanningV2LedgerOperation,
    record: PlanningV2LedgerRecord,
  ) => Promise<PlanningV2LedgerStatus>;
} {
  if (
    !config.namespace.startsWith('vida2:planning-v2:dev:') ||
    !config.namespace.endsWith(':dispatch-v1')
  ) {
    throw new Error('planning-ledger-invalid-namespace');
  }
  return {
    async transition(operation, record) {
      if (
        (operation !== 'prepare' && operation !== 'dispatch') ||
        !validPlanningV2LedgerRecord(record)
      )
        return 'blocked';
      const recordHash = createHash('sha256')
        .update(`${record.kind}:${record.recordId}`)
        .digest('hex');
      const key = `${config.namespace}:id:${recordHash}`;
      try {
        const raw = await evalRedisScript(
          config,
          PLANNING_V2_DISPATCH_LUA,
          [key],
          [operation, record.payloadDigest],
          fetchImpl,
        );
        return typeof raw === 'string' && STATUS.has(raw as PlanningV2LedgerStatus)
          ? (raw as PlanningV2LedgerStatus)
          : 'unavailable';
      } catch {
        // Redis state might have changed before the HTTP error. Never dispatch
        // on this result and NEVER substitute an in-process memory fallback.
        return 'unavailable';
      }
    },
  };
}
