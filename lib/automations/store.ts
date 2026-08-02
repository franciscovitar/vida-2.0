import { createHash, randomBytes } from 'node:crypto';

import {
  decryptProposalPayload,
  encryptProposalPayload,
  validateEncryptionKey,
  type EncryptedProposalEnvelope,
} from '@/lib/actions/encryption';
import {
  evalRedisScript,
  executeRedisCommand,
  normalizeUpstashUrl,
  type UpstashRedisFetch,
  type UpstashRestConfig,
} from '@/lib/actions/upstash-rest';
import {
  getAutomationPrincipalContract,
  getAutomationWorkflowContract,
  isAutomationPrincipalKey,
} from '@/lib/automations/contracts';
import {
  AUTOMATION_RESULT_CODES,
  AUTOMATION_RUN_STATUSES,
  AUTOMATION_TRIGGERS,
  AUTOMATION_WORKFLOW_KEYS,
  type AutomationArtifact,
  type AutomationPrincipalKey,
  type AutomationRunRecord,
  type AutomationWorkflowControl,
  type AutomationWorkflowKey,
} from '@/types/automations';

const RUN_PLAINTEXT_MAX_CHARS = 12 * 1024;
const ARTIFACT_PLAINTEXT_MAX_CHARS = 24 * 1024;
const CONTROL_PLAINTEXT_MAX_CHARS = 2 * 1024;
const ENVELOPE_MAX_CHARS = 40 * 1024;
const NAMESPACE_PATTERN = /^vida2:automations:[a-z0-9:_-]{1,80}$/;
const OPAQUE_KEY_PATTERN = /^(?:run|artifact)_[A-Za-z0-9_-]{20,80}$/;
const IDEMPOTENCY_MAX_CHARS = 160;
const CONTROL_TTL_SECONDS = 30 * 24 * 60 * 60;

type ReserveResult =
  { status: 'reserved' } | { status: 'replay'; runKey: string } | { status: 'conflict' };
type LeaseResult = { status: 'acquired'; token: string } | { status: 'busy' };

export interface AutomationStateStore {
  reserveIdempotency(input: {
    workflowKey: AutomationWorkflowKey;
    idempotencyKey: string;
    runKey: string;
    payloadDigest?: string;
    ttlSeconds: number;
  }): Promise<ReserveResult>;
  acquireWorkflowLease(
    workflowKey: AutomationWorkflowKey,
    ttlSeconds: number,
    ownerKey?: string,
    principalKey?: AutomationPrincipalKey,
  ): Promise<LeaseResult>;
  releaseWorkflowLease(
    workflowKey: AutomationWorkflowKey,
    token: string,
    principalKey?: AutomationPrincipalKey,
  ): Promise<void>;
  releaseWorkflowLeaseForRun(
    workflowKey: AutomationWorkflowKey,
    runKey: string,
    principalKey?: AutomationPrincipalKey,
  ): Promise<void>;
  acquireRunLease(runKey: string, ttlSeconds: number): Promise<LeaseResult>;
  releaseRunLease(runKey: string, token: string): Promise<void>;
  putRun(run: AutomationRunRecord, ttlSeconds: number): Promise<void>;
  getRun(runKey: string): Promise<AutomationRunRecord | null>;
  listRuns(input?: {
    workflowKey?: AutomationWorkflowKey;
    limit?: number;
    offset?: number;
  }): Promise<readonly AutomationRunRecord[]>;
  putArtifact(artifact: AutomationArtifact, ttlSeconds: number): Promise<void>;
  getArtifact(artifactKey: string): Promise<AutomationArtifact | null>;
  getWorkflowControl(workflowKey: AutomationWorkflowKey): Promise<AutomationWorkflowControl | null>;
  putWorkflowControl(control: AutomationWorkflowControl): Promise<void>;
}

export type AutomationStoreConfig = UpstashRestConfig & { encryptionKey: Buffer };
export type AutomationStoreConfigResult =
  | { ok: true; value: AutomationStoreConfig }
  | { ok: false; reason: 'missing-store' | 'invalid-store' | 'invalid-encryption-key' };

