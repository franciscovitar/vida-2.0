/**
 * Agregaciones de salud para un período.
 */
import { compareTotals } from '@/lib/adapters/compare';
import type { Cell } from '@/lib/adapters/cells';
import { addDaysYmd, formatShortDay, isFutureDate } from '@/lib/adapters/dates';
import { parseImportStatus, saludHasData, type SaludRecord } from '@/lib/adapters/salud';
import { formatNumber, minutesToHours } from '@/lib/format';
import type { PeriodWindow } from '@/lib/periods';
import { inPeriod, previousPeriodWindow } from '@/lib/periods';
import type {
  HealthDayRow,
  HealthImportKind,
  HealthMetricPeriod,
  HealthPageData,
  HealthTodayState,
} from '@/types/domain-pages';
import type { Domain, TodayStatus } from '@/types';

type NumericPicker = (record: SaludRecord) => Cell<number>;

const METRICS: {
  id: string;
  label: string;
  unit: string;
  domain: Domain;
  pick: NumericPicker;
  formatAvg: (value: number) => string;
}[] = [
  {
    id: 'sleep',
    label: 'Sueño promedio',
    unit: 'h',
    domain: 'health',
    pick: (r) => r.sleepHours,
    formatAvg: (v) => String(Math.round(v * 10) / 10),
  },
  {
    id: 'deep',
    label: 'Sueño profundo',
    unit: 'h',
    domain: 'health',
    pick: (r) => r.deepSleepHours,
    formatAvg: (v) => String(Math.round(v * 10) / 10),
  },
  {
    id: 'rem',
    label: 'Sueño REM',
    unit: 'h',
    domain: 'health',
    pick: (r) => r.remSleepHours,
    formatAvg: (v) => String(Math.round(v * 10) / 10),
  },
  {
    id: 'steps',
    label: 'Pasos',
    unit: '',
    domain: 'health',
    pick: (r) => r.steps,
    formatAvg: (v) => formatNumber(Math.round(v)),
  },
  {
    id: 'calories',
    label: 'Calorías activas',
    unit: 'kcal',
    domain: 'health',
    pick: (r) => r.activeCalories,
    formatAvg: (v) => formatNumber(Math.round(v)),
  },
  {
    id: 'restingHr',
    label: 'FC en reposo',
    unit: 'ppm',
    domain: 'health',
    pick: (r) => r.restingHr,
    formatAvg: (v) => String(Math.round(v)),
  },
  {
    id: 'meanHr',
    label: 'FC media',
    unit: 'ppm',
    domain: 'health',
    pick: (r) => r.meanHr,
    formatAvg: (v) => String(Math.round(v)),
  },
  {
    id: 'hrv',
    label: 'HRV',
    unit: 'ms',
    domain: 'health',
    pick: (r) => r.hrv,
    formatAvg: (v) => String(Math.round(v)),
  },
];

export function saludAvailableDays(
  records: readonly SaludRecord[],
  window: PeriodWindow,
): SaludRecord[] {
  return records
    .filter(
      (record) =>
        record.date !== null &&
        inPeriod(record.date, window) &&
        !isFutureDate(record.date, window.end) &&
        saludHasData(record),
    )
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));
}

function averageOf(
  available: readonly SaludRecord[],
  pick: NumericPicker,
): { average: number | null; values: number[] } {
  const values: number[] = [];
  for (const record of available) {
    const cell = pick(record);
    if (cell.kind === 'value') values.push(cell.value);
  }
  if (values.length === 0) return { average: null, values };
  return {
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    values,
  };
}

function seriesOf(
  map: Map<string, SaludRecord>,
  window: PeriodWindow,
  availableSet: Set<string>,
  pick: NumericPicker,
): (number | null)[] {
  const out: (number | null)[] = [];
  let cursor = window.start;
  while (cursor <= window.end) {
    const record = map.get(cursor);
    if (!record || !availableSet.has(cursor)) out.push(null);
    else {
      const cell = pick(record);
      out.push(cell.kind === 'value' ? cell.value : null);
    }
    cursor = addDaysYmd(cursor, 1);
  }
  return out;
}

