import 'server-only';

import { cache } from 'react';

import { requireAuthorizedSession } from '@/lib/auth/dal';
import { selectLatestAssessmentProgressSnapshots } from '@/lib/assessment-progress/snapshot';
import { readTabValues } from '@/lib/google/sheets-read';
import type { SheetReadCode } from '@/lib/google/errors';
import type { AssessmentProgressRead } from '@/types/assessment-progress';

export const ASSESSMENT_PROGRESS_TAB = 'Assessment Progress';

function sheetNotice(code: SheetReadCode): string {
  switch (code) {
    case 'not-configured':
      return 'Progreso académico: Google Sheets no está configurado.';
    case 'auth-error':
      return 'Progreso académico: no se pudo autenticar Google Sheets.';
    case 'permission-error':
      return 'Progreso académico: la cuenta no tiene permiso para leer la pestaña.';
    case 'missing-tab':
      return 'Progreso académico: la pestaña Assessment Progress no está disponible.';
    default:
      return 'Progreso académico: no se pudo leer la fuente.';
  }
}

export function unavailableAssessmentProgress(code: SheetReadCode): AssessmentProgressRead {
  return {
    status: 'unavailable',
    snapshots: [],
    notice: sheetNotice(code),
    invalidRows: 0,
  };
}

export async function loadAssessmentProgressUncached(): Promise<AssessmentProgressRead> {
  const tab = await readTabValues(ASSESSMENT_PROGRESS_TAB);
  return tab.ok
    ? selectLatestAssessmentProgressSnapshots(tab.values)
    : unavailableAssessmentProgress(tab.code);
}

export const getAssessmentProgress = cache(async (): Promise<AssessmentProgressRead> => {
  await requireAuthorizedSession();
  return loadAssessmentProgressUncached();
});