function hashKey(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\n'), 'utf8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
  );
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function isBounded(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isNullableBounded(value: unknown, max: number): value is string | null {
  return value === null || isBounded(value, max);
}

function isWorkflowKey(value: unknown): value is AutomationWorkflowKey {
  return (
    typeof value === 'string' && (AUTOMATION_WORKFLOW_KEYS as readonly string[]).includes(value)
  );
}

function parseRun(value: unknown): AutomationRunRecord | null {
  if (!isRecord(value)) return null;
  const keys = [
    'runKey',
    'workflowKey',
    'principalKey',
    'principalId',
    'trigger',
    'status',
    'attempt',
    'idempotencyKey',
    'startedAt',
    'finishedAt',
    'durationMs',
    'resultCode',
    'summary',
    'proposalKey',
    'artifactKey',
    'createdAt',
    'updatedAt',
    'expiresAt',
  ];
  if (!hasExactKeys(value, keys)) return null;
  if (typeof value.runKey !== 'string' || !OPAQUE_KEY_PATTERN.test(value.runKey)) return null;
  if (!isWorkflowKey(value.workflowKey)) return null;
  if (typeof value.principalKey !== 'string' || !isAutomationPrincipalKey(value.principalKey))
    return null;
  const principal = getAutomationPrincipalContract(value.principalKey);
  if (principal.workflowKey !== value.workflowKey || principal.principalId !== value.principalId)
    return null;
  if (!(AUTOMATION_TRIGGERS as readonly unknown[]).includes(value.trigger)) return null;
  if (!(AUTOMATION_RUN_STATUSES as readonly unknown[]).includes(value.status)) return null;
  if (
    !Number.isInteger(value.attempt) ||
    (value.attempt as number) < 1 ||
    (value.attempt as number) > 3
  )
    return null;
  if (!isBounded(value.idempotencyKey, IDEMPOTENCY_MAX_CHARS)) return null;
  if (value.startedAt !== null && !isIso(value.startedAt)) return null;
  if (value.finishedAt !== null && !isIso(value.finishedAt)) return null;
  if (
    value.durationMs !== null &&
    (!Number.isInteger(value.durationMs) ||
      (value.durationMs as number) < 0 ||
      (value.durationMs as number) > 900_000)
  )
    return null;
  if (
    value.resultCode !== null &&
    !(AUTOMATION_RESULT_CODES as readonly unknown[]).includes(value.resultCode)
  )
    return null;
  if (!isNullableBounded(value.summary, 500)) return null;
  if (!isNullableBounded(value.proposalKey, 160) || !isNullableBounded(value.artifactKey, 100))
    return null;
  if (!isIso(value.createdAt) || !isIso(value.updatedAt) || !isIso(value.expiresAt)) return null;
  return value as unknown as AutomationRunRecord;
}

function parseArtifact(value: unknown): AutomationArtifact | null {
  if (!isRecord(value)) return null;
  const keys = [
    'artifactKey',
    'runKey',
    'workflowKey',
    'principalKey',
    'kind',
    'title',
    'summary',
    'items',
    'proposalKey',
    'createdAt',
    'expiresAt',
  ];
  if (!hasExactKeys(value, keys)) return null;
  if (typeof value.artifactKey !== 'string' || !OPAQUE_KEY_PATTERN.test(value.artifactKey))
    return null;
  if (typeof value.runKey !== 'string' || !OPAQUE_KEY_PATTERN.test(value.runKey)) return null;
  if (
    !isWorkflowKey(value.workflowKey) ||
    typeof value.principalKey !== 'string' ||
    !isAutomationPrincipalKey(value.principalKey)
  )
    return null;
  const principal = getAutomationPrincipalContract(value.principalKey);
  if (principal.workflowKey !== value.workflowKey) return null;
  if (getAutomationWorkflowContract(value.workflowKey).outputKind !== value.kind) return null;
  if (!isBounded(value.title, 120) || !isBounded(value.summary, 500)) return null;
  if (!Array.isArray(value.items) || value.items.length > 20) return null;
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ['label', 'value']) ||
      !isBounded(item.label, 80) ||
      !isBounded(item.value, 240)
    )
      return null;
  }
  if (
    !isNullableBounded(value.proposalKey, 160) ||
    !isIso(value.createdAt) ||
    !isIso(value.expiresAt)
  )
    return null;
  return value as unknown as AutomationArtifact;
}

