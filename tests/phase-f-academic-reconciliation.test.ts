import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { effectiveAssessmentReadiness, matchSubjectProgress } from '@/lib/study-engine/catalog';
import type { AssessmentProgressSnapshot } from '@/types/assessment-progress';
import type { StudyCatalogSubject } from '@/types/study-catalog';

function subject(overrides: Partial<StudyCatalogSubject> = {}): StudyCatalogSubject {
  return {
    id: 'dsi',
    name: 'DSI',
    term: '2026',
    currentUnit: 'P3',
    assessment: {
      id: 'dsi-2026-p3',
      status: 'active',
      date: '2026-11-07',
      format: 'written-exam',
      scopeComplete: true,
    },
    structureStatus: 'resolved',
    sourceScopeStatus: 'resolved',
    conceptCount: 12,
    topics: [],
    readinessBand: 'exam-ready',
    updated: '2026-10-07',
    studyRuntimeAvailable: false,
    ...overrides,
  };
}

function snapshot(overrides: Partial<AssessmentProgressSnapshot> = {}): AssessmentProgressSnapshot {
  return {
    snapshotId: 'fixture-dsi-p3',
    subjectId: 'dsi',
    assessmentId: 'dsi-2026-p3',
    assessmentDate: '2026-11-07',
    generatedAt: '2026-10-08T10:00:00-03:00',
    payload: {
      name: 'Parcial 3',
      type: 'written-exam',
      status: 'active',
      progressPercent: 62,
      progressConfidence: 'medium',
      readinessBand: 'developing',
      remainingMinutesLow: 180,
      remainingMinutesHigh: 360,
      etaConfidence: 'low',
      criticalGaps: ['Strategy'],
      nextBestActivity: 'Variante nueva',
      scopeComplete: true,
      evidenceCount: 12,
    },
    ...overrides,
  };
}

test('F-AR1. alcance oficial compatible admite resumen, no usa readiness general', () => {
  const matched = matchSubjectProgress(subject(), [snapshot()]);
  assert.equal(matched.progress?.payload.progressPercent, 62);
  assert.equal(effectiveAssessmentReadiness(matched), 'developing');
  assert.equal(matched.evidenceNotice, null);
});

test('F-AR2. catálogo incompleto invalida porcentaje declarado completo en Sheet', () => {
  const official = subject({
    assessment: {
      id: 'dsi-2026-p3',
      status: 'active',
      date: null,
      format: null,
      scopeComplete: false,
    },
  });
  const matched = matchSubjectProgress(official, [snapshot()]);
  assert.equal(matched.progress, null);
  assert.equal(effectiveAssessmentReadiness(matched), 'unknown');
  assert.match(matched.evidenceNotice ?? '', /alcance/);
});

test('F-AR3. baseline sin porcentaje se conserva como desconocido', () => {
  const official = subject({
    assessment: {
      id: 'dsi-2026-p3',
      status: 'active',
      date: null,
      format: null,
      scopeComplete: false,
    },
  });
  const source = snapshot({
    payload: {
      ...snapshot().payload,
      scopeComplete: false,
      progressPercent: null,
      readinessBand: 'unknown',
      evidenceCount: 0,
    },
  });
  const matched = matchSubjectProgress(official, [source]);
  assert.equal(matched.progress?.payload.progressPercent, null);
  assert.equal(effectiveAssessmentReadiness(matched), 'unknown');
  assert.equal(matched.evidenceNotice, null);
});

test('F-AR4. estado canónico posterior deja resumen viejo pendiente de actualizar', () => {
  const matched = matchSubjectProgress(subject({ updated: '2026-10-08' }), [
    snapshot({ generatedAt: '2026-10-07T15:00:00-03:00' }),
  ]);
  assert.equal(matched.progress, null);
  assert.match(matched.evidenceNotice ?? '', /después/);
});

