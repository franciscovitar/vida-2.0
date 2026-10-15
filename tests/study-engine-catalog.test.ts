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
    current: { next_assessment: 'redes-synthetic-p3' },
    blueprint: { assessment_id: 'redes-synthetic-p3' },
    conceptInventory: { source_scope_status: 'resolved', concepts: [] },
    readiness: {},
    learningFiles: [],
  });

  const snapshot: AssessmentProgressSnapshot = {
    snapshotId: 'snap-1',
    assessmentId: 'redes-synthetic-p3',
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
    matchSubjectProgress(subject, [{ ...snapshot, assessmentId: 'redes-synthetic-p2' }]).progress,
    null,
  );
});

test('canonical runtime file marks a subject as Study Engine ready', () => {
  const subject = buildStudyCatalogSubject({
    subjectId: 'dsi',
    subject: { name: 'DSI', status: 'active' },
    current: { current_unit: 'P2' },
    blueprint: { assessment_id: 'dsi-2026-p2' },
    conceptInventory: { source_scope_status: 'incomplete' },
    readiness: {},
    learningFiles: ['study_engine_items_v1.json'],
  });

  assert.equal(subject.studyRuntimeAvailable, true);
});

test('academic current state wins over obsolete blueprints and keeps unmeasured state', () => {
  const dao = buildStudyCatalogSubject({
    subjectId: 'dao',
    subject: { name: 'DAO', status: 'active' },
    current: {
      next_assessment: 'dao-synthetic-defense',
      active_assignment: {
        study: { assessment_id: 'dao-synthetic-defense' },
        delivery_date: '2030-03-05',
        delivery_separate_from_defense: true,
        delivery_source: 'DIRECT_USER_REPORT_CONFIRMED_AS_CALENDAR_EVENT',
      },
    },
    blueprint: {
      assessment_id: 'dao-synthetic-old-assessment',
      date: '2030-02-01',
      status: 'draft',
    },
    conceptInventory: { source_scope_status: 'incomplete' },
    readiness: { band: 'not-ready' },
    learningFiles: [],
  });
  assert.equal(dao.assessment?.id, 'dao-synthetic-defense');
  assert.equal(dao.assessment?.label, 'Defensa del TP Integrador');
  assert.equal(dao.assessment?.date, null);
  assert.equal(dao.assessment?.deliveryDate, '2030-03-05');

  const green = buildStudyCatalogSubject({
    subjectId: 'green',
    subject: { name: 'Green Software', status: 'active' },
    current: { next_assessment: null, active_assignment: null },
    blueprint: { assessment_id: 'green-synthetic-old-assessment', date: '2030-02-02' },
    conceptInventory: { source_scope_status: 'complete_for_tp2_oral' },
    readiness: { band: 'not-ready' },
    learningFiles: [],
  });
  assert.equal(green.assessment, null);
  assert.equal(effectiveReadinessForTest(green), 'unknown');
});

test('TPA reported instance has no invented ID and Redes date stays provisional', () => {
  const tpa = buildStudyCatalogSubject({
    subjectId: 'tpa',
    subject: { name: 'TPA', status: 'active' },
    current: {
      reported_upcoming_instance: {
        local_date: '2030-04-01',
        assessment_id: null,
        calendar_event_status: 'confirmed',
      },
    },
    blueprint: { assessment_id: '', date: null },
    conceptInventory: { source_scope_status: 'incomplete' },
    readiness: {},
    learningFiles: [],
  });
  assert.equal(tpa.assessment?.id, null);
  assert.equal(tpa.assessment?.date, '2030-04-01');
  assert.match(tpa.assessment?.dateEvidence ?? '', /Calendar confirmado/);

  const redes = buildStudyCatalogSubject({
    subjectId: 'redes',
    subject: { name: 'Redes', status: 'active' },
    current: {
      next_assessment: 'redes-synthetic-p3',
      reported_next_assessment_date: { local_date: '2030-04-15' },
    },
    blueprint: { assessment_id: 'redes-synthetic-p3', date: null },
    conceptInventory: { source_scope_status: 'resolved' },
    readiness: {},
    learningFiles: [],
  });
  assert.equal(redes.assessment?.id, 'redes-synthetic-p3');
  assert.equal(redes.assessment?.date, '2030-04-15');
  assert.match(redes.assessment?.dateEvidence ?? '', /tentativa/);
});

test('CDD, DSI, and IOP preserve their current named assessments and date evidence', () => {
  const cases = [
    {
      subjectId: 'cdd',
      current: { next_assessment: 'cdd-synthetic-entrega3' },
      blueprint: {
        assessment_id: 'cdd-synthetic-entrega3',
        status: 'provisional-date-only',
        date: '2030-05-01',
      },
      id: 'cdd-synthetic-entrega3',
      label: 'Entrega 3',
      evidence: /cronograma de cursada/i,
    },
    {
      subjectId: 'dsi',
      current: { next_assessment: 'dsi-synthetic-p3' },
      blueprint: { assessment_id: 'dsi-synthetic-p3', date: '2030-05-02' },
      id: 'dsi-synthetic-p3',
      label: 'Parcial 3',
      evidence: /material de evaluación/i,
    },
    {
      subjectId: 'iop',
      current: { next_assessment: 'iop-synthetic-p2' },
      blueprint: { assessment_id: 'iop-synthetic-p2', date: '2030-05-03' },
      id: 'iop-synthetic-p2',
      label: 'Parcial 2',
      evidence: /Calendar/i,
    },
  ];
  for (const fixture of cases) {
    const subject = buildStudyCatalogSubject({
      subjectId: fixture.subjectId,
      subject: { name: fixture.subjectId.toUpperCase(), status: 'active' },
      current: fixture.current,
      blueprint: fixture.blueprint,
      conceptInventory: { source_scope_status: 'incomplete' },
      readiness: {},
      learningFiles: [],
    });
    assert.equal(subject.assessment?.id, fixture.id);
    assert.equal(subject.assessment?.label, fixture.label);
    assert.match(subject.assessment?.dateEvidence ?? '', fixture.evidence);
  }
});

function effectiveReadinessForTest(subject: ReturnType<typeof buildStudyCatalogSubject>) {
  return matchSubjectProgress(subject, []).progress?.payload.readinessBand ?? 'unknown';
}
