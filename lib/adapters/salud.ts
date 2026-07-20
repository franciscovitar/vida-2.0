/**
 * Adapter de la pestaña "Salud y experimentos".
 *
 * Parsea filas a registros tipados (conservando 0/false/vacío) y deriva la vista
 * de salud y sueño, comparando con el día anterior disponible.
 */
import type { HealthView, MetricView, Trend } from '@/types';

import { formatDuration, formatNumber, minutesToHours } from '../format';
import { SAL, SALUD_HEADERS, SALUD_TAB } from '../google/constants';
import { buildHeaderIndex, columnIndex, requireHeaders } from '../validation/headers';
import { toNumber, toText, rawCell, type Cell } from './cells';
import { parseSheetDate } from './dates';
import { noDataMetric } from './views';

export interface SaludRecord {
  date: string | null;
  sleepHours: Cell<number>;
  hrv: Cell<number>;
  restingHr: Cell<number>;
  meanHr: Cell<number>;
  steps: Cell<number>;
  activeCalories: Cell<number>;
  workout: Cell<string>;
  deepSleepHours: Cell<number>;
  remSleepHours: Cell<number>;
  walkRunKm: Cell<number>;
  minHr: Cell<number>;
  maxHr: Cell<number>;
  spo2: Cell<number>;
  importStatus: Cell<string>;
}

/** Parsea las filas crudas de "Salud y experimentos" a registros tipados. */
export function parseSalud(values: readonly unknown[][]): SaludRecord[] {
  const header = values[0] ?? [];
  const index = buildHeaderIndex(header);
  requireHeaders(index, SALUD_HEADERS, SALUD_TAB);

  const num = (row: readonly unknown[], name: string): Cell<number> =>
    toNumber(rawCell(row, columnIndex(index, name, SALUD_TAB)));
  const text = (row: readonly unknown[], name: string): Cell<string> =>
    toText(rawCell(row, columnIndex(index, name, SALUD_TAB)));

  const records: SaludRecord[] = [];
  for (let r = 1; r < values.length; r += 1) {
    const row = values[r] ?? [];
    records.push({
      date: parseSheetDate(rawCell(row, columnIndex(index, SAL.fecha, SALUD_TAB))),
      sleepHours: num(row, SAL.sleep),
      hrv: num(row, SAL.hrv),
      restingHr: num(row, SAL.restingHr),
      meanHr: num(row, SAL.meanHr),
      steps: num(row, SAL.steps),
      activeCalories: num(row, SAL.activeCalories),
      workout: text(row, SAL.workout),
      deepSleepHours: num(row, SAL.deepSleep),
      remSleepHours: num(row, SAL.remSleep),
      walkRunKm: num(row, SAL.walkRunKm),
      minHr: num(row, SAL.minHr),
      maxHr: num(row, SAL.maxHr),
      spo2: num(row, SAL.spo2),
      importStatus: text(row, SAL.importStatus),
    });
  }
  return records;
}

/** Interpreta el estado de importación de Salud. */
export function parseImportStatus(cell: Cell<string>): 'partial' | 'complete' | 'none' {
  if (cell.kind !== 'value') return 'none';
  const text = cell.value.trim().toLowerCase();
  if (text === '') return 'none';
  if (/parcial/.test(text)) return 'partial';
  if (/completo|completa|\bok\b|importado|listo|done/.test(text)) return 'complete';
  return 'none';
}

/**
 * true si hay un registro de salud real para el día.
 * Incluye métricas numéricas (también 0), entrenamiento con texto,
 * o estado de importación parcial/completo.
 */
export function saludHasData(record: SaludRecord): boolean {
  const numeric: Cell<number>[] = [
    record.sleepHours,
    record.hrv,
    record.restingHr,
    record.meanHr,
    record.steps,
    record.activeCalories,
    record.deepSleepHours,
    record.remSleepHours,
    record.walkRunKm,
    record.minHr,
    record.maxHr,
    record.spo2,
  ];
  if (numeric.some((cell) => cell.kind === 'value')) return true;
  if (record.workout.kind === 'value' && record.workout.value.trim() !== '') return true;
  return parseImportStatus(record.importStatus) !== 'none';
}

