import assert from 'node:assert/strict';
import { test } from 'node:test';

import { selectLatestAssessmentProgressSnapshots } from '@/lib/assessment-progress/snapshot';
import { composeAreaDashboard } from '@/lib/areas/compose';
import { buildMockNotionDashboard } from '@/lib/mock-data/notion';
import { summarizeProjects, summarizeTasks } from '@/lib/notion/summaries';
import type { NotionDashboardData } from '@/types/notion';

const TODAY = '2026-09-17';

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

function fullDashboard(): NotionDashboardData {
  const base = buildMockNotionDashboard(TODAY);
  return {
    ...base,
    source: 'mock',
    status: 'mock',
    notice: null,
    syncedAt: `${TODAY}T12:00:00.000Z`,
    taskSummary: summarizeTasks(base.tasks),
    projectSummary: summarizeProjects(base.projects),
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    name: 'Parcial 2',
    type: 'written-exam',
    status: 'active',
    progressPercent: 64,
    progressConfidence: 'medium',
    readinessBand: 'developing',
    remainingMinutesLow: 360,
    remainingMinutesHigh: 540,
    etaConfidence: 'medium',
    criticalGaps: ['Iterator'],
    nextBestActivity: 'Resolver variante fresca de Iterator',
    scopeComplete: true,
    evidenceCount: 14,
    ...overrides,
  });
}

function row(generatedAt: string, progress = 64) {
  return [
    `vida2:assessment-progress:v1:dsi-2026-p2:${generatedAt}`,
    'dsi-2026-p2',
    'DSI',
    '2026-11-07',
    generatedAt,
    payload({ progressPercent: progress }),
    'chatgpt_subject_project',
    'assessment-progress-v1',
  ];
}

test('assessment progress selects latest valid snapshot per assessment', () => {
  const read = selectLatestAssessmentProgressSnapshots([
    HEADER,
    row('2026-09-17T10:00:00-03:00', 40),
    row('2026-09-17T12:00:00-03:00', 55),
  ]);
  assert.equal(read.status, 'ready');
  assert.equal(read.snapshots.length, 1);
  assert.equal(read.snapshots[0]?.payload.progressPercent, 55);
});

test('invalid later row does not erase earlier valid state', () => {
  const bad = row('2026-09-17T13:00:00-03:00', 70);
  bad[6] = 'wrong-source';
  const read = selectLatestAssessmentProgressSnapshots([
    HEADER,
    row('2026-09-17T12:00:00-03:00', 55),
    bad,
  ]);
  assert.equal(read.status, 'degraded');
  assert.equal(read.invalidRows, 1);
  assert.equal(read.snapshots[0]?.payload.progressPercent, 55);
});

test('null progress remains unknown rather than fake 0', () => {
  const unknown = row('2026-09-17T12:00:00-03:00', 55);
  unknown[5] = payload({
    progressPercent: null,
    remainingMinutesLow: null,
    remainingMinutesHigh: null,
    readinessBand: 'unknown',
    evidenceCount: 0,
    scopeComplete: false,
  });
  const read = selectLatestAssessmentProgressSnapshots([HEADER, unknown]);
  assert.equal(read.status, 'ready');
  assert.equal(read.snapshots[0]?.payload.progressPercent, null);
});

test('Facultad exposes bounded active assessment summary', () => {
  const notion = fullDashboard();
  const assessmentProgress = selectLatestAssessmentProgressSnapshots([
    HEADER,
    row('2026-09-17T12:00:00-03:00', 55),
  ]);
  const data = composeAreaDashboard({
    slug: 'facultad',
    notion,
    calendarEvents: [],
    sheets: null,
    assessmentProgress,
    sources: [],
    northHint: null,
    allowMockMetrics: false,
  });
  assert.ok(data);
  assert.equal(data.variant?.kind, 'facultad');
  if (data.variant?.kind !== 'facultad') throw new Error('Expected facultad variant');
  assert.equal(data.variant.assessments.length, 1);
  assert.equal(data.variant.assessments[0]?.subjectId, 'DSI');
  assert.equal(data.variant.assessments[0]?.progressPercent, 55);
  assert.equal(data.variant.assessments[0]?.criticalGap, 'Iterator');
  assert.equal(JSON.stringify(data).includes('vida2:assessment-progress:v1:'), false);
});
