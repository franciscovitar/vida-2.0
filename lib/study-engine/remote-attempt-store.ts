import { createHash } from 'node:crypto';

import {
  evalRedisScript,
  executeRedisCommand,
  resolveUpstashEnvironment,
  resolveUpstashRestConfig,
  type UpstashRedisFetch,
  type UpstashRestConfig,
} from '@/lib/actions/upstash-rest';
import type { StudyAttemptEvent } from '@/lib/study-engine/attempt-store';

export type RemoteAttemptStatus = 'accepted' | 'duplicate' | 'conflict';

export interface RemoteAttemptAck {
  idempotencyKey: string;
  status: RemoteAttemptStatus;
}

export interface StudyRemoteAttemptStore {
  acceptAttempt(userId: string, attempt: StudyAttemptEvent): Promise<RemoteAttemptAck>;
  countAttempts(userId: string): Promise<number>;
}

export const STUDY_ENGINE_REMOTE_STORE_VERSION = 'v1';
export const STUDY_ATTEMPT_MAX_WIRE_CHARS = 32 * 1024;

const ACCEPT_ATTEMPT_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then
  if existing == ARGV[1] then
    redis.call('SADD', KEYS[2], KEYS[1])
    return 2
  end
  return -1
end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SADD', KEYS[2], KEYS[1])
return 1
`;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function digest(label: string, value: string): string {
  return createHash('sha256').update(`${label}:${value.trim()}`).digest('hex');
}

function userIndexKey(config: UpstashRestConfig, userId: string): string {
  return `${config.namespace}:user:${digest('study-user', userId)}:attempts`;
}

function attemptKey(config: UpstashRestConfig, userId: string, idempotencyKey: string): string {
  return `${config.namespace}:attempt:${digest(
    'study-attempt',
    `${userId}|${idempotencyKey}`,
  )}`;
}

function statusFromRedis(result: unknown): RemoteAttemptStatus {
  if (result === 1) return 'accepted';
  if (result === 2) return 'duplicate';
  if (result === -1) return 'conflict';
  throw new Error('study-attempt-store-unavailable');
}

export function createUpstashStudyAttemptStore(
  config: UpstashRestConfig,
  fetchImpl: UpstashRedisFetch = fetch,
): StudyRemoteAttemptStore {
  return {
    async acceptAttempt(userId, attempt) {
      const serialized = JSON.stringify(stableValue(attempt));
      if (serialized.length > STUDY_ATTEMPT_MAX_WIRE_CHARS) {
        throw new Error('study-attempt-oversize');
      }

      const result = await evalRedisScript(
        config,
        ACCEPT_ATTEMPT_SCRIPT,
        [attemptKey(config, userId, attempt.idempotencyKey), userIndexKey(config, userId)],
        [serialized],
        fetchImpl,
      );

      return {
        idempotencyKey: attempt.idempotencyKey,
        status: statusFromRedis(result),
      };
    },

    async countAttempts(userId) {
      const result = await executeRedisCommand(
        config,
        ['SCARD', userIndexKey(config, userId)],
        fetchImpl,
      );
      if (typeof result !== 'number' || !Number.isInteger(result) || result < 0) {
        throw new Error('study-attempt-store-unavailable');
      }
      return result;
    },
  };
}

export function createStudyRemoteAttemptStoreFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl: UpstashRedisFetch = fetch,
): StudyRemoteAttemptStore | null {
  const environment = resolveUpstashEnvironment(env);
  if (environment === 'unknown') return null;

  const config = resolveUpstashRestConfig(
    env,
    `vida2:study-engine:${environment}:${STUDY_ENGINE_REMOTE_STORE_VERSION}`,
  );
  if (!config.ok) return null;

  return createUpstashStudyAttemptStore(config.value, fetchImpl);
}
