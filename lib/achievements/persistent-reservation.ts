/** Durable, fail-closed achievement create reservation. No Notion writes here.
 * Unlike expiring approval leases, this reservation has NO TTL. An unknown
 * response or crashed writer requires manual reconciliation; never auto-retry
 * against Notion. All writers must use the same Redis instance and namespace.
 */
import { createHash, randomUUID } from 'node:crypto';

import {
  evalRedisScript,
  resolveUpstashRestConfig,
  type UpstashRedisFetch,
  type UpstashRestConfig,
} from '@/lib/actions/upstash-rest';

const ID = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const KEY = /^[a-z0-9]+(?::[a-z0-9_-]+){2,6}$/;
const NAMESPACE = 'vida2:achievements:logros:reservation:v1';

type Env = Readonly<Record<string, string | undefined>>;

export type AchievementReservationConfig = Readonly<{
  redis: UpstashRestConfig;
  dataSourceId: string;
}>;

export type ReservationOutcome =
  | { status: 'reserved'; operationToken: string }
  | { status: 'blocked' }
  | { status: 'unavailable' };

export function resolveAchievementReservationConfig(
  env: Env = process.env,
): AchievementReservationConfig | null {
  // Independent from read-only Logros. Off by default, including Preview.
  if (env.ACHIEVEMENTS_V1_WRITE_ENABLED !== 'true') return null;
  const id = env.NOTION_ACHIEVEMENTS_DATA_SOURCE_ID?.trim();
  if (!id || !ID.test(id)) return null;
  const otherIds = [
    env.NOTION_TASKS_DATA_SOURCE_ID,
    env.NOTION_PROJECTS_DATA_SOURCE_ID,
    env.NOTION_AREAS_DATA_SOURCE_ID,
    env.NOTION_MILESTONES_DATA_SOURCE_ID,
  ];
  if (otherIds.some((other) => other?.trim().toLowerCase() === id.toLowerCase())) {
    return null;
  }
  const redis = resolveUpstashRestConfig(env, NAMESPACE);
  if (!redis.ok) return null;
  return { dataSourceId: id.toLowerCase(), redis: redis.value };
}

/** Atomic and permanent. Redis SET NX has no EX/PX, deliberately. */
export const ACHIEVEMENT_RESERVE_SCRIPT = `
local key = KEYS[1]
local token = ARGV[1]
local ok = redis.call('SET', key, token, 'NX')
if ok then return 'RESERVED' end
return 'BLOCKED'
`;

/** Never reveal event identities in Redis keys or client-facing responses. */
export function achievementReservationKey(dataSourceId: string, eventKey: string): string {
  if (!ID.test(dataSourceId) || !KEY.test(eventKey)) {
    throw new Error('achievement-reservation-invalid-identity');
  }
  const digest = createHash('sha256')
    .update(`achievement-v1:${dataSourceId.toLowerCase()}:${eventKey}`)
    .digest('hex');
  return `${NAMESPACE}:${digest}`;
}

/** A server-side primitive, not a writer or a source of user authorization.
 * The future trusted writer must authenticate owner intent and validate an
 * accepted outcome BEFORE requesting a reservation, then verify Notion.
 */
export function createAchievementReservationPort(
  config: AchievementReservationConfig,
  fetchImpl: UpstashRedisFetch = fetch,
): { reserve(eventKey: string): Promise<ReservationOutcome> } {
  return {
    async reserve(eventKey) {
      let key: string;
      try {
        key = achievementReservationKey(config.dataSourceId, eventKey);
      } catch {
        return { status: 'unavailable' };
      }
      const operationToken = randomUUID();
      try {
        const result = await evalRedisScript(
          config.redis,
          ACHIEVEMENT_RESERVE_SCRIPT,
          [key],
          [operationToken],
          fetchImpl,
        );
        if (result === 'RESERVED') return { status: 'reserved', operationToken };
        if (result === 'BLOCKED') return { status: 'blocked' };
      } catch {
        // Timeouts are uncertain: the reservation might already exist.
      }
      return { status: 'unavailable' };
    },
  };
}