test('F-AR5. resumen del mismo día no se descarta por falsa precisión horaria', () => {
  const matched = matchSubjectProgress(subject({ updated: '2026-10-08' }), [
    snapshot({ generatedAt: '2026-10-08T08:00:00-03:00' }),
  ]);
  assert.equal(matched.progress?.payload.progressPercent, 62);
});

test('F-AR6. otro parcial y otra materia no aportan preparación a DSI P3', () => {
  const matched = matchSubjectProgress(subject(), [
    snapshot({ assessmentId: 'dsi-2026-p2' }),
    snapshot({ subjectId: 'iop' }),
  ]);
  assert.equal(matched.progress, null);
  assert.equal(effectiveAssessmentReadiness(matched), 'unknown');
});

test('F-AR7. una materia sin resumen no hereda exam-ready general', () => {
  const matched = matchSubjectProgress(subject({ readinessBand: 'exam-ready' }), []);
  assert.equal(matched.progress, null);
  assert.equal(matched.readinessBand, 'exam-ready');
  assert.equal(effectiveAssessmentReadiness(matched), 'unknown');
});

test('F-AR8. evaluación finalizada no certifica readiness de examen activo', () => {
  const source = snapshot({ payload: { ...snapshot().payload, status: 'complete' } });
  const matched = matchSubjectProgress(subject(), [source]);
  assert.equal(matched.progress, null);
  assert.equal(effectiveAssessmentReadiness(matched), 'unknown');
});

test('F-AR9. Aprendizaje y Modo estudio exponen fallos de Assessment Progress', () => {
  for (const path of [
    ['components', 'learning', 'LearningHubV2.tsx'],
    ['components', 'study-engine', 'StudyCatalog.tsx'],
  ]) {
    const source = readFileSync(join(process.cwd(), ...path), 'utf8');
    assert.match(source, /assessmentProgress\.notice/);
    assert.match(source, /role="status"/);
  }
});

test('F-AR10. Modo estudio no atribuye readiness general al examen activo', () => {
  const source = readFileSync(
    join(process.cwd(), 'components', 'study-engine', 'StudyCatalog.tsx'),
    'utf8',
  );
  assert.match(source, /effectiveAssessmentReadiness\(subject\)/);
  assert.doesNotMatch(source, /progress\?\.payload\.readinessBand\s*\?\?\s*subject\.readinessBand/);
});

test('F-AR11. fecha oficial y fecha de snapshot divergentes invalidan el progreso', () => {
  const matched = matchSubjectProgress(subject(), [snapshot({ assessmentDate: '2026-11-08' })]);
  assert.equal(matched.progress, null);
  assert.equal(effectiveAssessmentReadiness(matched), 'unknown');
  assert.match(matched.evidenceNotice ?? '', /fecha del examen/);
});

test('F-AR12. fecha oficial desconocida no inventa un conflicto de fechas', () => {
  const original = subject();
  const matched = matchSubjectProgress(
    subject({ assessment: { ...original.assessment!, date: null } }),
    [snapshot()],
  );
  assert.equal(matched.progress?.payload.progressPercent, 62);
});

test('F-AR13. scope incompleto con porcentaje no certifica preparación de examen', () => {
  const original = snapshot();
  const matched = matchSubjectProgress(subject(), [
    snapshot({ payload: { ...original.payload, scopeComplete: false } }),
  ]);
  assert.equal(matched.progress, null);
  assert.equal(effectiveAssessmentReadiness(matched), 'unknown');
  assert.match(matched.evidenceNotice ?? '', /alcance de examen completo/);
});

test('F-AR14. scope incompleto tampoco permite readiness positiva sin porcentaje', () => {
  const original = snapshot();
  const matched = matchSubjectProgress(subject(), [
    snapshot({
      payload: {
        ...original.payload,
        scopeComplete: false,
        progressPercent: null,
        readinessBand: 'developing',
      },
    }),
  ]);
  assert.equal(matched.progress, null);
  assert.equal(effectiveAssessmentReadiness(matched), 'unknown');
});