function parseControl(value: unknown): AutomationWorkflowControl | null {
  if (!isRecord(value) || !hasExactKeys(value, ['workflowKey', 'paused', 'circuit', 'updatedAt']))
    return null;
  if (
    !isWorkflowKey(value.workflowKey) ||
    typeof value.paused !== 'boolean' ||
    !isIso(value.updatedAt)
  )
    return null;
  if (
    !isRecord(value.circuit) ||
    !hasExactKeys(value.circuit, ['mode', 'consecutiveFailures', 'openedAt'])
  )
    return null;
  if (!['closed', 'open', 'half-open'].includes(String(value.circuit.mode))) return null;
  if (
    !Number.isInteger(value.circuit.consecutiveFailures) ||
    (value.circuit.consecutiveFailures as number) < 0 ||
    (value.circuit.consecutiveFailures as number) > 20
  )
    return null;
  if (value.circuit.openedAt !== null && !isIso(value.circuit.openedAt)) return null;
  return value as unknown as AutomationWorkflowControl;
}

function encryptJson(key: Buffer, value: unknown, maxChars: number): string {
  const plaintext = JSON.stringify(value);
  if (plaintext.length > maxChars) throw new Error('automation-state-oversize');
  const serialized = JSON.stringify(encryptProposalPayload(key, plaintext));
  if (serialized.length > ENVELOPE_MAX_CHARS) throw new Error('automation-envelope-oversize');
  return serialized;
}

function decryptJson<T>(
  key: Buffer,
  raw: unknown,
  maxChars: number,
  parser: (value: unknown) => T | null,
): T | null {
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > ENVELOPE_MAX_CHARS) return null;
  try {
    const envelope = JSON.parse(raw) as EncryptedProposalEnvelope;
    if (
      !isRecord(envelope) ||
      !hasExactKeys(envelope, ['v', 'nonce', 'ciphertext', 'tag']) ||
      envelope.v !== 1
    )
      return null;
    const plaintext = decryptProposalPayload(key, envelope);
    if (plaintext.length > maxChars) return null;
    return parser(JSON.parse(plaintext) as unknown);
  } catch {
    return null;
  }
}

export function resolveAutomationStoreConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AutomationStoreConfigResult {
  const rawUrl = env.AUTOMATIONS_UPSTASH_REDIS_REST_URL ?? '';
  const rawToken = env.AUTOMATIONS_UPSTASH_REDIS_REST_TOKEN ?? '';
  const rawNamespace = env.AUTOMATIONS_STATE_NAMESPACE ?? '';
  const key = validateEncryptionKey(env.AUTOMATIONS_STATE_ENCRYPTION_KEY);
  if (!rawUrl && !rawToken && !rawNamespace && !env.AUTOMATIONS_STATE_ENCRYPTION_KEY)
    return { ok: false, reason: 'missing-store' };
  if (!key) return { ok: false, reason: 'invalid-encryption-key' };
  const url = normalizeUpstashUrl(rawUrl);
  const token = rawToken.trim();
  const namespace = rawNamespace.trim();
  const sharedUrl = normalizeUpstashUrl(env.UPSTASH_REDIS_REST_URL ?? '');
  const sharedToken = (env.UPSTASH_REDIS_REST_TOKEN ?? '').trim();
  if (
    !url ||
    token !== rawToken ||
    token.length < 16 ||
    /\s/.test(token) ||
    !NAMESPACE_PATTERN.test(namespace) ||
    (sharedUrl !== null && sharedUrl === url) ||
    (sharedToken.length > 0 && sharedToken === token)
  )
    return { ok: false, reason: 'invalid-store' };
  return { ok: true, value: { url, token, namespace, timeoutMs: 3_000, encryptionKey: key } };
}

export function createOpaqueAutomationKey(kind: 'run' | 'artifact'): string {
  return `${kind}_${randomBytes(24).toString('base64url')}`;
}

