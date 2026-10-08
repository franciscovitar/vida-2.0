import { parsePlanningCivilDay } from '@/lib/planning/civil-day';
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
  const from = parsePlanningCivilDay(targetDate);
  const until = from === null ? null : from + 7 * 86_400_000;

  for (const snapshot of selectPlanningAssessments(snapshots)) {
    if (!snapshot.assessmentDate) {
      buckets.undated.push(snapshot);
      continue;
    }
    const date = parsePlanningCivilDay(snapshot.assessmentDate);
    if (from === null || until === null || date === null) {
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

/** Sanitized orientation dates; keep dates outside the weekly window off the primary surface. */
export function classifyWeekUpcoming<T extends { date: string }>(
  items: readonly T[],
  targetDate: string,
): { week: T[]; past: T[]; later: T[]; unknown: T[] } {
  const result: { week: T[]; past: T[]; later: T[]; unknown: T[] } = {
    week: [],
    past: [],
    later: [],
    unknown: [],
  };
  const from = parsePlanningCivilDay(targetDate);
  const until = from === null ? null : from + 7 * 86_400_000;
  for (const item of items) {
    const date = parsePlanningCivilDay(item.date);
    if (from === null || until === null || date === null) result.unknown.push(item);
    else if (date < from) result.past.push(item);
    else if (date < until) result.week.push(item);
    else result.later.push(item);
  }
  return result;
}
