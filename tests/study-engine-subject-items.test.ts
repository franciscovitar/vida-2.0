import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseStudySubjectItems } from '@/lib/study-engine/subject-items';

const valid = {
  schema_version: 1,
  subject_id: 'dsi',
  assessment_id: 'dsi-2026-p2',
  status: 'active',
  items: [
    {
      id: 'dsi-item-1',
      version: 1,
      concept_id: 'DSI.P2.MICRO.SYNC_ASYNC',
      operation: 'discriminate',
      channel: 'theoretical',
      item_type: 'recall',
      prompt: 'Compare sync y async.',
      answer: 'Sync espera respuesta; async no exige respuesta inmediata.',
      explanation: 'La diferencia incluye acoplamiento temporal.',
    },
  ],
};

test('canonical subject runtime maps to real StudyItem without changing concept identity', () => {
  const parsed = parseStudySubjectItems(valid, 'dsi');
  assert.equal(parsed.state, 'ready');
  if (parsed.state !== 'ready') return;

  assert.equal(parsed.assessmentId, 'dsi-2026-p2');
  assert.equal(parsed.items[0]?.subjectId, 'dsi');
  assert.equal(parsed.items[0]?.conceptId, 'DSI.P2.MICRO.SYNC_ASYNC');
  assert.equal(parsed.items[0]?.channel, 'theoretical');
});

test('runtime fails closed on wrong subject, unsupported item type or duplicate id', () => {
  assert.equal(parseStudySubjectItems(valid, 'redes').state, 'invalid');
  assert.equal(
    parseStudySubjectItems(
      {
        ...valid,
        items: [{ ...valid.items[0], item_type: 'mcq' }],
      },
      'dsi',
    ).state,
    'invalid',
  );
  assert.equal(
    parseStudySubjectItems(
      {
        ...valid,
        items: [valid.items[0], valid.items[0]],
      },
      'dsi',
    ).state,
    'invalid',
  );
});
