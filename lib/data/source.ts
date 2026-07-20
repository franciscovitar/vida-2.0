/**
 * Proveedor de datos de la vista Hoy.
 *
 * - `DATA_SOURCE=mock` (o sin definir): datos simulados.
 * - `DATA_SOURCE=google`: datos reales del Sheet DEV (solo lectura).
 *
 * Todo lo que sale de `getTodayData` es un objeto plano serializable.
 */
import { cache } from 'react';

import type { TodayData, TodayStatus } from '@/types';

import { buildMockToday } from '../adapters/mock';
import { buildSheetToday } from '../adapters/sheet';
import { todayInBuenosAires } from '../adapters/dates';
import { toPlainTodayData } from './plain';
import { isMissingHeaderCode, type ReadTabResult, type SheetReadCode } from '../google/errors';
import { REGISTRO_DIARIO_TAB, SALUD_TAB } from '../google/constants';
import { getDataSource, getGoogleConfig } from './config';

const NOTICES: Record<Exclude<TodayStatus, 'mock' | 'ready'>, string> = {
  'not-configured': 'Integración con el Sheet DEV no configurada. Mostrando datos simulados.',
  'auth-error': 'No se pudo autenticar con Google. Mostrando datos simulados.',
  'permission-error': 'Sin permiso de lectura en el Sheet DEV. Mostrando datos simulados.',
  'missing-tab': 'Falta una pestaña esperada en el Sheet DEV. Mostrando datos simulados.',
  'missing-header': 'Faltan encabezados en el Sheet DEV. Mostrando datos simulados.',
  'no-data': 'Sin datos disponibles para hoy en el Sheet DEV.',
  'read-error': 'No se pudieron leer los datos del Sheet DEV. Mostrando datos simulados.',
};

function fallbackWithNotice(status: Exclude<TodayStatus, 'mock' | 'ready'>): TodayData {
  const mock = buildMockToday();
  return toPlainTodayData({
    ...mock,
    source: 'google',
    status,
    notice: NOTICES[status],
    header: { ...mock.header, syncOk: false, syncLabel: 'Integración parcial' },
  });
}

function mapSheetReadCode(code: SheetReadCode): Exclude<TodayStatus, 'mock' | 'ready' | 'no-data'> {
  return code;
}

/** Convierte resultados de lectura del Sheet en TodayData plano (exportado para pruebas). */
export function buildTodayFromGoogleResults(
  registroResult: ReadTabResult,
  saludResult: ReadTabResult,
  today: string = todayInBuenosAires(),
): TodayData {
  if (!registroResult.ok) {
    return fallbackWithNotice(mapSheetReadCode(registroResult.code));
  }
  if (!saludResult.ok) {
    return fallbackWithNotice(mapSheetReadCode(saludResult.code));
  }

  try {
    const { data, hasData } = buildSheetToday(registroResult.values, saludResult.values, today);

    if (!hasData) {
      return toPlainTodayData({
        ...data,
        notice: data.notice ?? NOTICES['no-data'],
      });
    }

    return toPlainTodayData(data);
  } catch (error) {
    if (isMissingHeaderCode(error)) {
      return fallbackWithNotice('missing-header');
    }
    return fallbackWithNotice('read-error');
  }
}

/** Absorbe un fallo inesperado sin propagar objetos de googleapis (exportado para pruebas). */
export function absorbGoogleFetchFailure(error: unknown): TodayData {
  if (isMissingHeaderCode(error)) {
    return fallbackWithNotice('missing-header');
  }
  return fallbackWithNotice('read-error');
}

async function loadTodayData(): Promise<TodayData> {
  if (getDataSource() !== 'google') {
    return toPlainTodayData(buildMockToday());
  }

  if (!getGoogleConfig().ok) {
    return fallbackWithNotice('not-configured');
  }

  try {
    const { readTabValues } = await import('../google/sheets-read');
    const [registroResult, saludResult] = await Promise.all([
      readTabValues(REGISTRO_DIARIO_TAB),
      readTabValues(SALUD_TAB),
    ]);
    return buildTodayFromGoogleResults(registroResult, saludResult);
  } catch (error) {
    return absorbGoogleFetchFailure(error);
  }
}

/** Una sola lectura por request (layout + página Hoy comparten el resultado). */
export const getTodayData = cache(loadTodayData);
