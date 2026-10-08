import { selectPlanningAssessments } from '@/lib/planning/overview';
import type { AssessmentProgressSnapshot } from '@/types/assessment-progress';

export interface WeekAssessmentBuckets {
  week: AssessmentProgressSnapshot[];
  past: AssessmentProgressSnapshot[];
  undated: AssessmentProgressSnapshot[];
  later: AssessmentProgressSnapshot[];
}

/**
 * No past assessment may be silently presented as an upcoming assessment.
 * A stale 'active' lifecycle stays unresolved until its owner reconciles it.
 */
export function classifyWeekAssessments(
  snapshots: readonly AssessmentProgressSnapshot[],
  targetDate: string,
): WeekAssessmentBuckets {
  const buckets: WeekAssessmentBuckets = { week: [], past: [], undated: [], later: [] };
  const from = Date.parse(`${targetDate}T12:00:00Z`);
  const until = from + 7 * 86_400_000;

  for (const snapshot of selectPlanningAssessments(snapshots)) {
    if (!snapshot.assessmentDate) {
      buckets.undated.push(snapshot);
      continue;
    }
    const date = Date.parse(`${snapshot.assessmentDate}T12:00:00Z`);
    if (!Number.isFinite(from) || !Number.isFinite(date)) {
      buckets.undated.push(snapshot);
    } else if (date < from) {
      buckets.past.push(snapshot);
    } else if (date < until) {
      buckets.week.push(snapshot);
    } else {
      buckets.later.push(snapshot);
    }
  }

  return buckets;
}
