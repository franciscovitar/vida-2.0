import assert from 'node:assert/strict';
import { test } from 'node:test';

import { selectLatestAssessmentProgressSnapshots } from '@/lib/assessment-progress/snapshot';
import { classifyWeekAssessments } from '@/lib/planning/week-v2';

const HEADERS = [
  'Snapshot ID',
  'Assessment ID',
  'Subject ID',
  'Fecha evaluación',
  'Generado en',
  'Payload JSON',
  'Fuente',
  'Versión',
];

function row(
  assessmentId: string,
  subjectId: string,
  date: string | null,
  generatedAt: string,
  overrides: Record<string, unknown> = {},
): unknown[] {
  const payload = {
    name: assessmentId,
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
    scopeComplete: false,
    evidenceCount: 0,
    ...overrides,
  };
  return [
    `vida2:assessment-progress:v1:${assessmentId}:${generatedAt}`,
    assessmentId,
    subjectId,
    date ?? '',
    generatedAt,
    JSON.stringify(payload),
    'chatgpt_subject_project',
    'assessment-progress-v1',
  ];
}

const BEFORE = '2026-10-07T10:00:00-03:00';
const AFTER = '2026-10-08T10:00:00-03:00';

test('F-ACA1. Blueprint pendiente deja porcentaje y readiness desconocidos, no 0%', () => {
  const read = selectLatestAssessmentProgressSnapshots([
    HEADERS,
    row('dsi-p3', 'DSI', '2026-11-07', AFTER),
  ]);

  assert.equal(read.status, 'ready');
  assert.equal(read.snapshots[0]?.payload.progressPercent, null);
  assert.equal(read.snapshots[0]?.payload.readinessBand, 'unknown');
  assert.equal(read.snapshots[0]?.payload.scopeComplete, false);
});

test('F-ACA2. Porcentaje sin alcance oficial completo se rechaza y no pisa la fila válida', () => {
  const read = selectLatestAssessmentProgressSnapshots([
    HEADERS,
    row('iop-p2', 'IOP', '2026-10-27', BEFORE),
    row('iop-p2', 'IOP', '2026-10-27', AFTER, {
      progressPercent: 73,
      scopeComplete: false,
      evidenceCount: 20,
      readinessBand: 'developing',
    }),
  ]);

  assert.equal(read.status, 'degraded');
  assert.equal(read.invalidRows, 1);
  assert.equal(read.snapshots.length, 1);
  assert.equal(read.snapshots[0]?.payload.progressPercent, null);
  assert.equal(read.snapshots[0]?.generatedAt, BEFORE);
});

test('F-ACA3. Progreso sin evidencia rechazado; 0% válido con alcance completo', () => {
  const read = selectLatestAssessmentProgressSnapshots([
    HEADERS,
    row('redes-p3', 'Redes', null, BEFORE, {
      scopeComplete: true,
      progressPercent: 0,
    }),
    row('redes-p3', 'Redes', null, AFTER, {
      scopeComplete: true,
      progressPercent: 85,
      readinessBand: 'close',
      evidenceCount: 0,
    }),
  ]);

  assert.equal(read.status, 'degraded');
  assert.equal(read.invalidRows, 1);
  assert.equal(read.snapshots[0]?.payload.progressPercent, 0);
  assert.equal(read.snapshots[0]?.payload.readinessBand, 'unknown');
});

test('F-ACA4. exam-ready sin progreso medible ni evidencia no es dominio', () => {
  const read = selectLatestAssessmentProgressSnapshots([
    HEADERS,
    row('dsi-p3', 'DSI', '2026-11-07', AFTER, {
      readinessBand: 'exam-ready',
      progressPercent: null,
      scopeComplete: false,
      evidenceCount: 0,
    }),
  ]);

  assert.equal(read.status, 'invalid');
  assert.equal(read.invalidRows, 1);
  assert.deepEqual(read.snapshots, []);
});

test('F-ACA5. Fecha imposible no genera urgencia: se descarta sin borrar examen válido', () => {
  const read = selectLatestAssessmentProgressSnapshots([
    HEADERS,
    row('iop-p2', 'IOP', '2026-10-27', BEFORE),
    row('iop-p2', 'IOP', '2026-02-30', AFTER),
    row('cdd-e3', 'CDD', '2024-02-29', AFTER),
  ]);

  assert.equal(read.status, 'degraded');
  assert.equal(read.invalidRows, 1);
  assert.deepEqual(
    read.snapshots.map((snapshot) => [snapshot.assessmentId, snapshot.assessmentDate]),
    [
      ['cdd-e3', '2024-02-29'],
      ['iop-p2', '2026-10-27'],
    ],
  );
});

test('F-ACA6. Materias independientes conservan su propia evidencia, fechas e incógnitas', () => {
  const read = selectLatestAssessmentProgressSnapshots([
    HEADERS,
    row('dsi-p3', 'DSI', '2026-11-07', AFTER, {
      scopeComplete: true,
      progressPercent: 61,
      evidenceCount: 12,
      readinessBand: 'developing',
    }),
    row('iop-p2', 'IOP', '2026-10-27', AFTER),
    row('redes-p3', 'Redes', null, AFTER),
  ]);

  assert.equal(read.status, 'ready');
  assert.equal(read.snapshots.length, 3);
  const bySubject = new Map(read.snapshots.map((item) => [item.subjectId, item]));
  assert.equal(bySubject.get('DSI')?.payload.progressPercent, 61);
  assert.equal(bySubject.get('IOP')?.payload.progressPercent, null);
  assert.equal(bySubject.get('Redes')?.assessmentDate, null);
  const weekly = classifyWeekAssessments(read.snapshots, '2026-10-22');
  assert.deepEqual(
    weekly.week.map((item) => item.subjectId),
    ['IOP'],
  );
  assert.deepEqual(
    weekly.later.map((item) => item.subjectId),
    ['DSI'],
  );
  assert.deepEqual(
    weekly.undated.map((item) => item.subjectId),
    ['Redes'],
  );
});

test('F-ACA7. La última reconciliación sin medición reemplaza un porcentaje viejo', () => {
  const read = selectLatestAssessmentProgressSnapshots([
    HEADERS,
    row('dsi-p3', 'DSI', '2026-11-07', BEFORE, {
      scopeComplete: true,
      progressPercent: 64,
      evidenceCount: 14,
      readinessBand: 'developing',
    }),
    row('dsi-p3', 'DSI', '2026-11-07', AFTER),
  ]);

  assert.equal(read.status, 'ready');
  assert.equal(read.snapshots[0]?.generatedAt, AFTER);
  assert.equal(read.snapshots[0]?.payload.progressPercent, null);
  assert.equal(read.snapshots[0]?.payload.readinessBand, 'unknown');
});
