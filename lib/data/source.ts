/**
 * Proveedor de datos de la vista Hoy.
 *
 * Combina Google Sheets DEV (hábitos / salud / productividad) con Notion
 * (tareas / proyectos). Un fallo de una fuente no tumba a la otra.
 *
 * Todo lo que sale de `getTodayData` es un objeto plano serializable.
 */
import { cache } from 'react';

import type { TodayData, TodayStatus } from '@/types';

import { buildMockToday } from '../adapters/mock';
import { buildSheetToday } from '../adapters/sheet';
import { todayInBuenosAires } from '../adapters/dates';
import { hoyNotionFromDashboard, hoyNotionUnavailable, mergeTodayWithNotion } from './combine-hoy';
import { toPlainTodayData } from './plain';
import { isMissingHeaderCode, type ReadTabResult, type SheetReadCode } from '../google/errors';
import { REGISTRO_DIARIO_TAB, SALUD_TAB } from '../google/constants';
import { loadNotionDashboard } from '../notion/dashboard';
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

/** Convierte resultados de lectura del Sheet en TodayData plano (exportado para pruebas). */
export function buildTodayFromGoogleResults(
  registroResult: ReadTabResult,
  saludResult: ReadTabResult,
  today: string = todayInBuenosAires(),
): TodayData {
  return toPlainTodayData(loadSheetTodayOnly(registroResult, saludResult, today));
}

/** Absorbe un fallo inesperado sin propagar objetos de googleapis (exportado para pruebas). */
export function absorbGoogleFetchFailure(error: unknown): TodayData {
  if (isMissingHeaderCode(error)) {
    return toPlainTodayData(sheetFallback('missing-header'));
  }
  return toPlainTodayData(sheetFallback('read-error'));
}

async function loadSheetBranch(): Promise<TodayData> {
  if (getDataSource() !== 'google') {
    return buildMockToday();
  }

  if (!getGoogleConfig().ok) {
    return sheetFallback('not-configured');
  }

  try {
    const { readTabValues } = await import('../google/sheets-read');
    const [registroResult, saludResult] = await Promise.all([
      readTabValues(REGISTRO_DIARIO_TAB),
      readTabValues(SALUD_TAB),
    ]);
    return loadSheetTodayOnly(registroResult, saludResult);
  } catch (error) {
    if (isMissingHeaderCode(error)) {
      return sheetFallback('missing-header');
    }
    return sheetFallback('read-error');
  }
}

async function loadNotionBranch() {
  try {
    const dashboard = await loadNotionDashboard();
    return hoyNotionFromDashboard(dashboard);
  } catch {
    return hoyNotionUnavailable('No se pudo leer Notion. El resto de Hoy sigue disponible.');
  }
}

async function loadTodayData(): Promise<TodayData> {
  const [sheetToday, notionView] = await Promise.all([loadSheetBranch(), loadNotionBranch()]);
  return toPlainTodayData(mergeTodayWithNotion(sheetToday, notionView));
}

/** Una sola composición por request (layout + página Hoy comparten el resultado). */
export const getTodayData = cache(loadTodayData);
