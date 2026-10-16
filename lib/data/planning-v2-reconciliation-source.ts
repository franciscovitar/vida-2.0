import 'server-only';

import { requireAuthorizedSession } from '@/lib/auth/dal';
import { isPlanningV2DevReadbackEnabled } from '@/lib/daily-planning/reconciliation-config-v2';
import {
  reconcilePlanningV2Readback,
  type PlanningV2ReconcileKind,
  type PlanningV2ReconcileResult,
} from '@/lib/daily-planning/write-reconciliation-v2';
import { readTabValues } from '@/lib/google/sheets-read';

/**
 * Full-tab value read: unlike a capped A1:Q5000 range, a short response
 * cannot conceal later populated rows beyond the limit after blank gaps.
 * Reject responses at the cap (and larger); never infer full coverage from
 * a truncated range. No persistence, Sheets writes or Redis transitions.
 */
const TABS: Record<PlanningV2ReconcileKind, string> = {
  execution: 'Planning Execution V2',
  orientation: 'Daily Planning',
  assessment: 'Assessment Progress',
};
const LIMIT = 5000;

/**
 * Authenticated, read-only DEV evidence for an already-normalized candidate.
 * Internal server API ONLY; do not serialize underlying sheet contents
 * or write any decision back to Redis here.
 */
export async function inspectPlanningV2DevReadback(input: {
  kind: PlanningV2ReconcileKind;
  candidateRow: readonly unknown[];
}): Promise<PlanningV2ReconcileResult> {
  await requireAuthorizedSession();
  if (!isPlanningV2DevReadbackEnabled()) {
    return { status: 'unavailable', matchedRows: 0, retryAllowed: false };
  }
  const tab = TABS[input.kind];
  if (!tab) return { status: 'candidate-invalid', matchedRows: 0, retryAllowed: false };
  const result = await readTabValues(tab);
  if (!result.ok || result.values.length >= LIMIT) {
    return { status: 'unavailable', matchedRows: 0, retryAllowed: false };
  }
  return reconcilePlanningV2Readback({
    kind: input.kind,
    candidateRow: input.candidateRow,
    rows: result.values,
    readStatus: 'ready',
    readComplete: true,
  });
}
