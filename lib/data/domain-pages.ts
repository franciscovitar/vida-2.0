/**
 * Carga agregada de páginas de dominio (Hábitos / Salud / Productividad)
 * y análisis Fase 3B (Tendencias / Análisis IA).
 * Una sola lectura de ambas pestañas por request (React cache).
 */
import { cache } from 'react';
import 'server-only';

import { buildAnalysisReport } from '@/lib/adapters/analysis-report';
import { todayInBuenosAires } from '@/lib/adapters/dates';
import { buildHabitsPageData } from '@/lib/adapters/habits-period';
import { buildMockToday } from '@/lib/adapters/mock';
import { buildProductivityPageData } from '@/lib/adapters/productivity-period';
import {
  buildHabitViews,
  buildWeeklyGoals,
  parseRegistroDiario,
  registroHasData,
  type RegistroRecord,
} from '@/lib/adapters/registro-diario';
import { buildHealthPageData } from '@/lib/adapters/salud-period';
import { parseSalud, saludHasData, type SaludRecord } from '@/lib/adapters/salud';
import { buildSheetToday } from '@/lib/adapters/sheet';
import { buildTrendsPageData } from '@/lib/adapters/trends';
import { getDataSource, getGoogleConfig } from '@/lib/data/config';
import { toPlainTodayData } from '@/lib/data/plain';
import { REGISTRO_DIARIO_TAB, SALUD_TAB } from '@/lib/google/constants';
import { isMissingHeaderCode, type ReadTabResult, type SheetReadCode } from '@/lib/google/errors';
import { periodWindow, type PeriodDays } from '@/lib/periods';
import type { HabitsPageData, HealthPageData, ProductivityPageData } from '@/types/domain-pages';
import type { AnalysisReport, TrendsPageData } from '@/types/trends';
import type { TodayData, TodayStatus } from '@/types';

import { buildMockDomainRecords } from '@/lib/mock-data/domain-history';

const NOTICES: Record<Exclude<TodayStatus, 'mock' | 'ready'>, string> = {
  'not-configured': 'Integración con el Sheet DEV no configurada. Mostrando datos simulados.',
  'auth-error': 'No se pudo autenticar con Google. Mostrando datos simulados.',
  'permission-error': 'Sin permiso de lectura en el Sheet DEV. Mostrando datos simulados.',
  'missing-tab': 'Falta una pestaña esperada en el Sheet DEV. Mostrando datos simulados.',
  'missing-header': 'Faltan encabezados en el Sheet DEV. Mostrando datos simulados.',
  'no-data': 'Sin datos disponibles para hoy en el Sheet DEV.',
  'read-error': 'No se pudieron leer los datos del Sheet DEV. Mostrando datos simulados.',
};

export interface DomainPagesBundle {
  today: TodayData;
  habits: HabitsPageData;
  health: HealthPageData;
  productivity: ProductivityPageData;
  trends: TrendsPageData;
  analysis: AnalysisReport;
}

function composeFromRecords(
  registro: readonly RegistroRecord[],
  salud: readonly SaludRecord[],
  today: string,
  periodDays: PeriodDays,
  meta: {
    source: 'mock' | 'google';
    status: TodayStatus;
    notice: string | null;
    writable: boolean;
  },
): DomainPagesBundle {
  const window = periodWindow(today, periodDays);
  const registroAvailable = registro
    .filter((r) => r.date && r.date <= today && registroHasData(r))
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));
  const todayRegistro = registro.find((r) => r.date === today) ?? null;
  const rowExists = todayRegistro !== null;
  const todayHabits = buildHabitViews(todayRegistro, registroAvailable, rowExists);
  const todayWeekly = buildWeeklyGoals(registroAvailable, today);

  const mockBase = buildMockToday();
  const todayData: TodayData = {
    ...mockBase,
    source: meta.source,
    status: meta.status,
    notice: meta.notice,
    targetDate: today,
    rowExists,
    writable: meta.writable,
    registroDate: todayRegistro && registroHasData(todayRegistro) ? today : null,
    healthDate: salud.find((r) => r.date === today && saludHasData(r))?.date ?? null,
    habits: todayHabits,
    weekly: todayWeekly,
    sources: mockBase.sources,
    notion: mockBase.notion,
    calendar: mockBase.calendar,
  };

  const habits = buildHabitsPageData({
    records: registro,
    today,
    window,
    todayHabits,
    todayWeekly,
    rowExists,
    writable: meta.writable,
    source: meta.source,
    status: meta.status,
    notice: meta.notice,
  });
  const health = buildHealthPageData({
    records: salud,
    today,
    window,
    source: meta.source,
    status: meta.status,
    notice: meta.notice,
  });
  const productivity = buildProductivityPageData({
    records: registro,
    today,
    window,
    source: meta.source,
    status: meta.status,
    notice: meta.notice,
  });
  const trends = buildTrendsPageData({
    registro,
    salud,
    today,
    window,
    source: meta.source,
    status: meta.status,
    notice: meta.notice,
  });
  const analysis = buildAnalysisReport({ trends, habits, health, productivity });

  return {
    today: toPlainTodayData(todayData),
    habits,
    health,
    productivity,
    trends,
    analysis,
  };
}

