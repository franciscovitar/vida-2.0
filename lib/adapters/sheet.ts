/**
 * Compone `TodayData` a partir de las filas crudas del Sheet DEV.
 *
 * La fecha objetivo es siempre "hoy" (Argentina). Cada sección usa solo la fila
 * de esa fecha: no se sustituye silenciosamente un día anterior (p. ej. salud
 * del 18 cuando el encabezado dice 20).
 */
import type { MetricView, TodayData } from '@/types';

import { todayNotionPlaceholders } from '../data/combine-hoy';
import { formatDuration } from '../format';
import { formatArgentineFullDate, hourInBuenosAires } from './dates';
import {
  buildHabitViews,
  buildProductivityView,
  buildWeeklyGoals,
  DASHBOARD_HABITS,
  parseRegistroDiario,
  registroHasData,
  type RegistroRecord,
} from './registro-diario';
import {
  buildHealthView,
  buildSleepHoursMetric,
  parseImportStatus,
  parseSalud,
  saludHasData,
  type SaludRecord,
} from './salud';
import { capitalize, greetingForHour, noDataMetric } from './views';

function availableDays<T extends { date: string | null }>(
  records: readonly T[],
  today: string,
  hasData: (record: T) => boolean,
): T[] {
  return records
    .filter((record) => record.date !== null && record.date <= today && hasData(record))
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));
}

/** Día anterior disponible (solo para deltas/tendencias, no para valores actuales). */
function previousBefore<T extends { date: string | null }>(
  available: readonly T[],
  today: string,
): T | null {
  const before = available.filter((record) => (record.date as string) < today);
  return before.length > 0 ? before[before.length - 1] : null;
}

export interface SheetTodayResult {
  data: TodayData;
  hasData: boolean;
}

export function buildSheetToday(
  registroValues: readonly unknown[][],
  saludValues: readonly unknown[][],
  today: string,
  now: Date = new Date(),
): SheetTodayResult {
  const allRegistro = parseRegistroDiario(registroValues);
  const allSalud = parseSalud(saludValues);

  const registroAvailable = availableDays(allRegistro, today, registroHasData);
  const saludAvailable = availableDays(allSalud, today, saludHasData);

  /** Fila civil de hoy (aunque solo tenga false/vacíos); nunca un día anterior. */
  const todayRegistroRow = allRegistro.find((record) => record.date === today) ?? null;
  const todaySaludRow = allSalud.find((record) => record.date === today) ?? null;

  const todayRegistro =
    todayRegistroRow && registroHasData(todayRegistroRow) ? todayRegistroRow : null;
  const todaySalud = todaySaludRow && saludHasData(todaySaludRow) ? todaySaludRow : null;

  const prevRegistro = previousBefore<RegistroRecord>(registroAvailable, today);
  const prevSalud = todaySalud ? previousBefore<SaludRecord>(saludAvailable, today) : null;

  const importKind = todaySalud ? parseImportStatus(todaySalud.importStatus) : 'none';
  const healthEmptyContext = importKind === 'partial' ? 'importación parcial' : 'sin registro';

  // Hábitos: siempre la fila del día objetivo (false/vacío editable → pending).
  const rowExists = todayRegistroRow !== null;
  const habits = buildHabitViews(todayRegistroRow, registroAvailable, rowExists);
  const doneHabits = habits.filter((habit) => habit.status === 'done').length;
  const totalHabits = DASHBOARD_HABITS.length;

  const summaryHabits: MetricView = todayRegistroRow
    ? {
        value: `${doneHabits}/${totalHabits}`,
        context: 'completados hoy',
        status: doneHabits >= totalHabits - 1 ? 'good' : 'warning',
      }
    : noDataMetric();

  const workCell = todayRegistro?.work;
  const facultyCell = todayRegistro?.faculty;
  const energyCell = todayRegistro?.energy;

  const summaryWork: MetricView =
    workCell && workCell.kind === 'value'
      ? { value: formatDuration(workCell.value), context: 'registrado hoy', status: 'neutral' }
      : noDataMetric();
  const summaryFaculty: MetricView =
    facultyCell && facultyCell.kind === 'value'
      ? { value: formatDuration(facultyCell.value), context: 'registrado hoy', status: 'neutral' }
      : noDataMetric();
  const summaryEnergy: MetricView =
    energyCell && energyCell.kind === 'value'
      ? {
          value: `${energyCell.value}/5`,
          context: 'autoevaluación',
          status: energyCell.value >= 4 ? 'good' : 'warning',
        }
      : noDataMetric();

  const hasRegistro = todayRegistro !== null;
  const hasHealth = todaySalud !== null;
  const hasData = hasRegistro || hasHealth;

  let notice: string | null = null;
  if (hasRegistro && !hasHealth) {
    notice = 'Salud de hoy sin datos. Hábitos y productividad corresponden al día de hoy.';
  } else if (hasRegistro && hasHealth && importKind === 'partial') {
    notice = 'Importación de salud parcial para hoy.';
  }

  return {
    hasData,
    data: {
      source: 'google',
      status: hasData ? 'ready' : 'no-data',
      notice,
      targetDate: today,
      rowExists,
      writable: true,
      registroDate: todayRegistro?.date ?? null,
      healthDate: todaySalud?.date ?? null,
      header: {
        fullDate: capitalize(formatArgentineFullDate(today)),
        greeting: greetingForHour(hourInBuenosAires(now)),
        syncOk: hasData,
        syncLabel: hasData ? 'Datos del Sheet DEV' : 'Sheet DEV sin datos del día',
      },
      summary: {
        habits: summaryHabits,
        sleep: buildSleepHoursMetric(todaySalud, prevSalud, healthEmptyContext),
        work: summaryWork,
        faculty: summaryFaculty,
        energy: summaryEnergy,
      },
      health: buildHealthView(todaySalud, prevSalud, healthEmptyContext),
      productivity: buildProductivityView(todayRegistro, prevRegistro),
      habits,
      weekly: buildWeeklyGoals(registroAvailable, today),
      ...todayNotionPlaceholders(),
    },
  };
}
