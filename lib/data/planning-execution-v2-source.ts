import 'server-only';

import { cache } from 'react';

import { requireAuthorizedSession } from '@/lib/auth/dal';
import {
  selectPlanningExecutionV2Day,
  type ExecutionV2DayRead,
} from '@/lib/daily-planning/execution-history-v2';
import { isPlanningExecutionV2DevReadEnabled } from '@/lib/daily-planning/v2-config';
import { readTabValues } from '@/lib/google/sheets-read';
import type { SheetReadCode } from '@/lib/google/errors';

// Explicit bounded transport. Reaching the cap means we CANNOT claim all the
// entries have been checked. Do not silently select a stale partial history.
const RANGE = "'Planning Execution V2'!A1:Q5000";
const MAX_ROWS = 5000;

function unavailable(code: SheetReadCode): ExecutionV2DayRead {
  const notices: Record<SheetReadCode, string> = {
    'not-configured': 'Historial V2: fuente de Google Sheets sin configurar.',
    'auth-error': 'Historial V2: autenticación con Google no disponible.',
    'permission-error': 'Historial V2: faltan permisos de lectura.',
    'missing-tab': 'Historial V2: todavía no existe la pestaña autorizada.',
    'read-error': 'Historial V2: lectura fallida.',
  };
  return { status: 'unavailable', current: [], invalidRows: 0, notice: notices[code] };
}

/** Explicit internal-only read. Never pass the result as a public browser DTO. */
export const getPlanningExecutionV2Day = cache(
  async (targetDate: string): Promise<ExecutionV2DayRead> => {
    await requireAuthorizedSession();
    if (!isPlanningExecutionV2DevReadEnabled()) {
      return {
        status: 'unavailable',
        current: [],
        invalidRows: 0,
        notice: 'Historial V2: lectura DEV todavía desactivada.',
      };
    }
    const source = await readTabValues(RANGE);
    if (!source.ok) return unavailable(source.code);
    if (source.values.length >= MAX_ROWS) {
      return {
        status: 'unavailable',
        current: [],
        invalidRows: 0,
        notice: 'Historial V2: se alcanzó el límite de lectura segura.',
      };
    }
    return selectPlanningExecutionV2Day(source.values, targetDate);
  },
);
