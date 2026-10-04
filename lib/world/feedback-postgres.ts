import { neon } from '@neondatabase/serverless';

import { WORLD_DOMAINS } from '@/lib/world/contract';
import {
  WORLD_FEEDBACK_VERSION,
  isWorldFeedbackValue,
  type WorldFeedbackRecord,
  type WorldFeedbackStoreFailureCode,
  type WorldFeedbackStorePort,
} from '@/lib/world/feedback';
import type { WorldDomain } from '@/types/world-intelligence';

export type WorldFeedbackSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

interface WorldFeedbackPostgresOptions {
  databaseUrl?: () => string | null;
  sqlFactory?: (databaseUrl: string) => WorldFeedbackSql;
}

const DOMAIN_SET = new Set<WorldDomain>(WORLD_DOMAINS.map((item) => item.id));

function configuredDatabaseUrl(): string | null {
  const worldSpecific = process.env.WORLD_DATABASE_URL?.trim();
  if (worldSpecific) return worldSpecific;

  const marketplaceDefault = process.env.DATABASE_URL?.trim();
  return marketplaceDefault || null;
}

function defaultSqlFactory(databaseUrl: string): WorldFeedbackSql {
  return neon(databaseUrl) as unknown as WorldFeedbackSql;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseWorldDomain(value: unknown): WorldDomain | null {
  return typeof value === 'string' && DOMAIN_SET.has(value as WorldDomain)
    ? (value as WorldDomain)
    : null;
}

function parseTimestamp(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== 'string') return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseFeedbackRow(value: unknown): WorldFeedbackRecord | null {
  if (!isRecord(value)) return null;

  const briefId = value.brief_id;
  const feedback = value.feedback;
  const feedbackVersion = value.feedback_version;
  const conceptId = value.concept_id;
  const clusterId = value.cluster_id;
  const primaryDomain = parseWorldDomain(value.primary_domain);
  const updatedAt = parseTimestamp(value.updated_at);

  if (
    typeof briefId !== 'string' ||
    !isWorldFeedbackValue(feedback) ||
    feedbackVersion !== WORLD_FEEDBACK_VERSION ||
    (conceptId !== null && typeof conceptId !== 'string') ||
    (clusterId !== null && typeof clusterId !== 'string') ||
    !primaryDomain ||
    !updatedAt
  ) {
    return null;
  }

  return {
    briefId,
    feedback,
    feedbackVersion: WORLD_FEEDBACK_VERSION,
    conceptId,
    clusterId,
    primaryDomain,
    updatedAt,
  };
}

function failureCode(
  error: unknown,
  fallback: 'read-error' | 'write-error',
): WorldFeedbackStoreFailureCode {
  if (isRecord(error) && typeof error.code === 'string') {
    if (['42501', '28000', '28P01'].includes(error.code)) return 'permission-error';
  }
  return fallback;
}

export function createWorldFeedbackPostgresPort(
  options: WorldFeedbackPostgresOptions = {},
): WorldFeedbackStorePort {
  const databaseUrl = options.databaseUrl ?? configuredDatabaseUrl;
  const sqlFactory = options.sqlFactory ?? defaultSqlFactory;

  let cachedUrl: string | null = null;
  let cachedSql: WorldFeedbackSql | null = null;

  function getSql(): WorldFeedbackSql | null {
    const url = databaseUrl();
    if (!url) return null;

    if (!cachedSql || cachedUrl !== url) {
      cachedSql = sqlFactory(url);
      cachedUrl = url;
    }
    return cachedSql;
  }

  return {
    async readCurrent(briefId) {
      const sql = getSql();
      if (!sql) return { ok: false, code: 'not-configured' };

      try {
        const rows = await sql`
          SELECT
            brief_id,
            feedback,
            feedback_version,
            concept_id,
            cluster_id,
            primary_domain,
            updated_at
          FROM world_intelligence.feedback
          WHERE brief_id = ${briefId}
          LIMIT 1
        `;

        if (rows.length === 0) return { ok: true, record: null };

        const record = parseFeedbackRow(rows[0]);
        return record ? { ok: true, record } : { ok: false, code: 'read-error' };
      } catch (error) {
        return { ok: false, code: failureCode(error, 'read-error') };
      }
    },

    async upsert(record) {
      const sql = getSql();
      if (!sql) return { ok: false, code: 'not-configured' };

      try {
        await sql`
          INSERT INTO world_intelligence.feedback (
            brief_id,
            feedback,
            feedback_version,
            concept_id,
            cluster_id,
            primary_domain,
            updated_at
          ) VALUES (
            ${record.briefId},
            ${record.feedback},
            ${record.feedbackVersion},
            ${record.conceptId},
            ${record.clusterId},
            ${record.primaryDomain},
            ${record.updatedAt}
          )
          ON CONFLICT (brief_id) DO UPDATE SET
            feedback = EXCLUDED.feedback,
            feedback_version = EXCLUDED.feedback_version,
            concept_id = EXCLUDED.concept_id,
            cluster_id = EXCLUDED.cluster_id,
            primary_domain = EXCLUDED.primary_domain,
            updated_at = EXCLUDED.updated_at
        `;
        return { ok: true };
      } catch (error) {
        return { ok: false, code: failureCode(error, 'write-error') };
      }
    },
  };
}
