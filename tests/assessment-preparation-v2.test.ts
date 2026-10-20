import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  parseAssessmentProgressPayload,
  selectLatestAssessmentProgressSnapshots,
} from '@/lib/assessment-progress/snapshot';
import { effectiveAssessmentReadiness, matchSubjectProgress } from '@/lib/study-engine/catalog';
import type { AssessmentPreparationEstimate } from '@/types/assessment-progress';
import type { StudyCatalogRead, StudyCatalogSubject } from '@/types/study-catalog';

const require = createRequire(import.meta.url);
const oldScss = require.extensions['.scss'];
require.extensions['.scss'] = (module) => {
  module.exports = new Proxy(
    {},
    { get: (_target, key) => (key === '__esModule' ? false : String(key)) },
  );
};
const { AssessmentPreparation } =
  require('@/components/learning/AssessmentPreparation') as typeof import('@/components/learning/AssessmentPreparation');
const { LearningHubV2 } =
  require('@/components/learning/LearningHubV2') as typeof import('@/components/learning/LearningHubV2');
const { StudyCatalog } =
  require('@/components/study-engine/StudyCatalog') as typeof import('@/components/study-engine/StudyCatalog');
after(() => {
  if (oldScss) require.extensions['.scss'] = oldScss;
  else delete require.extensions['.scss'];
});

const HEADER = [
  'Snapshot ID',
  'Assessment ID',
  'Subject ID',
  'Fecha evaluación',
  'Generado en',
  'Payload JSON',
  'Fuente',
  'Versión',
];
const estimate: AssessmentPreparationEstimate = {
  percent: 38,
  confidence: 'low',
  asOf: '2032-04-10',
  basis: 'Cobertura y dominio observados; falta verificar una operación del alcance.',
  rangeLow: 28,
  rangeHigh: 48,
};
function payload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Evaluación de muestra',
    type: 'written-exam',
    status: 'active',
    progressPercent: null,
    progressConfidence: 'low',
    readinessBand: 'unknown',
    remainingMinutesLow: null,
    remainingMinutesHigh: null,
    etaConfidence: 'low',
    criticalGaps: ['Operación de muestra sin verificar'],
    nextBestActivity: 'Variante independiente',
    scopeComplete: false,
    evidenceCount: 3,
    preparationEstimate: estimate,
    ...overrides,
  };
}
function row(
  overrides: Record<string, unknown> = {},
  version = 'v2',
  assessment = 'sample-exam',
  subject = 'sample',
) {
  const data = payload(overrides);
  if (version === 'v1') delete (data as Record<string, unknown>).preparationEstimate;
  return [
    `vida2:assessment-progress:${version}:${assessment}:sample-closeout`,
    assessment,
    subject,
    '2032-05-01',
    '2032-04-11T14:00:00-03:00',
    JSON.stringify(data),
    'chatgpt_subject_project',
    `assessment-progress-${version}`,
  ];
}
function read(overrides: Record<string, unknown> = {}) {
  return selectLatestAssessmentProgressSnapshots([HEADER, row(overrides)]);
}
function subject(id = 'sample', assessment = 'sample-exam'): StudyCatalogSubject {
  return {
    id,
    name: 'Materia de muestra',
    term: '2032',
    currentUnit: null,
    assessment: {
      id: assessment,
      status: 'active',
      date: '2032-05-01',
      format: 'written-exam',
      scopeComplete: false,
    },
    structureStatus: 'resolved',
    sourceScopeStatus: 'resolved',
    conceptCount: 2,
    topics: [],
    readinessBand: 'unknown',
    updated: '2032-04-10',
    studyRuntimeAvailable: false,
  };
}