function cellLabel(cell: Cell<number>, formatter: (n: number) => string): string {
  if (cell.kind !== 'value') return '—';
  return formatter(cell.value);
}

function todayState(record: SaludRecord | undefined, today: string): HealthTodayState {
  if (!record || !saludHasData(record)) {
    return { kind: 'missing', date: null, label: `Sin datos · ${formatShortDay(today)}` };
  }
  const kind = parseImportStatus(record.importStatus);
  const importKind: HealthImportKind = kind === 'none' ? 'complete' : kind;
  const label =
    importKind === 'partial'
      ? `Importación parcial · ${formatShortDay(record.date as string)}`
      : `Datos del día · ${formatShortDay(record.date as string)}`;
  return { kind: importKind, date: record.date, label };
}

export function buildHealthPageData(input: {
  records: readonly SaludRecord[];
  today: string;
  window: PeriodWindow;
  source: 'mock' | 'google';
  status: TodayStatus;
  notice: string | null;
}): HealthPageData {
  const map = new Map<string, SaludRecord>();
  for (const record of input.records) {
    if (record.date) map.set(record.date, record);
  }
  const available = saludAvailableDays(input.records, input.window);
  const availableSet = new Set(available.map((r) => r.date as string));
  const prev = saludAvailableDays(input.records, previousPeriodWindow(input.window));

  const metrics: HealthMetricPeriod[] = METRICS.map((def) => {
    const current = averageOf(available, def.pick);
    const previous = averageOf(prev, def.pick);
    return {
      id: def.id,
      label: def.label,
      unit: def.unit,
      domain: def.domain,
      average: current.average,
      averageLabel: current.average === null ? 'Sin datos' : def.formatAvg(current.average),
      series: seriesOf(map, input.window, availableSet, def.pick),
      compare: compareTotals(
        current.average ?? 0,
        previous.average === null && current.average === null ? null : previous.average,
      ),
    };
  }).filter((metric) => {
    // Mostrar HRV solo si hay al menos un valor en el período o el anterior.
    if (metric.id !== 'hrv') return true;
    return metric.average !== null || metric.compare.available;
  });

  // Si HRV nunca apareció, aún así incluirlo con Sin datos (usuario pidió HRV cuando exista).
  // Filter above removes only when no data ever - actually user said "HRV cuando exista".
  // Keep filter.

  const history: HealthDayRow[] = available
    .slice()
    .reverse()
    .map((record) => {
      const importKind = parseImportStatus(record.importStatus);
      return {
        date: record.date as string,
        label: formatShortDay(record.date as string),
        sleep: cellLabel(record.sleepHours, (v) => `${minutesToHours(v * 60)} h`),
        steps: cellLabel(record.steps, (v) => formatNumber(v)),
        restingHr: cellLabel(record.restingHr, (v) => String(Math.round(v))),
        importKind: importKind === 'none' ? 'complete' : importKind,
        workout:
          record.workout.kind === 'value' && record.workout.value.trim() !== ''
            ? record.workout.value
            : '—',
      };
    });

  // Fix sleep display: sleepHours is already in hours, not minutes.
  for (const row of history) {
    const record = map.get(row.date);
    if (record && record.sleepHours.kind === 'value') {
      row.sleep = `${Math.round(record.sleepHours.value * 10) / 10} h`;
    }
  }

  return {
    source: input.source,
    status: input.status,
    notice: input.notice,
    targetDate: input.today,
    periodDays: input.window.days,
    periodStart: input.window.start,
    periodEnd: input.window.end,
    availableDays: available.length,
    previousAvailableDays: prev.length,
    metrics,
    today: todayState(map.get(input.today), input.today),
    history,
  };
}
