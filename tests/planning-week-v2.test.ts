import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyWeekAssessments } from '@/lib/planning/week-v2';
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

  assert.deepEqual(result.past.map((item) => item.assessmentId), ['past']);
  assert.deepEqual(result.week.map((item) => item.assessmentId), ['today', 'last']);
  assert.deepEqual(result.later.map((item) => item.assessmentId), ['later']);
  assert.deepEqual(result.undated.map((item) => item.assessmentId), ['undated']);
});

test('E7. no evidence remains empty; unknown is never converted into 0%', () => {
  const result = classifyWeekAssessments([], '2026-10-08');
  assert.deepEqual(result, { week: [], past: [], undated: [], later: [] });
  const unknown = classifyWeekAssessments([assessment('unknown', null)], '2026-10-08');
  assert.equal(unknown.undated[0]?.payload.progressPercent, null);
});
