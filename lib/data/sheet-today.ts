/**
 * Construcción plana de TodayData desde lecturas de Sheet (sin I/O ni server-only).
 */
import type { TodayData, TodayStatus } from '@/types';

import { buildMockToday } from '@/lib/adapters/mock';
import { buildSheetToday } from '@/lib/adapters/sheet';
import { todayInBuenosAires } from '@/lib/adapters/dates';
import { toPlainTodayData } from '@/lib/data/plain';
import { isMissingHeaderCode, type ReadTabResult, type SheetReadCode } from '@/lib/google/errors';

const NOTICES: Record<Exclude<TodayStatus, 'mock' | 'ready'>, string> = {
  'not-configured': 'Integración con el Sheet DEV no configurada. Mostrando datos simulados.',
  'auth-error': 'No se pudo autenticar con Google. Mostrando datos simulados.',
  'permission-error': 'Sin permiso de lectura en el Sheet DEV. Mostrando datos simulados.',
  'missing-tab': 'Falta una pestaña esperada en el Sheet DEV. Mostrando datos simulados.',
  'missing-header': 'Faltan encabezados en el Sheet DEV. Mostrando datos simulados.',
  'no-data': 'Sin datos disponibles para hoy en el Sheet DEV.',
  'read-error': 'No se pudieron leer los datos del Sheet DEV. Mostrando datos simulados.',
};

function sheetFallback(status: Exclude<TodayStatus, 'mock' | 'ready'>): TodayData {
  const mock = buildMockToday();
  return {
    ...mock,
    source: 'google',
    status,
    notice: NOTICES[status],
    header: { ...mock.header, syncOk: false, syncLabel: 'Integración parcial' },
  };
}

function mapSheetReadCode(code: SheetReadCode): Exclude<TodayStatus, 'mock' | 'ready' | 'no-data'> {
  return code;
}

function loadSheetTodayOnly(
  registroResult: ReadTabResult,
  saludResult: ReadTabResult,
  today: string = todayInBuenosAires(),
): TodayData {
  if (!registroResult.ok) {
    return sheetFallback(mapSheetReadCode(registroResult.code));
  }
  if (!saludResult.ok) {
    return sheetFallback(mapSheetReadCode(saludResult.code));
  }

  try {
    const { data, hasData } = buildSheetToday(registroResult.values, saludResult.values, today);

    if (!hasData) {
      return {
        ...data,
        notice: data.notice ?? NOTICES['no-data'],
      };
    }

    return data;
  } catch (error) {
    if (isMissingHeaderCode(error)) {
      return sheetFallback('missing-header');
    }
    return sheetFallback('read-error');
  }
}

/** Convierte resultados de lectura del Sheet en TodayData plano. */
export function buildTodayFromGoogleResults(
  registroResult: ReadTabResult,
  saludResult: ReadTabResult,
  today: string = todayInBuenosAires(),
): TodayData {
  return toPlainTodayData(loadSheetTodayOnly(registroResult, saludResult, today));
}

/** Absorbe un fallo inesperado sin propagar objetos de googleapis. */
export function absorbGoogleFetchFailure(error: unknown): TodayData {
  if (isMissingHeaderCode(error)) {
    return toPlainTodayData(sheetFallback('missing-header'));
  }
  return toPlainTodayData(sheetFallback('read-error'));
}
