import 'server-only';

import { cache } from 'react';

import { requireAuthorizedSession } from '@/lib/auth/dal';
import { loadDailyPlanningContextUncached } from '@/lib/daily-planning/context';
import { selectLatestDailyPlanSnapshot } from '@/lib/daily-planning/snapshot';
import { buildDailyPlanningView } from '@/lib/daily-planning/view';
import { readTabValues } from '@/lib/google/sheets-read';
import type { SheetReadCode } from '@/lib/google/errors';
import type { DailyPlanSnapshotRead } from '@/types/daily-planning-view';

const DAILY_PLAN_TAB = 'Daily Planning';

function sheetNotice(code: SheetReadCode): string {
  switch (code) {
    case 'not-configured':
      return 'Plan diario: Google Sheets no está configurado.';
    case 'auth-error':
      return 'Plan diario: no se pudo autenticar Google Sheets.';
    case 'permission-error':
      return 'Plan diario: la cuenta no tiene permiso para leer la pestaña.';
    case 'missing-tab':
      return 'Plan diario: la pestaña Daily Planning no está disponible.';
    default:
      return 'Plan diario: no se pudo leer la fuente.';
  }
}

function unavailableSnapshot(code: SheetReadCode): DailyPlanSnapshotRead {
  return {
    status: 'unavailable',
    snapshot: null,
    notice: sheetNotice(code),
    invalidRows: 0,
  };
}

export const getDailyPlanningView = cache(async () => {
  await requireAuthorizedSession();
  const [context, tab] = await Promise.all([
    loadDailyPlanningContextUncached(),
    readTabValues(DAILY_PLAN_TAB),
  ]);
  const snapshot = tab.ok
    ? selectLatestDailyPlanSnapshot(tab.values, context.targetDate)
    : unavailableSnapshot(tab.code);
  return buildDailyPlanningView(context, snapshot);
});
