import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  evaluateStudyResponse,
  normalizeStudyAnswer,
  STUDY_ENGINE_DEMO_ITEMS,
} from '@/lib/study-engine/items';

test('Study Engine demo covers every V1 item type twice', () => {
  const counts = new Map<string, number>();
  for (const item of STUDY_ENGINE_DEMO_ITEMS) {
    counts.set(item.itemType, (counts.get(item.itemType) ?? 0) + 1);
  }

  assert.equal(STUDY_ENGINE_DEMO_ITEMS.length, 10);
  assert.deepEqual(Object.fromEntries(counts), {
    recall: 2,
    cloze: 2,
    mcq: 2,
    typed: 2,
    image: 2,
  });
});

test('demo item identities are stable and unique', () => {
  const ids = STUDY_ENGINE_DEMO_ITEMS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(STUDY_ENGINE_DEMO_ITEMS.every((item) => item.version === 1));
  assert.ok(STUDY_ENGINE_DEMO_ITEMS.every((item) => item.subjectId === 'study-engine-demo'));
});

test('objective study responses are evaluated deterministically', () => {
  const cloze = STUDY_ENGINE_DEMO_ITEMS.find((item) => item.id === 'demo-mastery-owner');
  const mcq = STUDY_ENGINE_DEMO_ITEMS.find((item) => item.id === 'demo-response-time');
  const typed = STUDY_ENGINE_DEMO_ITEMS.find((item) => item.id === 'demo-again');
  const image = STUDY_ENGINE_DEMO_ITEMS.find((item) => item.id === 'demo-evidence-image');

  assert.ok(cloze);
  assert.ok(mcq);
  assert.ok(typed);
  assert.ok(image);

  assert.equal(evaluateStudyResponse(cloze, 'learning os'), true);
  assert.equal(evaluateStudyResponse(mcq, 'b'), true);
  assert.equal(evaluateStudyResponse(typed, 'AGAIN'), true);
  assert.equal(evaluateStudyResponse(image, 'transferencia'), true);
  assert.equal(evaluateStudyResponse(mcq, 'a'), false);
});

test('recall remains manual instead of inventing automatic correctness', () => {
  const recall = STUDY_ENGINE_DEMO_ITEMS.find((item) => item.itemType === 'recall');
  assert.ok(recall);
  assert.equal(evaluateStudyResponse(recall, 'cualquier texto'), null);
});

test('answer normalization tolerates case, accents and harmless punctuation', () => {
  assert.equal(normalizeStudyAnswer('  TRANSFERÊNCIA! '), 'transferencia');
  assert.equal(normalizeStudyAnswer('Learning   OS.'), 'learning os');
});
