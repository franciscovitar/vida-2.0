import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  WORLD_FEEDBACK_VALUES,
  WORLD_FEEDBACK_VERSION,
  loadWorldFeedbackWithPort,
  type WorldFeedbackRecord,
  type WorldFeedbackStorePort,
  upsertWorldFeedbackWithPort,
} from '@/lib/world/feedback';
import {
  createWorldFeedbackPostgresPort,
  ensureWorldFeedbackBriefRegistered,
  type WorldFeedbackSql,
} from '@/lib/world/feedback-postgres';
import type { WorldPublishedPiece } from '@/types/world-intelligence';

const PIECE = JSON.parse(
  readFileSync(
    join(process.cwd(), 'data/generated/world/pieces/que-es-entrelazamiento-cuantico.json'),
    'utf8',
  ),
) as WorldPublishedPiece;

function memoryPort(initial: WorldFeedbackRecord | null): WorldFeedbackStorePort & {
  writes: WorldFeedbackRecord[];
} {
  let current = initial ? { ...initial } : null;
  const writes: WorldFeedbackRecord[] = [];
  return {
    writes,
    async readCurrent() {
      return { ok: true, record: current ? { ...current } : null };
    },
    async upsert(record) {
      current = { ...record };
      writes.push({ ...record });
      return { ok: true };
    },
  };
}

function existing(feedback: WorldFeedbackRecord['feedback'] = 'USEFUL'): WorldFeedbackRecord {
  return {
    briefId: PIECE.briefId,
    feedback,
    updatedAt: '2026-10-04T12:00:00.000Z',
    feedbackVersion: WORLD_FEEDBACK_VERSION,
    conceptId: PIECE.conceptId ?? null,
    clusterId: null,
    primaryDomain: PIECE.primaryDomain,
  };
}

test('WF1. World feedback tiene exactamente seis valores cerrados', () => {
  assert.deepEqual(WORLD_FEEDBACK_VALUES, [
    'USEFUL',
    'ALREADY_KNEW',
    'TOO_BASIC',
    'TOO_DETAILED',
    'NOT_RELEVANT',
    'WANT_DEEPER',
  ]);
});

test('WF2. un retry idéntico es idempotente y no reescribe', async () => {
  const port = memoryPort(existing());
  const result = await upsertWorldFeedbackWithPort(
    { briefId: PIECE.briefId, feedback: 'USEFUL', operationId: 'op-replay' },
    PIECE,
    port,
    { now: new Date('2026-10-04T13:00:00.000Z') },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.replay, true);
  assert.equal(result.corrected, false);
  assert.equal(port.writes.length, 0);
});

test('WF3. una corrección reemplaza el valor y verifica read-back', async () => {
  const port = memoryPort(existing());
  const result = await upsertWorldFeedbackWithPort(
    { briefId: PIECE.briefId, feedback: 'WANT_DEEPER', operationId: 'op-correct' },
    PIECE,
    port,
    { now: new Date('2026-10-04T13:00:00.000Z') },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.corrected, true);
  assert.equal(result.record.feedback, 'WANT_DEEPER');
  assert.equal(port.writes.length, 1);
});

test('WF4. valor desconocido y brief ajeno fallan cerrado', async () => {
  const port = memoryPort(null);
  const invalid = await upsertWorldFeedbackWithPort(
    { briefId: PIECE.briefId, feedback: 'LIKE' as never, operationId: 'op-invalid' },
    PIECE,
    port,
  );
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.code, 'invalid-value');

  const other = await upsertWorldFeedbackWithPort(
    { briefId: 'OTHER-BRIEF', feedback: 'USEFUL', operationId: 'op-other' },
    PIECE,
    port,
  );
  assert.equal(other.ok, false);
  if (!other.ok) assert.equal(other.code, 'unknown-brief');
  assert.equal(port.writes.length, 0);
});

test('WF5. metadata inconsistente en store deshabilita lectura/escritura', async () => {
  const bad = existing();
  bad.primaryDomain = 'POLITICS_GEOPOLITICS';
  const port = memoryPort(bad);

  const snapshot = await loadWorldFeedbackWithPort(PIECE, port);
  assert.equal(snapshot.writable, false);
  assert.equal(snapshot.state, 'error');

  const result = await upsertWorldFeedbackWithPort(
    { briefId: PIECE.briefId, feedback: 'TOO_BASIC', operationId: 'op-metadata' },
    PIECE,
    port,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'metadata-mismatch');
});

test('WF6. store no configurado no rompe el artículo', async () => {
  const unavailable: WorldFeedbackStorePort = {
    async readCurrent() {
      return { ok: false, code: 'not-configured' };
    },
    async upsert() {
      return { ok: false, code: 'not-configured' };
    },
  };
  const snapshot = await loadWorldFeedbackWithPort(PIECE, unavailable);
  assert.equal(snapshot.writable, false);
  assert.equal(snapshot.state, 'unavailable');
  assert.match(snapshot.notice ?? '', /temporalmente/i);
});