function fromSheetValues(
  registroValues: unknown[][],
  saludValues: unknown[][],
  today: string,
  periodDays: PeriodDays,
): DomainPagesBundle {
  const registro = parseRegistroDiario(registroValues);
  const salud = parseSalud(saludValues);
  const { data, hasData } = buildSheetToday(registroValues, saludValues, today);
  const notice = !hasData ? (data.notice ?? NOTICES['no-data']) : data.notice;
  return composeFromRecords(registro, salud, today, periodDays, {
    source: 'google',
    status: data.status,
    notice,
    writable: true,
  });
}

function fallbackBundle(
  status: Exclude<TodayStatus, 'mock' | 'ready'>,
  periodDays: PeriodDays,
  today: string,
): DomainPagesBundle {
  const mock = buildMockDomainRecords(today);
  return composeFromRecords(mock.registro, mock.salud, today, periodDays, {
    source: 'google',
    status,
    notice: NOTICES[status],
    writable: false,
  });
}

function mapCode(code: SheetReadCode): Exclude<TodayStatus, 'mock' | 'ready' | 'no-data'> {
  return code;
}

export function buildDomainPagesFromGoogleResults(
  registroResult: ReadTabResult,
  saludResult: ReadTabResult,
  periodDays: PeriodDays,
  today: string = todayInBuenosAires(),
): DomainPagesBundle {
  if (!registroResult.ok) return fallbackBundle(mapCode(registroResult.code), periodDays, today);
  if (!saludResult.ok) return fallbackBundle(mapCode(saludResult.code), periodDays, today);
  try {
    return fromSheetValues(registroResult.values, saludResult.values, today, periodDays);
  } catch (error) {
    if (isMissingHeaderCode(error)) return fallbackBundle('missing-header', periodDays, today);
    return fallbackBundle('read-error', periodDays, today);
  }
}

async function loadDomainPages(periodDays: PeriodDays): Promise<DomainPagesBundle> {
  const { requireAuthorizedSession } = await import('@/lib/auth/dal');
  await requireAuthorizedSession();

  const today = todayInBuenosAires();

  if (getDataSource() !== 'google') {
    const mock = buildMockDomainRecords(today);
    return composeFromRecords(mock.registro, mock.salud, today, periodDays, {
      source: 'mock',
      status: 'mock',
      notice: null,
      writable: false,
    });
  }

  if (!getGoogleConfig().ok) {
    return fallbackBundle('not-configured', periodDays, today);
  }

  try {
    const { readTabValues } = await import('../google/sheets-read');
    const [registroResult, saludResult] = await Promise.all([
      readTabValues(REGISTRO_DIARIO_TAB),
      readTabValues(SALUD_TAB),
    ]);
    return buildDomainPagesFromGoogleResults(registroResult, saludResult, periodDays, today);
  } catch (error) {
    if (isMissingHeaderCode(error)) return fallbackBundle('missing-header', periodDays, today);
    return fallbackBundle('read-error', periodDays, today);
  }
}

/** Cache por período dentro del request. */
export const getDomainPages = cache(loadDomainPages);
