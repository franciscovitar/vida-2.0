import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createStudyAttemptEvent, type StudyAttemptEvent } from '@/lib/study-engine/attempt-store';
import {
  FRESH_EVIDENCE_HEADERS,
  mapStudyAttemptToFreshEvidence,
  type LearningConceptMapping,
} from '@/lib/study-engine/fresh-evidence';
import {
  createLearningEvidenceBridge,
  getLearningEvidenceWriteConfig,
  type LearningSheetsValuesClient,
} from '@/lib/study-engine/learning-evidence-sheet';

const DSI_MAPPING: LearningConceptMapping = {
  conceptId: 'DSI.P2.MICRO.SYNC_ASYNC',
  subjectId: 'DSI',
  assessment: 'P2',
};

function fixture(overrides: Partial<StudyAttemptEvent> = {}): StudyAttemptEvent {
  return createStudyAttemptEvent({
    id: 'attempt-1',
    idempotencyKey: 'attempt-1',
    sessionId: 'session-1',
    studyItemId: 'dsi-sync-async-fresh-1',
    itemVersion: 1,
    reviewUnitId: 'dsi:p2:sync-async',
    subjectId: 'dsi',
    conceptId: 'DSI.P2.MICRO.SYNC_ASYNC',
    facetId: 'DSI.P2.MICRO.SYNC_ASYNC.FACET',
    variantFamily: 'sync-async-family',
    modeRole: 'bridge',
    interaction: 'bridge_microcase',
    evidenceCeiling: 'micro-application',
    operation: 'discriminate',
    channel: 'theoretical',
    shownAt: '2026-09-28T12:00:00.000Z',
    answeredAt: '2026-09-28T12:00:04.000Z',
    response: null,
    correctness: true,
    rating: 'good',
    learnerConfidence: null,
    helpLevel: 'independent',
    seenBefore: false,
    contextFreshness: 'fresh',
    schedulerStateBefore: null,
    schedulerStateAfter: null,
    deviceId: 'device-1',
    ...overrides,
  });
}

test('StudyAttempt maps to the exact 18-column FreshEvidence contract', () => {
  const mapped = mapStudyAttemptToFreshEvidence(fixture(), [DSI_MAPPING]);
  assert.equal(mapped.status, 'mapped');
  if (mapped.status !== 'mapped') return;

  assert.equal(mapped.row.length, FRESH_EVIDENCE_HEADERS.length);
  assert.deepEqual(mapped.row.slice(0, 7), [
    '2026-09-28T12:00:04.000Z',
    'DSI',
    'P2',
    'DSI.P2.MICRO.SYNC_ASYNC',
    'study-engine:session-1:dsi-sync-async-fresh-1',
    'study_engine',
    'discriminate',
  ]);
  assert.equal(mapped.row[8], true);
  assert.equal(mapped.row[9], false);
  assert.equal(mapped.row[10], true);
  assert.equal(mapped.row[17], 'study-engine:attempt-1');
  assert.equal(mapped.row[15], 'sync-async-family');
  assert.match(String(mapped.row[16]), /freshness=fresh/);
  assert.match(String(mapped.row[16]), /review_unit=dsi:p2:sync-async/);
  assert.match(String(mapped.row[16]), /facet_id=DSI.P2.MICRO.SYNC_ASYNC.FACET/);
  assert.match(String(mapped.row[16]), /mode_role=bridge/);
  assert.match(String(mapped.row[16]), /interaction=bridge_microcase/);
  assert.match(String(mapped.row[16]), /evidence_ceiling=micro-application/);
  assert.doesNotMatch(String(mapped.row[16]), /Tu respuesta|response=/);
});

test('familiar review stays familiar and never becomes fresh evidence by accident', () => {
  const mapped = mapStudyAttemptToFreshEvidence(
    fixture({ seenBefore: true, contextFreshness: 'familiar' }),
    [DSI_MAPPING],
  );
  assert.equal(mapped.status, 'mapped');
  if (mapped.status !== 'mapped') return;

  assert.equal(mapped.row[9], true);
  assert.match(String(mapped.row[16]), /freshness=familiar/);
  assert.doesNotMatch(String(mapped.row[16]), /freshness=fresh/);
});

test('failed recall weakens evidence and assisted work is not independent', () => {
  const mapped = mapStudyAttemptToFreshEvidence(
    fixture({
      correctness: false,
      rating: 'again',
      helpLevel: 'assisted',
    }),
    [DSI_MAPPING],
  );
  assert.equal(mapped.status, 'mapped');
  if (mapped.status !== 'mapped') return;

  assert.equal(mapped.row[8], false);
  assert.equal(mapped.row[10], false);
  assert.match(String(mapped.row[16]), /result=weakens/);
  assert.match(String(mapped.row[16]), /help=assisted/);
});

test('unmapped facet falls back to its mapped parent concept while preserving facet metadata', () => {
  const mapped = mapStudyAttemptToFreshEvidence(fixture(), [DSI_MAPPING]);
  assert.equal(mapped.status, 'mapped');
  if (mapped.status !== 'mapped') return;
  assert.equal(mapped.row[3], DSI_MAPPING.conceptId);
  assert.match(String(mapped.row[16]), /facet_id=DSI.P2.MICRO.SYNC_ASYNC.FACET/);
});