test('WF7. acción exige sesión y resuelve metadata desde la pieza canónica', () => {
  const action = readFileSync(join(process.cwd(), 'app/actions/world-feedback.ts'), 'utf8');
  const component = readFileSync(join(process.cwd(), 'components/world/WorldFeedback.tsx'), 'utf8');
  const page = readFileSync(join(process.cwd(), 'app/(app)/world/pieza/[slug]/page.tsx'), 'utf8');

  assert.match(action, /verifySession/);
  assert.match(action, /getWorldPieceDataByBriefId/);
  assert.match(action, /ensureWorldFeedbackBriefRegistered/);
  assert.match(action, /isWorldFeedbackValue/);
  assert.ok(
    action.lastIndexOf('isWorldFeedbackValue') <
      action.lastIndexOf('ensureWorldFeedbackBriefRegistered'),
  );
  assert.ok(
    action.lastIndexOf('ensureWorldFeedbackBriefRegistered') <
      action.lastIndexOf('upsertWorldFeedbackWithPort'),
  );
  assert.doesNotMatch(action, /conceptId|primaryDomain|clusterId/);
  assert.match(component, /Útil/);
  assert.match(component, /Ya lo sabía/);
  assert.match(component, /Quiero profundizar/);
  assert.match(component, /No me interesa/);
  assert.match(component, /Muy básico/);
  assert.match(component, /Muy detallado/);
  assert.doesNotMatch(component, /textarea|contentEditable/i);
  assert.match(page, /getWorldPiecePageData/);
});

test('WF8. adapter PostgreSQL falla cerrado sin URL y no crea cliente', async () => {
  let factoryCalls = 0;
  const port = createWorldFeedbackPostgresPort({
    databaseUrl: () => null,
    sqlFactory: () => {
      factoryCalls += 1;
      throw new Error('sqlFactory should not run without a database URL');
    },
  });

  assert.deepEqual(await port.readCurrent(PIECE.briefId), {
    ok: false,
    code: 'not-configured',
  });
  assert.deepEqual(await port.upsert(existing()), {
    ok: false,
    code: 'not-configured',
  });
  assert.deepEqual(
    await ensureWorldFeedbackBriefRegistered(PIECE, {
      databaseUrl: () => null,
      sqlFactory: () => {
        factoryCalls += 1;
        throw new Error('sqlFactory should not run without a database URL');
      },
    }),
    { ok: false, code: 'not-configured' },
  );
  assert.equal(factoryCalls, 0);
});