export function createMemoryAutomationStateStore(
  now: () => number = Date.now,
): AutomationStateStore & { rawSnapshot(): string } {
  const runs = new Map<string, { value: AutomationRunRecord; expiresAt: number }>();
  const artifacts = new Map<string, { value: AutomationArtifact; expiresAt: number }>();
  const idempotency = new Map<
    string,
    { runKey: string; payloadDigest: string | null; expiresAt: number }
  >();
  const leases = new Map<string, { token: string; expiresAt: number }>();
  const runLeases = new Map<string, { token: string; expiresAt: number }>();
  const controls = new Map<AutomationWorkflowKey, AutomationWorkflowControl>();
  const purge = () => {
    for (const [key, row] of runs) if (row.expiresAt <= now()) runs.delete(key);
    for (const [key, row] of artifacts) if (row.expiresAt <= now()) artifacts.delete(key);
    for (const [key, row] of idempotency) if (row.expiresAt <= now()) idempotency.delete(key);
    for (const [key, row] of leases) if (row.expiresAt <= now()) leases.delete(key);
    for (const [key, row] of runLeases) if (row.expiresAt <= now()) runLeases.delete(key);
  };
  return {
    rawSnapshot: () => JSON.stringify({ runs: [...runs.keys()], artifacts: [...artifacts.keys()] }),
    async reserveIdempotency(input) {
      purge();
      const key = hashKey([input.workflowKey, input.idempotencyKey]);
      const current = idempotency.get(key);
      if (current) {
        if (current.payloadDigest !== (input.payloadDigest ?? null)) return { status: 'conflict' };
        return { status: 'replay', runKey: current.runKey };
      }
      idempotency.set(key, {
        runKey: input.runKey,
        payloadDigest: input.payloadDigest ?? null,
        expiresAt: now() + Math.max(1, input.ttlSeconds) * 1000,
      });
      return { status: 'reserved' };
    },
    async acquireWorkflowLease(workflowKey, ttlSeconds, ownerKey, principalKey) {
      purge();
      const leaseKey = principalKey ? `${workflowKey}:${principalKey}` : workflowKey;
      if (leases.has(leaseKey)) return { status: 'busy' };
      const token = ownerKey
        ? hashKey(['workflow-lease-owner', ownerKey])
        : randomBytes(24).toString('base64url');
      leases.set(leaseKey, { token, expiresAt: now() + Math.max(1, ttlSeconds) * 1000 });
      return { status: 'acquired', token };
    },
    async releaseWorkflowLease(workflowKey, token, principalKey) {
      const leaseKey = principalKey ? `${workflowKey}:${principalKey}` : workflowKey;
      if (leases.get(leaseKey)?.token === token) leases.delete(leaseKey);
    },
    async releaseWorkflowLeaseForRun(workflowKey, runKey, principalKey) {
      const leaseKey = principalKey ? `${workflowKey}:${principalKey}` : workflowKey;
      const token = hashKey(['workflow-lease-owner', runKey]);
      if (leases.get(leaseKey)?.token === token) leases.delete(leaseKey);
    },
    async acquireRunLease(runKey, ttlSeconds) {
      purge();
      const key = hashKey(['run-lease', runKey]);
      if (runLeases.has(key)) return { status: 'busy' };
      const token = randomBytes(24).toString('base64url');
      runLeases.set(key, { token, expiresAt: now() + Math.max(1, ttlSeconds) * 1000 });
      return { status: 'acquired', token };
    },
    async releaseRunLease(runKey, token) {
      const key = hashKey(['run-lease', runKey]);
      if (runLeases.get(key)?.token === token) runLeases.delete(key);
    },
    async putRun(run, ttlSeconds) {
      if (!parseRun(run)) throw new Error('automation-run-invalid');
      runs.set(run.runKey, {
        value: structuredClone(run),
        expiresAt: now() + Math.max(1, ttlSeconds) * 1000,
      });
    },
    async getRun(runKey) {
      purge();
      return structuredClone(runs.get(runKey)?.value ?? null);
    },
    async listRuns(input = {}) {
      purge();
      return [...runs.values()]
        .map((row) => row.value)
        .filter((run) => !input.workflowKey || run.workflowKey === input.workflowKey)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(
          Math.max(0, input.offset ?? 0),
          Math.max(0, input.offset ?? 0) + Math.min(50, Math.max(1, input.limit ?? 20)),
        )
        .map((run) => structuredClone(run));
    },
    async putArtifact(artifact, ttlSeconds) {
      if (!parseArtifact(artifact)) throw new Error('automation-artifact-invalid');
      artifacts.set(artifact.artifactKey, {
        value: structuredClone(artifact),
        expiresAt: now() + Math.max(1, ttlSeconds) * 1000,
      });
    },
    async getArtifact(artifactKey) {
      purge();
      return structuredClone(artifacts.get(artifactKey)?.value ?? null);
    },
    async getWorkflowControl(workflowKey) {
      return structuredClone(controls.get(workflowKey) ?? null);
    },
    async putWorkflowControl(control) {
      if (!parseControl(control)) throw new Error('automation-control-invalid');
      controls.set(control.workflowKey, structuredClone(control));
    },
  };
}

