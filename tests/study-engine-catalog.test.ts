import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildStudyCatalogSubject,
  deriveStudySets,
  matchSubjectProgress,
} from '@/lib/study-engine/catalog';
import type { AssessmentProgressSnapshot } from '@/types/assessment-progress';

test('IOP families become three real study topics instead of a flat deck', () => {
  const subject = buildStudyCatalogSubject({
    subjectId: 'iop',
    subject: { name: 'IOP', term: '2026', status: 'active' },
    current: {},
    blueprint: {
      assessment_id: 'iop-2026-p2',
      status: 'active',
      scope: ['U5 Redes', 'U6 Pronósticos', 'U7 Inventarios'],
    },
    conceptInventory: {
      source_scope_status: 'complete-for-declared-u5-u7',
      scope: ['U5 Redes', 'U6 Pronósticos', 'U7 Inventarios'],
      families: {
        U5: ['a', 'b'],
        U6: ['c'],
        U7: ['d', 'e', 'f'],
      },
    },
    readiness: { band: 'baseline-unmeasured' },
    learningFiles: [],
  });

  assert.equal(subject.structureStatus, 'resolved');
  assert.equal(subject.conceptCount, 6);
  assert.deepEqual(
    subject.topics.map((topic) => [topic.label, topic.conceptCount]),
    [
      ['U5 Redes', 2],
      ['U6 Pronósticos', 1],
      ['U7 Inventarios', 3],
    ],
  );
});

test('Redes concepts group by canonical block and keep matching numbered study material', () => {
  const subject = buildStudyCatalogSubject({
    subjectId: 'redes',
    subject: { name: 'Redes', term: '2026', status: 'active' },
    current: { current_unit: 'P3' },
    blueprint: {
      assessment_id: 'redes-2026-p3',
      topic_weights: [
        { block: '01 Transporte UDP NAT/PAT', weight: 0.5 },
        { block: '02 TCP', weight: 0.5 },
      ],
    },
    conceptInventory: {
      source_scope_status: 'resolved',
      concepts: [
        { id: 'a', block: '01' },
        { id: 'b', block: '01' },
        { id: 'c', block: '02' },
      ],
    },
    readiness: { band: 'unmeasured' },
    learningFiles: ['P3_01_TRANSPORTE_UDP_NAT.md', 'P3_02_TCP.md'],
  });

  assert.equal(subject.structureStatus, 'resolved');
  assert.deepEqual(
    subject.topics.map((topic) => [topic.label, topic.conceptCount, topic.studySets.length]),
    [
      ['Transporte UDP NAT/PAT', 2, 1],
      ['TCP', 1, 1],
    ],
  );
});

test('DSI numbered practice files become grouped mazos without duplicating number 04', () => {
  const sets = deriveStudySets([
    'P2_PRACTICE_01_PREENUNCIADO.md',
    'P2_PRACTICE_04_CU_JUSTIFICATION.md',
    'P2_PRACTICE_04_RNF_JUSTIFICATION.md',
    'P2_PRACTICE_09_MONO_DEPLOYMENT.md',
  ]);

  assert.equal(sets.length, 3);
  assert.equal(sets[1]?.sequence, '04');
  assert.match(sets[1]?.label ?? '', /Justificación de CU/);
  assert.match(sets[1]?.label ?? '', /Justificación de RNF/);
});

test('unresolved subject stays unmeasured instead of becoming a fake zero-progress subject', () => {
  const subject = buildStudyCatalogSubject({
    subjectId: 'tpa',
    subject: { name: 'TPA', term: '2026', status: 'active' },
    current: {},
    blueprint: {},
    conceptInventory: { source_scope_status: 'incomplete', concepts: [] },
    readiness: { band: 'not-ready' },
    learningFiles: [],
  });

  assert.equal(subject.structureStatus, 'unresolved');
  assert.equal(subject.conceptCount, 0);
  assert.equal(subject.topics.length, 0);
  assert.equal(subject.assessment, null);
});

test('assessment progress only attaches to the exact subject + assessment pair', () => {
  const subject = buildStudyCatalogSubject({
    subjectId: 'redes',
    subject: { name: 'Redes', status: 'active' },
    current: {},
    blueprint: { assessment_id: 'redes-2026-p3' },
    conceptInventory: { source_scope_status: 'resolved', concepts: [] },
    readiness: {},
    learningFiles: [],
  });

  const snapshot: AssessmentProgressSnapshot = {
    snapshotId: 'snap-1',
    assessmentId: 'redes-2026-p3',
    subjectId: 'redes',
    assessmentDate: null,
    generatedAt: '2026-09-27T20:00:00Z',
    payload: {
      name: 'Parcial 3',
      type: 'written-exam',
      status: 'active',
      progressPercent: null,
      progressConfidence: 'low',
      readinessBand: 'unknown',
      remainingMinutesLow: null,
      remainingMinutesHigh: null,
      etaConfidence: 'low',
      criticalGaps: [],
      nextBestActivity: null,
      scopeComplete: true,
      evidenceCount: 0,
    },
  };

  assert.equal(matchSubjectProgress(subject, [snapshot]).progress?.snapshotId, 'snap-1');
  assert.equal(
    matchSubjectProgress(subject, [{ ...snapshot, assessmentId: 'redes-2026-p2' }]).progress,
    null,
  );
});
