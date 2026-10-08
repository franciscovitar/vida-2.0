import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyWeekAssessments, classifyWeekUpcoming } from '@/lib/planning/week-v2';
import type { AssessmentProgressSnapshot } from '@/types/assessment-progress';

function assessment(
  id: string,
  date: string | null,
  status: 'active' | 'planned' | 'complete' = 'active',
): AssessmentProgressSnapshot {
  return {
    snapshotId: `snapshot-${id}`,
    assessmentId: id,
    subjectId: 'dsi',
    assessmentDate: date,
    generatedAt: '2026-10-08T10:00:00Z',
    payload: {
      name: id,
      type: 'exam',
      status,
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
    },
  };
}

test('E7. past active assessment is a reconciliation item, not an upcoming exam', () => {
  const result = classifyWeekAssessments(
    [
      assessment('past', '2026-10-07'),
      assessment('today', '2026-10-08'),
      assessment('last', '2026-10-14'),
      assessment('later', '2026-10-15'),
      assessment('undated', null),
      assessment('completed', '2026-10-10', 'complete'),
    ],
    '2026-10-08',
  );

  assert.deepEqual(
    result.past.map((item) => item.assessmentId),
    ['past'],
  );
  assert.deepEqual(
    result.week.map((item) => item.assessmentId),
    ['today', 'last'],
  );
  assert.deepEqual(
    result.later.map((item) => item.assessmentId),
    ['later'],
  );
  assert.deepEqual(
    result.undated.map((item) => item.assessmentId),
    ['undated'],
  );
});

test('E7. no evidence remains empty; unknown is never converted into 0%', () => {
  const result = classifyWeekAssessments([], '2026-10-08');
  assert.deepEqual(result, { week: [], past: [], undated: [], later: [] });
  const unknown = classifyWeekAssessments([assessment('unknown', null)], '2026-10-08');
  assert.equal(unknown.undated[0]?.payload.progressPercent, null);
});

test('E7. orientation outside seven-day window does not become a weekly commitment', () => {
  const result = classifyWeekUpcoming(
    [
      { date: '2026-10-07', title: 'past' },
      { date: '2026-10-08', title: 'today' },
      { date: '2026-10-14', title: 'last' },
      { date: '2026-10-15', title: 'later' },
      { date: 'unknown', title: 'unknown' },
    ],
    '2026-10-08',
  );
  assert.deepEqual(
    result.week.map((item) => item.title),
    ['today', 'last'],
  );
  assert.deepEqual(
    result.past.map((item) => item.title),
    ['past'],
  );
  assert.deepEqual(
    result.later.map((item) => item.title),
    ['later'],
  );
  assert.deepEqual(
    result.unknown.map((item) => item.title),
    ['unknown'],
  );
});

test('F-DATE-1. Invalid Gregorian days cannot roll into another weekly assessment date', () => {
  const result = classifyWeekAssessments(
    [assessment('impossible', '2026-02-30'), assessment('valid', '2026-03-02')],
    '2026-03-02',
  );

  assert.deepEqual(result.week.map((item) => item.assessmentId), ['valid']);
  assert.deepEqual(result.undated.map((item) => item.assessmentId), ['impossible']);
});

test('F-DATE-2. Invalid upcoming date is unknown rather than a fabricated week item', () => {
  const result = classifyWeekUpcoming(
    [
      { date: '2025-02-29', title: 'impossible' },
      { date: '2024-02-29', title: 'real leap day' },
    ],
    '2024-02-29',
  );

  assert.deepEqual(result.week.map((item) => item.title), ['real leap day']);
  assert.deepEqual(result.unknown.map((item) => item.title), ['impossible']);
});

test('F-DATE-3. Invalid reference day never creates a fabricated weekly commitment', () => {
  const assessments = classifyWeekAssessments([assessment('exam', '2026-03-02')], '2026-02-30');
  const upcoming = classifyWeekUpcoming([{ date: '2026-03-02', title: 'task' }], '2026-02-30');

  assert.equal(assessments.week.length, 0);
  assert.equal(assessments.undated.length, 1);
  assert.equal(upcoming.week.length, 0);
  assert.equal(upcoming.unknown.length, 1);
});