test('WF8a. DATABASE_URL compartida se ignora si falta WORLD_DATABASE_URL', async () => {
  const originalWorldUrl = process.env.WORLD_DATABASE_URL;
  const originalDefaultUrl = process.env.DATABASE_URL;
  let factoryCalls = 0;

  try {
    delete process.env.WORLD_DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://shared.invalid/db';

    const port = createWorldFeedbackPostgresPort({
      sqlFactory: () => {
        factoryCalls += 1;
        throw new Error('sqlFactory must not use a shared DATABASE_URL');
      },
    });

    assert.deepEqual(await port.readCurrent(PIECE.briefId), {
      ok: false,
      code: 'not-configured',
    });
    assert.deepEqual(await port.upsert(existing()), {
      ok: false,
      code: 'not-configured',
    });
    assert.deepEqual(
      await ensureWorldFeedbackBriefRegistered(PIECE, {
        sqlFactory: () => {
          factoryCalls += 1;
          throw new Error('brief registration must not use a shared DATABASE_URL');
        },
      }),
      { ok: false, code: 'not-configured' },
    );
    assert.equal(factoryCalls, 0);
  } finally {
    if (originalWorldUrl === undefined) delete process.env.WORLD_DATABASE_URL;
    else process.env.WORLD_DATABASE_URL = originalWorldUrl;

    if (originalDefaultUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDefaultUrl;
  }
});

test('WF9. adapter PostgreSQL parametriza upsert y normaliza read-back', async () => {
  let stored: WorldFeedbackRecord | null = null;
  const observedQueries: string[] = [];

  const sql: WorldFeedbackSql = async (strings, ...values) => {
    const query = strings.join('?');
    observedQueries.push(query);

    if (/^\s*SELECT/.test(query)) {
      if (!stored) return [];
      return [
        {
          brief_id: stored.briefId,
          feedback: stored.feedback,
          feedback_version: stored.feedbackVersion,
          concept_id: stored.conceptId,
          cluster_id: stored.clusterId,
          primary_domain: stored.primaryDomain,
          updated_at: stored.updatedAt,
        },
      ];
    }

    if (/^\s*INSERT/.test(query)) {
      stored = {
        briefId: String(values[0]),
        feedback: values[1] as WorldFeedbackRecord['feedback'],
        feedbackVersion: WORLD_FEEDBACK_VERSION,
        conceptId: values[3] === null ? null : String(values[3]),
        clusterId: values[4] === null ? null : String(values[4]),
        primaryDomain: values[5] as WorldFeedbackRecord['primaryDomain'],
        updatedAt: String(values[6]),
      };
      return [];
    }

    throw new Error('unexpected query');
  };

  const port = createWorldFeedbackPostgresPort({
    databaseUrl: () => 'postgresql://world-isolated.invalid/db',
    sqlFactory: () => sql,
  });

  const record = existing('WANT_DEEPER');
  record.updatedAt = '2026-10-04T15:00:00.000Z';

  assert.deepEqual(await port.upsert(record), { ok: true });
  const read = await port.readCurrent(record.briefId);
  assert.equal(read.ok, true);
  if (!read.ok) return;
  assert.deepEqual(read.record, record);
  assert.ok(observedQueries.some((query) => /ON CONFLICT \(brief_id\)/.test(query)));
  assert.ok(observedQueries.every((query) => !query.includes(record.briefId)));
});

test('WF9a. un brief publicado nuevo se registra con metadata mínima e idempotente', async () => {
  let registered: Record<string, unknown> | null = null;
  const observedQueries: string[] = [];

  const sql: WorldFeedbackSql = async (strings, ...values) => {
    const query = strings.join('?');
    observedQueries.push(query);

    if (/^\s*INSERT INTO world_intelligence\.brief/.test(query)) {
      if (!registered) {
        registered = {
          id: values[0],
          type: values[1],
          concept_id: values[2],
          slug: values[3],
          primary_domain: values[4],
          domains: values[5],
          headline: values[6],
          deck: values[7],
          reading_seconds: values[9],
        };
      }
      return [];
    }

    if (/^\s*SELECT[\s\S]*FROM world_intelligence\.brief/.test(query)) {
      return registered ? [registered] : [];
    }

    throw new Error('unexpected query');
  };

  const options = {
    databaseUrl: () => 'postgresql://world-isolated.invalid/db',
    sqlFactory: () => sql,
  };

  assert.deepEqual(await ensureWorldFeedbackBriefRegistered(PIECE, options), { ok: true });
  assert.deepEqual(await ensureWorldFeedbackBriefRegistered(PIECE, options), { ok: true });
  assert.ok(observedQueries.some((query) => /ON CONFLICT \(id\) DO NOTHING/.test(query)));
  assert.ok(observedQueries.some((query) => /'PUBLISHABLE'/.test(query)));
  assert.ok(observedQueries.every((query) => !query.includes(PIECE.briefId)));
  assert.ok(observedQueries.every((query) => !query.includes(PIECE.headline)));
});

test('WF9b. un brief preexistente con metadata conflictiva falla cerrado', async () => {
  const sql: WorldFeedbackSql = async (strings) => {
    const query = strings.join('?');

    if (/^\s*INSERT INTO world_intelligence\.brief/.test(query)) return [];
    if (/^\s*SELECT[\s\S]*FROM world_intelligence\.brief/.test(query)) {
      return [
        {
          id: PIECE.briefId,
          type: 'LEARN_PIECE',
          concept_id: PIECE.conceptId ?? null,
          slug: 'metadata-conflict',
          primary_domain: PIECE.primaryDomain,
          domains: [PIECE.primaryDomain, ...PIECE.secondaryDomains],
          headline: PIECE.headline,
          deck: PIECE.deck,
          reading_seconds: PIECE.readingSeconds,
        },
      ];
    }

    throw new Error('unexpected query');
  };

  assert.deepEqual(
    await ensureWorldFeedbackBriefRegistered(PIECE, {
      databaseUrl: () => 'postgresql://world-isolated.invalid/db',
      sqlFactory: () => sql,
    }),
    { ok: false, code: 'metadata-mismatch' },
  );
});

test('WF10. adapter PostgreSQL no filtra errores ni acepta filas inválidas', async () => {
  const permissionPort = createWorldFeedbackPostgresPort({
    databaseUrl: () => 'postgresql://world-isolated.invalid/db',
    sqlFactory: () => async () => {
      const error = new Error('provider detail');
      Object.assign(error, { code: '42501' });
      throw error;
    },
  });
  assert.deepEqual(await permissionPort.readCurrent(PIECE.briefId), {
    ok: false,
    code: 'permission-error',
  });

  const invalidRowPort = createWorldFeedbackPostgresPort({
    databaseUrl: () => 'postgresql://world-isolated.invalid/db',
    sqlFactory: () => async () => [
      {
        brief_id: PIECE.briefId,
        feedback: 'USEFUL',
        feedback_version: WORLD_FEEDBACK_VERSION,
        concept_id: PIECE.conceptId ?? null,
        cluster_id: null,
        primary_domain: 'NOT_A_DOMAIN',
        updated_at: '2026-10-04T15:00:00.000Z',
      },
    ],
  });
  assert.deepEqual(await invalidRowPort.readCurrent(PIECE.briefId), {
    ok: false,
    code: 'read-error',
  });
});
