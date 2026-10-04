import { neon } from '@neondatabase/serverless';

import { WORLD_DOMAINS } from '@/lib/world/contract';
import {
  WORLD_FEEDBACK_VERSION,
  isWorldFeedbackValue,
  type WorldFeedbackRecord,
  type WorldFeedbackStoreFailureCode,
  type WorldFeedbackStorePort,
} from '@/lib/world/feedback';
import type { WorldDomain, WorldPublishedPiece } from '@/types/world-intelligence';

export type WorldFeedbackSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

export interface WorldFeedbackPostgresOptions {
  databaseUrl?: () => string | null;
  sqlFactory?: (databaseUrl: string) => WorldFeedbackSql;
}

export type WorldBriefRegistrationResult =
  | { ok: true }
  | { ok: false; code: WorldFeedbackStoreFailureCode | 'metadata-mismatch' };

const DOMAIN_SET = new Set<WorldDomain>(WORLD_DOMAINS.map((item) => item.id));

function configuredDatabaseUrl(): string | null {
  const worldSpecific = process.env.WORLD_DATABASE_URL?.trim();
  return worldSpecific || null;
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

function worldBriefType(piece: WorldPublishedPiece): 'NOW_STORY' | 'LEARN_PIECE' {
  return piece.mode === 'NOW' ? 'NOW_STORY' : 'LEARN_PIECE';
}

function worldBriefFreshness(piece: WorldPublishedPiece): 'CURRENT' | 'EVERGREEN' {
  return piece.mode === 'NOW' ? 'CURRENT' : 'EVERGREEN';
}

function canonicalDomains(piece: WorldPublishedPiece): WorldDomain[] {
  return Array.from(new Set([piece.primaryDomain, ...piece.secondaryDomains]));
}

function registeredBriefMatchesPiece(
  row: Record<string, unknown>,
  piece: WorldPublishedPiece,
): boolean {
  const domains = row.domains;
  return (
    row.id === piece.briefId &&
    row.type === worldBriefType(piece) &&
    row.concept_id === (piece.conceptId ?? null) &&
    row.slug === piece.slug &&
    row.primary_domain === piece.primaryDomain &&
    Array.isArray(domains) &&
    domains.length === canonicalDomains(piece).length &&
    domains.every((domain, index) => domain === canonicalDomains(piece)[index]) &&
    row.headline === piece.headline &&
    row.deck === piece.deck &&
    Number(row.reading_seconds) === piece.readingSeconds
  );
}

/**
 * Registers only the metadata required for feedback's brief FK.
 *
 * The published Vida piece remains the source of truth. This helper never stores
 * editorial body text or evidence, never falls back to DATABASE_URL, and never
 * mutates an existing brief row. A conflicting existing row fails closed.
 */
export async function ensureWorldFeedbackBriefRegistered(
  piece: WorldPublishedPiece,
  options: WorldFeedbackPostgresOptions = {},
): Promise<WorldBriefRegistrationResult> {
  const databaseUrl = (options.databaseUrl ?? configuredDatabaseUrl)();
  if (!databaseUrl) return { ok: false, code: 'not-configured' };

  const sql = (options.sqlFactory ?? defaultSqlFactory)(databaseUrl);
  const domains = canonicalDomains(piece);

  try {
    await sql`
      INSERT INTO world_intelligence.brief (
        id,
        type,
        cluster_id,
        concept_id,
        slug,
        primary_domain,
        domains,
        headline,
        deck,
        body,
        evidence_state,
        reading_seconds,
        confidence,
        freshness,
        source_observation_cutoff,
        last_verified_at
      ) VALUES (
        ${piece.briefId},
        ${worldBriefType(piece)},
        NULL,
        ${piece.conceptId ?? null},
        ${piece.slug},
        ${piece.primaryDomain},
        ${domains}::text[],
        ${piece.headline},
        ${piece.deck},
        ${JSON.stringify({ storage: 'metadata-only' })}::jsonb,
        'PUBLISHABLE',
        ${piece.readingSeconds},
        NULL,
        ${worldBriefFreshness(piece)},
        ${piece.publishedAt}::timestamptz,
        ${piece.publishedAt}::timestamptz
      )
      ON CONFLICT (id) DO NOTHING
    `;

    const rows = await sql`
      SELECT
        id,
        type,
        concept_id,
        slug,
        primary_domain,
        domains,
        headline,
        deck,
        reading_seconds
      FROM world_intelligence.brief
      WHERE id = ${piece.briefId}
      LIMIT 1
    `;

    if (rows.length !== 1 || !registeredBriefMatchesPiece(rows[0], piece)) {
      return { ok: false, code: 'metadata-mismatch' };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, code: failureCode(error, 'write-error') };
  }
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