test('V1 remains unchanged and strict; only V2 accepts the separate estimate', () => {
  const legacy = selectLatestAssessmentProgressSnapshots([HEADER, row({}, 'v1')]);
  assert.equal(legacy.status, 'ready');
  assert.equal(legacy.snapshots[0].payload.preparationEstimate, undefined);
  assert.equal(parseAssessmentProgressPayload(payload()), null);
  assert.deepEqual(read().snapshots[0].payload.preparationEstimate, estimate);
  assert.equal(read().snapshots[0].payload.progressPercent, null);
});

test('latest V2 supersedes V1 without rewriting history; malformed V2 cannot erase V1', () => {
  const previous = row({}, 'v1');
  previous[4] = '2032-04-10T14:00:00-03:00';
  assert.equal(
    selectLatestAssessmentProgressSnapshots([HEADER, previous, row()]).snapshots[0].payload
      .preparationEstimate?.percent,
    38,
  );
  const invalid = selectLatestAssessmentProgressSnapshots([
    HEADER,
    previous,
    row({ preparationEstimate: { ...estimate, percent: 101 } }),
  ]);
  assert.equal(invalid.status, 'degraded');
  assert.equal(invalid.snapshots[0].payload.preparationEstimate, undefined);
});

for (const [label, value] of Object.entries({
  future: { ...estimate, asOf: '2032-04-12' },
  impossibleDate: { ...estimate, asOf: '2032-02-30' },
  noBasis: { ...estimate, basis: ' ' },
  unknownConfidence: { ...estimate, confidence: 'certain' },
  fraction: { ...estimate, percent: 38.5 },
  negative: { ...estimate, percent: -1 },
  partialRange: { ...estimate, rangeLow: null },
  invertedRange: { ...estimate, rangeLow: 50 },
  outsideRange: { ...estimate, rangeHigh: 30 },
  extraKey: { ...estimate, rawEvidence: 'not allowed' },
})) {
  test(`invalid estimate rejected: ${label}`, () => {
    assert.equal(read({ preparationEstimate: value }).status, 'invalid');
  });
}

test('estimate requires evidence, cannot coexist with canonical percent or readiness claims', () => {
  for (const override of [
    { evidenceCount: 0 },
    { progressPercent: 38, scopeComplete: true },
    { readinessBand: 'exam-ready' },
    { readinessBand: 'developing' },
  ]) {
    assert.equal(read(override).status, 'invalid');
  }
  assert.equal(read({ evidenceCount: 90 }).snapshots[0].payload.preparationEstimate?.percent, 38);
  assert.equal(
    read({ preparationEstimate: { ...estimate, rangeLow: null, rangeHigh: null } }).status,
    'ready',
  );
});

test('version and snapshot namespace must agree; unknown versions and unknown payload fields fail closed', () => {
  const mismatched = row();
  mismatched[7] = 'assessment-progress-v1';
  assert.equal(selectLatestAssessmentProgressSnapshots([HEADER, mismatched]).status, 'invalid');
  assert.equal(selectLatestAssessmentProgressSnapshots([HEADER, row({}, 'v3')]).status, 'invalid');
  assert.equal(read({ privateSource: 'not allowed' }).status, 'invalid');
  const missing = payload() as Record<string, unknown>;
  delete missing.preparationEstimate;
  assert.equal(parseAssessmentProgressPayload(missing, 'assessment-progress-v2'), null);
  for (const id of [
    'vida2:assessment-progress:v2:other:closeout',
    'vida2:assessment-progress:v2:sample-exam:',
  ]) {
    const mismatchedId = row();
    mismatchedId[0] = id;
    assert.equal(selectLatestAssessmentProgressSnapshots([HEADER, mismatchedId]).status, 'invalid');
  }
  const uncomparableDate = row();
  uncomparableDate[4] = 'Sun, 11 Apr 2032 14:00:00 GMT';
  assert.equal(
    selectLatestAssessmentProgressSnapshots([HEADER, uncomparableDate]).status,
    'invalid',
  );
});

