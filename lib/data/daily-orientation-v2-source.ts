import 'server-only';

import { cache } from 'react';

import { todayInBuenosAires } from '@/lib/adapters/dates';
import { requireAuthorizedSession } from '@/lib/auth/dal';
import { buildMinimalOrientationView } from '@/lib/daily-planning/minimal-orientation-view';
import { selectLatestDailyOrientationSnapshot } from '@/lib/daily-planning/orientation-v2';
import { readTabValues } from '@/lib/google/sheets-read';
import type { SheetReadCode } from '@/lib/google/errors';
import type { DailyOrientationSnapshotRead } from '@/types/daily-orientation-v2';

const DAILY_PLAN_TAB = 'Daily Planning';

function unavailable(code: SheetReadCode): DailyOrientationSnapshotRead {
  const notice =
    code === 'not-configured'
      ? 'Orientación diaria: Google Sheets no está configurado.'
      : code === 'auth-error'
        ? 'Orientación diaria: no se pudo autenticar Google Sheets.'
        : code === 'permission-error'
          ? 'Orientación diaria: no hay permiso para leer Daily Planning.'
          : code === 'missing-tab'
            ? 'Orientación diaria: la pestaña Daily Planning no está disponible.'
            : 'Orientación diaria: no se pudo leer la fuente.';

  return { status: 'unavailable', snapshot: null, notice, invalidRows: 0 };
}

export const getDailyOrientationV2View = cache(async () => {
  await requireAuthorizedSession();
  const date = todayInBuenosAires();
  // Nothing else: no Calendar, Notion, project, university or health fetch.
  // Those inputs are checked by ChatGPT BEFORE publishing the snapshot.
  const tab = await readTabValues(DAILY_PLAN_TAB);
  const read = tab.ok
    ? selectLatestDailyOrientationSnapshot(tab.values, date)
    : unavailable(tab.code);
  return buildMinimalOrientationView(read, date);
});
