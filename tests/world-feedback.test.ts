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
import type { WorldPublishedPiece } from '@/types/world-intelligence';

const PIECE = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      'data/generated/world/pieces/que-es-entrelazamiento-cuantico.json',
    ),
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
  const component = readFileSync(
    join(process.cwd(), 'components/world/WorldFeedback.tsx'),
    'utf8',
  );
  const page = readFileSync(
    join(process.cwd(), 'app/(app)/world/pieza/[slug]/page.tsx'),
    'utf8',
  );

  assert.match(action, /verifySession/);
  assert.match(action, /getWorldPieceDataByBriefId/);
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