test('newer explicitly unmeasured V2 removes an old estimate rather than backfilling it', () => {
  const previous = row();
  previous[4] = '2032-04-10T14:00:00-03:00';
  const state = selectLatestAssessmentProgressSnapshots([
    HEADER,
    previous,
    row({ preparationEstimate: null }),
  ]);
  assert.equal(state.snapshots[0].payload.preparationEstimate, null);
  assert.equal(state.snapshots[0].payload.progressPercent, null);
});

test('all seven subjects use assessment identity; TP delivery never supplies defense progress', () => {
  for (const id of ['iop', 'redes', 'cdd', 'dsi', 'tpa', 'dao', 'green']) {
    const source = selectLatestAssessmentProgressSnapshots([
      HEADER,
      row({}, 'v2', 'sample-delivery', id),
    ]);
    const matched = matchSubjectProgress(subject(id, 'sample-delivery'), source.snapshots);
    assert.equal(matched.progress?.payload.preparationEstimate?.percent, 38);
    assert.equal(effectiveAssessmentReadiness(matched), 'unknown');
    assert.equal(
      matchSubjectProgress(subject(id, 'sample-defense'), source.snapshots).progress,
      null,
    );
  }
  assert.equal(matchSubjectProgress(subject('another'), read().snapshots).progress, null);
});

test('reconciliation still blocks a changed date or a newer subject state', () => {
  const original = subject();
  assert.equal(
    matchSubjectProgress(
      { ...original, assessment: { ...original.assessment!, date: '2032-05-02' } },
      read().snapshots,
    ).progress,
    null,
  );
  assert.equal(
    matchSubjectProgress({ ...original, updated: '2032-04-12' }, read().snapshots).progress,
    null,
  );
});

test('estimated bar is accessible, keeps original date/range/confidence and canonical null', () => {
  const snapshot = read().snapshots[0];
  const html = renderToStaticMarkup(
    createElement(AssessmentPreparation, { snapshot, subjectName: 'Materia de muestra' }),
  );
  assert.match(html, /Preparación estimada: 38%/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="38"/);
  assert.match(html, /Confianza baja/);
  assert.match(html, /2032-04-10/);
  assert.match(html, /Rango 28–48%/);
  assert.match(html, /no mide la probabilidad de aprobar/);
  assert.doesNotMatch(html, /2032-04-11|Preparación demostrada|sample-exam/);
  assert.equal(snapshot.payload.progressPercent, null);
});

test('canonical bar includes real zero, unmeasured never renders a fake empty bar', () => {
  for (const percent of [0, 63]) {
    const snapshot = read({
      progressPercent: percent,
      scopeComplete: true,
      preparationEstimate: null,
    }).snapshots[0];
    const html = renderToStaticMarkup(
      createElement(AssessmentPreparation, { snapshot, subjectName: 'Muestra' }),
    );
    assert.match(html, new RegExp(`Preparación demostrada: ${percent}%`));
    assert.match(html, new RegExp(`aria-valuenow="${percent}"`));
    assert.doesNotMatch(html, /Preparación estimada/);
  }
  for (const snapshot of [null, read({ preparationEstimate: null }).snapshots[0]]) {
    const html = renderToStaticMarkup(
      createElement(AssessmentPreparation, { snapshot, subjectName: 'Muestra' }),
    );
    assert.match(html, /Preparación sin medir/);
    assert.doesNotMatch(html, /progressbar|0%/);
  }
});

test('sheet → reconciliation → both learning surfaces renders the same estimate, without calculating from counts', () => {
  const catalog: StudyCatalogRead = {
    subjects: [subject()],
    state: 'ready',
    notice: null,
    sourceCommit: null,
  };
  for (const Component of [LearningHubV2, StudyCatalog]) {
    const html = renderToStaticMarkup(
      createElement(Component, { catalog, assessmentProgress: read() }),
    );
    assert.match(html, /Preparación estimada: 38%/);
    assert.match(html, /aria-valuenow="38"/);
    assert.doesNotMatch(html, /Preparación demostrada|Preparación 3%/);
  }
});