function redisKey(config: AutomationStoreConfig, kind: string, opaque: string): string {
  return `${config.namespace}:${kind}:${hashKey([kind, opaque])}`;
}

const RELEASE_LEASE_SCRIPT = `
local key = KEYS[1]
local token = ARGV[1]
if redis.call('GET', key) == token then
  return redis.call('DEL', key)
end
return 0
`;

export function createUpstashAutomationStateStore(
  config: AutomationStoreConfig,
  fetchImpl: UpstashRedisFetch = fetch,
): AutomationStateStore {
  const command = (parts: readonly (string | number)[]) =>
    executeRedisCommand(config, parts, fetchImpl);
  return {
    async reserveIdempotency(input) {
      if (
        !isBounded(input.idempotencyKey, IDEMPOTENCY_MAX_CHARS) ||
        !OPAQUE_KEY_PATTERN.test(input.runKey)
      )
        throw new Error('automation-idempotency-invalid');
      const key = redisKey(config, 'idemp', `${input.workflowKey}:${input.idempotencyKey}`);
      const value = encryptJson(
        config.encryptionKey,
        { runKey: input.runKey, payloadDigest: input.payloadDigest ?? null },
        384,
      );
      const result = await command(['SET', key, value, 'NX', 'EX', Math.max(1, input.ttlSeconds)]);
      if (result === 'OK') return { status: 'reserved' };
      const existing = decryptJson(
        config.encryptionKey,
        await command(['GET', key]),
        384,
        (candidate) => {
          if (!isRecord(candidate)) return null;
          const legacy = hasExactKeys(candidate, ['runKey']);
          const current = hasExactKeys(candidate, ['runKey', 'payloadDigest']);
          if (
            (!legacy && !current) ||
            typeof candidate.runKey !== 'string' ||
            !OPAQUE_KEY_PATTERN.test(candidate.runKey) ||
            (current &&
              candidate.payloadDigest !== null &&
              typeof candidate.payloadDigest !== 'string')
          )
            return null;
          return {
            runKey: candidate.runKey,
            payloadDigest: current ? (candidate.payloadDigest as string | null) : null,
          };
        },
      );
      if (!existing) throw new Error('automation-idempotency-corrupt');
      if (existing.payloadDigest !== (input.payloadDigest ?? null)) return { status: 'conflict' };
      return { status: 'replay', runKey: existing.runKey };
    },
    async acquireWorkflowLease(workflowKey, ttlSeconds, ownerKey, principalKey) {
      const key = redisKey(
        config,
        'lease',
        principalKey ? `${workflowKey}:${principalKey}` : workflowKey,
      );
      const token = ownerKey
        ? hashKey(['workflow-lease-owner', ownerKey])
        : randomBytes(24).toString('base64url');
      const result = await command(['SET', key, token, 'NX', 'EX', Math.max(1, ttlSeconds)]);
      return result === 'OK' ? { status: 'acquired', token } : { status: 'busy' };
    },
    async releaseWorkflowLease(workflowKey, token, principalKey) {
      const key = redisKey(
        config,
        'lease',
        principalKey ? `${workflowKey}:${principalKey}` : workflowKey,
      );
      await evalRedisScript(config, RELEASE_LEASE_SCRIPT, [key], [token], fetchImpl);
    },
    async releaseWorkflowLeaseForRun(workflowKey, runKey, principalKey) {
      if (!OPAQUE_KEY_PATTERN.test(runKey)) return;
      const key = redisKey(
        config,
        'lease',
        principalKey ? `${workflowKey}:${principalKey}` : workflowKey,
      );
      const token = hashKey(['workflow-lease-owner', runKey]);
      await evalRedisScript(config, RELEASE_LEASE_SCRIPT, [key], [token], fetchImpl);
    },
    async acquireRunLease(runKey, ttlSeconds) {
      if (!OPAQUE_KEY_PATTERN.test(runKey)) return { status: 'busy' };
      const key = redisKey(config, 'run-lease', runKey);
      const token = randomBytes(24).toString('base64url');
      const result = await command(['SET', key, token, 'NX', 'EX', Math.max(1, ttlSeconds)]);
      return result === 'OK' ? { status: 'acquired', token } : { status: 'busy' };
    },
    async releaseRunLease(runKey, token) {
      if (!OPAQUE_KEY_PATTERN.test(runKey)) return;
      const key = redisKey(config, 'run-lease', runKey);
      await evalRedisScript(config, RELEASE_LEASE_SCRIPT, [key], [token], fetchImpl);
    },
    async putRun(run, ttlSeconds) {
      if (!parseRun(run)) throw new Error('automation-run-invalid');
      const ttl = Math.max(1, ttlSeconds);
      await command([
        'SET',
        redisKey(config, 'run', run.runKey),
        encryptJson(config.encryptionKey, run, RUN_PLAINTEXT_MAX_CHARS),
        'EX',
        ttl,
      ]);
      const index = `${config.namespace}:index:${run.workflowKey}`;
      const global = `${config.namespace}:index:all`;
      const indexMember = hashKey(['index-member', run.runKey]);
      await command([
        'SET',
        redisKey(config, 'index-entry', indexMember),
        encryptJson(config.encryptionKey, { runKey: run.runKey }, 256),
        'EX',
        ttl,
      ]);
      await command(['ZADD', index, Date.parse(run.createdAt), indexMember]);
      await command(['EXPIRE', index, ttl]);
      await command(['ZADD', global, Date.parse(run.createdAt), indexMember]);
      await command(['EXPIRE', global, ttl]);
    },
    async getRun(runKey) {
      if (!OPAQUE_KEY_PATTERN.test(runKey)) return null;
      return decryptJson(
        config.encryptionKey,
        await command(['GET', redisKey(config, 'run', runKey)]),
        RUN_PLAINTEXT_MAX_CHARS,
        parseRun,
      );
    },
    async listRuns(input = {}) {
      const limit = Math.min(50, Math.max(1, input.limit ?? 20));
      const offset = Math.max(0, input.offset ?? 0);
      const index = `${config.namespace}:index:${input.workflowKey ?? 'all'}`;
      const raw = await command(['ZREVRANGE', index, offset, offset + limit - 1]);
      if (!Array.isArray(raw)) return [];
      const members = raw
        .filter((item): item is string => typeof item === 'string' && /^[0-9a-f]{64}$/.test(item))
        .slice(0, limit);
      const keys = await Promise.all(
        members.map(async (member) =>
          decryptJson(
            config.encryptionKey,
            await command(['GET', redisKey(config, 'index-entry', member)]),
            256,
            (candidate) => {
              if (
                !isRecord(candidate) ||
                !hasExactKeys(candidate, ['runKey']) ||
                typeof candidate.runKey !== 'string' ||
                !OPAQUE_KEY_PATTERN.test(candidate.runKey)
              )
                return null;
              return candidate.runKey;
            },
          ),
        ),
      );
      const records = await Promise.all(
        keys.filter((key): key is string => key !== null).map((key) => this.getRun(key)),
      );
      return records.filter((item): item is AutomationRunRecord => item !== null);
    },
    async putArtifact(artifact, ttlSeconds) {
      if (!parseArtifact(artifact)) throw new Error('automation-artifact-invalid');
      await command([
        'SET',
        redisKey(config, 'artifact', artifact.artifactKey),
        encryptJson(config.encryptionKey, artifact, ARTIFACT_PLAINTEXT_MAX_CHARS),
        'EX',
        Math.max(1, ttlSeconds),
      ]);
    },
    async getArtifact(artifactKey) {
      if (!OPAQUE_KEY_PATTERN.test(artifactKey)) return null;
      return decryptJson(
        config.encryptionKey,
        await command(['GET', redisKey(config, 'artifact', artifactKey)]),
        ARTIFACT_PLAINTEXT_MAX_CHARS,
        parseArtifact,
      );
    },
    async getWorkflowControl(workflowKey) {
      return decryptJson(
        config.encryptionKey,
        await command(['GET', redisKey(config, 'control', workflowKey)]),
        CONTROL_PLAINTEXT_MAX_CHARS,
        parseControl,
      );
    },
    async putWorkflowControl(control) {
      if (!parseControl(control)) throw new Error('automation-control-invalid');
      await command([
        'SET',
        redisKey(config, 'control', control.workflowKey),
        encryptJson(config.encryptionKey, control, CONTROL_PLAINTEXT_MAX_CHARS),
        'EX',
        CONTROL_TTL_SECONDS,
      ]);
    },
  };
}

export function buildAutomationStateStore(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl: UpstashRedisFetch = fetch,
): AutomationStateStore | null {
  const config = resolveAutomationStoreConfig(env);
  return config.ok ? createUpstashAutomationStateStore(config.value, fetchImpl) : null;
}