test('unmapped concept and subject mismatch fail closed', () => {
  assert.deepEqual(
    mapStudyAttemptToFreshEvidence(fixture({ conceptId: 'DSI.P2.UNKNOWN' }), [DSI_MAPPING]),
    { status: 'unmapped', reason: 'missing-concept' },
  );
  assert.deepEqual(mapStudyAttemptToFreshEvidence(fixture({ subjectId: 'redes' }), [DSI_MAPPING]), {
    status: 'unmapped',
    reason: 'subject-mismatch',
  });
});

function memorySheets(): {
  client: LearningSheetsValuesClient;
  evidenceRows: unknown[][];
} {
  const evidenceRows: unknown[][] = [[...FRESH_EVIDENCE_HEADERS]];
  const conceptRows: unknown[][] = [
    [
      'concept_id',
      'subject_id',
      'assessment',
      'unit',
      'parent_id',
      'name',
      'description',
      'importance',
    ],
    [
      DSI_MAPPING.conceptId,
      DSI_MAPPING.subjectId,
      DSI_MAPPING.assessment,
      '2.3',
      '',
      'Sync vs async',
      '',
      'high',
    ],
  ];

  const client: LearningSheetsValuesClient = {
    async getValues(rangeA1) {
      if (rangeA1.startsWith('ConceptInventory!')) {
        return { ok: true, values: structuredClone(conceptRows) };
      }
      return { ok: true, values: structuredClone(evidenceRows) };
    },
    async putValues(_rangeA1, values) {
      for (const row of values) evidenceRows.push([...row]);
      return { ok: true };
    },
  };

  return { client, evidenceRows };
}

test('FreshEvidence writer writes once and exact retry is idempotent', async () => {
  const memory = memorySheets();
  const bridge = createLearningEvidenceBridge({ sheets: memory.client });
  const attempt = fixture();

  assert.deepEqual(await bridge.recordAttempt(attempt), {
    status: 'written',
    evidenceId: 'study-engine:attempt-1',
  });
  assert.deepEqual(await bridge.recordAttempt(attempt), {
    status: 'duplicate',
    evidenceId: 'study-engine:attempt-1',
  });
  assert.equal(memory.evidenceRows.length, 2);
});

test('same evidence id with changed payload conflicts instead of overwriting history', async () => {
  const memory = memorySheets();
  const bridge = createLearningEvidenceBridge({ sheets: memory.client });

  await bridge.recordAttempt(fixture());
  const changed = fixture({ correctness: false, rating: 'again' });

  assert.deepEqual(await bridge.recordAttempt(changed), {
    status: 'conflict',
    evidenceId: 'study-engine:attempt-1',
  });
  assert.equal(memory.evidenceRows.length, 2);
});

test('Learning evidence writes require dedicated spreadsheet id and explicit gate', () => {
  const base = {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'vida@example.iam.gserviceaccount.com',
    GOOGLE_PRIVATE_KEY: 'line1\\nline2',
    GOOGLE_LEARNING_SPREADSHEET_ID: 'learning_sheet_example_1234567890',
  };

  assert.equal(getLearningEvidenceWriteConfig(base), null);
  assert.equal(
    getLearningEvidenceWriteConfig({
      ...base,
      GOOGLE_LEARNING_SHEETS_ALLOW_WRITES: 'true',
    })?.spreadsheetId,
    'learning_sheet_example_1234567890',
  );
});

test('real subject API sync fails closed when Learning OS evidence bridge is unavailable', async () => {
  const { handleStudyAttemptPost } = await import('@/lib/study-engine/attempt-api');
  const store = {
    async acceptAttempt(attemptUserId: string, attempt: StudyAttemptEvent) {
      void attemptUserId;
      return { idempotencyKey: attempt.idempotencyKey, status: 'accepted' as const };
    },
    async countAttempts() {
      return 1;
    },
  };

  const attempt = fixture();
  const response = await handleStudyAttemptPost(
    new Request('https://vida.test/api/study-engine/v1/attempts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': attempt.idempotencyKey,
      },
      body: JSON.stringify({ attempt }),
    }),
    'user-1',
    store,
    null,
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: 'learning-evidence-unavailable',
  });
});

test('real subject API sync acknowledges only after FreshEvidence write succeeds', async () => {
  const { handleStudyAttemptPost } = await import('@/lib/study-engine/attempt-api');
  const store = {
    async acceptAttempt(attemptUserId: string, attempt: StudyAttemptEvent) {
      void attemptUserId;
      return { idempotencyKey: attempt.idempotencyKey, status: 'accepted' as const };
    },
    async countAttempts() {
      return 1;
    },
  };
  const bridge = {
    async recordAttempt() {
      return { status: 'written' as const, evidenceId: 'study-engine:attempt-1' };
    },
  };

  const attempt = fixture();
  const response = await handleStudyAttemptPost(
    new Request('https://vida.test/api/study-engine/v1/attempts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': attempt.idempotencyKey,
      },
      body: JSON.stringify({ attempt }),
    }),
    'user-1',
    store,
    bridge,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    idempotencyKey: attempt.idempotencyKey,
    status: 'accepted',
  });
});