function trendOf(current: Cell<number>, previous: Cell<number>): Trend | undefined {
  if (current.kind !== 'value' || previous.kind !== 'value') return undefined;
  if (current.value > previous.value) return 'up';
  if (current.value < previous.value) return 'down';
  return 'steady';
}

type Direction = 'more-better' | 'less-better' | 'neutral';

function contextFor(
  trend: Trend | undefined,
  direction: Direction,
): Pick<MetricView, 'context' | 'status'> {
  if (trend === undefined) return { context: 'primer registro con dato', status: 'neutral' };
  if (trend === 'steady') return { context: 'igual que el día anterior', status: 'neutral' };
  const up = trend === 'up';
  const text = up ? 'más que el día anterior' : 'menos que el día anterior';
  if (direction === 'neutral') return { context: text, status: 'neutral' };
  if (direction === 'more-better') {
    return { context: text, status: up ? 'good' : 'warning' };
  }
  // less-better (p. ej. FC en reposo).
  return {
    context: up ? 'más alta que el día anterior' : 'más baja que el día anterior',
    status: up ? 'warning' : 'good',
  };
}

/** MetricView de sueño en horas ("7,7 h") para el resumen diario. */
export function buildSleepHoursMetric(
  latest: SaludRecord | null,
  previous: SaludRecord | null,
  emptyContext = 'sin registro',
): MetricView {
  if (!latest || latest.sleepHours.kind !== 'value') return noDataMetric(emptyContext);
  const trend = trendOf(latest.sleepHours, previous?.sleepHours ?? { kind: 'empty' });
  const { context, status } = contextFor(trend, 'more-better');
  return {
    value: String(minutesToHours(Math.round(latest.sleepHours.value * 60))),
    unit: 'h',
    context,
    status,
    trend,
  };
}

/** Vista de salud y sueño (sueño total, profundo, FC reposo, pasos). Solo datos del día objetivo. */
export function buildHealthView(
  latest: SaludRecord | null,
  previous: SaludRecord | null,
  emptyContext = 'sin registro',
): HealthView {
  const prev = previous ?? null;

  const durationMetric = (
    current: Cell<number>,
    prior: Cell<number>,
    direction: Direction,
  ): MetricView => {
    if (current.kind !== 'value') return noDataMetric(emptyContext);
    const trend = trendOf(current, prior);
    const { context, status } = contextFor(trend, direction);
    return { value: formatDuration(Math.round(current.value * 60)), context, status, trend };
  };

  const sleep = latest
    ? durationMetric(latest.sleepHours, prev?.sleepHours ?? { kind: 'empty' }, 'more-better')
    : noDataMetric(emptyContext);
  const deepSleep = latest
    ? durationMetric(latest.deepSleepHours, prev?.deepSleepHours ?? { kind: 'empty' }, 'neutral')
    : noDataMetric(emptyContext);

  let restingHeartRate: MetricView = noDataMetric(emptyContext);
  if (latest && latest.restingHr.kind === 'value') {
    const trend = trendOf(latest.restingHr, prev?.restingHr ?? { kind: 'empty' });
    const { context, status } = contextFor(trend, 'less-better');
    restingHeartRate = {
      value: String(latest.restingHr.value),
      unit: 'ppm',
      context,
      status,
      trend,
    };
  }

  let steps: MetricView = noDataMetric(emptyContext);
  if (latest && latest.steps.kind === 'value') {
    const trend = trendOf(latest.steps, prev?.steps ?? { kind: 'empty' });
    const { context, status } = contextFor(trend, 'more-better');
    steps = { value: formatNumber(latest.steps.value), context, status, trend };
  }

  return { sleep, deepSleep, restingHeartRate, steps };
}
