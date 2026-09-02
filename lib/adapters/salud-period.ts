/**
 * Agregaciones de salud para un período.
 */
import { compareTotals, type PeriodCompare } from '@/lib/adapters/compare';
import type { Cell } from '@/lib/adapters/cells';
import { addDaysYmd, formatShortDay, isFutureDate } from '@/lib/adapters/dates';
import { parseImportStatus, saludHasData, type SaludRecord } from '@/lib/adapters/salud';
import { formatNumber } from '@/lib/format';
import type { PeriodWindow } from '@/lib/periods';
import { inPeriod, previousPeriodWindow } from '@/lib/periods';
import type {
  HealthDayRow,
  HealthImportKind,
  HealthMetricCategory,
  HealthMetricDirection,
  HealthMetricPeriod,
  HealthPageData,
  HealthSummaryItem,
  HealthTodayState,
} from '@/types/domain-pages';
import type { Domain, TodayStatus } from '@/types';

type NumericPicker = (record: SaludRecord) => Cell<number>;

type MetricDefinition = {
  id: string;
  label: string;
  summaryLabel?: string;
  unit: string;
  domain: Domain;
  category: HealthMetricCategory;
  direction: HealthMetricDirection;
  pick: NumericPicker;
  formatAvg: (value: number) => string;
  /** Umbral visual para no convertir ruido pequeño en una señal favorable/desfavorable. */
  summaryThresholdPct?: number;
};

const oneDecimal = (value: number) => String(Math.round(value * 10) / 10);
const twoDecimals = (value: number) => String(Math.round(value * 100) / 100);
const integer = (value: number) => String(Math.round(value));

function preferredActiveCalories(record: SaludRecord): Cell<number> {
  return record.activeCaloriesKcal.kind === 'value'
    ? record.activeCaloriesKcal
    : record.activeCalories;
}

const METRICS: MetricDefinition[] = [
  {
    id: 'sleep',
    label: 'Sueño total',
    summaryLabel: 'Sueño',
    unit: 'h',
    domain: 'health',
    category: 'sleep',
    direction: 'more-better',
    pick: (r) => r.sleepHours,
    formatAvg: oneDecimal,
    summaryThresholdPct: 5,
  },
  {
    id: 'core',
    label: 'Sueño núcleo',
    unit: 'h',
    domain: 'health',
    category: 'sleep',
    direction: 'neutral',
    pick: (r) => r.coreSleepHours,
    formatAvg: oneDecimal,
  },
  {
    id: 'deep',
    label: 'Sueño profundo',
    unit: 'h',
    domain: 'health',
    category: 'sleep',
    direction: 'neutral',
    pick: (r) => r.deepSleepHours,
    formatAvg: oneDecimal,
  },
  {
    id: 'rem',
    label: 'Sueño REM',
    unit: 'h',
    domain: 'health',
    category: 'sleep',
    direction: 'neutral',
    pick: (r) => r.remSleepHours,
    formatAvg: oneDecimal,
  },
  {
    id: 'awake',
    label: 'Sueño despierto',
    unit: 'h',
    domain: 'health',
    category: 'sleep',
    direction: 'neutral',
    pick: (r) => r.awakeSleepHours,
    formatAvg: oneDecimal,
  },
  {
    id: 'restingHr',
    label: 'FC en reposo',
    unit: 'ppm',
    domain: 'health',
    category: 'recovery',
    direction: 'less-better',
    pick: (r) => r.restingHr,
    formatAvg: integer,
    summaryThresholdPct: 3,
  },
  {
    id: 'hrv',
    label: 'HRV',
    unit: 'ms',
    domain: 'health',
    category: 'recovery',
    direction: 'neutral',
    pick: (r) => r.hrv,
    formatAvg: integer,
  },
  {
    id: 'meanHr',
    label: 'FC media',
    unit: 'ppm',
    domain: 'health',
    category: 'recovery',
    direction: 'neutral',
    pick: (r) => r.meanHr,
    formatAvg: integer,
  },
  {
    id: 'minHr',
    label: 'FC mínima',
    unit: 'ppm',
    domain: 'health',
    category: 'recovery',
    direction: 'neutral',
    pick: (r) => r.minHr,
    formatAvg: integer,
  },
  {
    id: 'maxHr',
    label: 'FC máxima',
    unit: 'ppm',
    domain: 'health',
    category: 'recovery',
    direction: 'neutral',
    pick: (r) => r.maxHr,
    formatAvg: integer,
  },
  {
    id: 'steps',
    label: 'Pasos',
    unit: '',
    domain: 'health',
    category: 'movement',
    direction: 'more-better',
    pick: (r) => r.steps,
    formatAvg: (v) => formatNumber(Math.round(v)),
    summaryThresholdPct: 10,
  },
  {
    id: 'distance',
    label: 'Distancia caminada/corrida',
    unit: 'km',
    domain: 'health',
    category: 'movement',
    direction: 'more-better',
    pick: (r) => r.walkRunKm,
    formatAvg: oneDecimal,
  },
  {
    id: 'floors',
    label: 'Pisos subidos',
    unit: '',
    domain: 'health',
    category: 'movement',
    direction: 'more-better',
    pick: (r) => r.floors,
    formatAvg: oneDecimal,
  },
  {
    id: 'walkingSpeed',
    label: 'Velocidad al caminar',
    unit: 'km/h',
    domain: 'health',
    category: 'movement',
    direction: 'neutral',
    pick: (r) => r.walkingSpeed,
    formatAvg: twoDecimals,
  },
  {
    id: 'stepLength',
    label: 'Longitud de paso',
    unit: 'cm',
    domain: 'health',
    category: 'movement',
    direction: 'neutral',
    pick: (r) => r.stepLengthCm,
    formatAvg: oneDecimal,
  },
  {
    id: 'walkingAsymmetry',
    label: 'Asimetría al caminar',
    unit: '%',
    domain: 'health',
    category: 'movement',
    direction: 'neutral',
    pick: (r) => r.walkingAsymmetry,
    formatAvg: oneDecimal,
  },
  {
    id: 'spo2',
    label: 'Saturación de oxígeno',
    unit: '%',
    domain: 'health',
    category: 'oxygen',
    direction: 'neutral',
    pick: (r) => r.spo2,
    formatAvg: oneDecimal,
  },
  {
    id: 'calories',
    label: 'Calorías activas',
    summaryLabel: 'Actividad',
    unit: 'kcal',
    domain: 'health',
    category: 'activity',
    direction: 'more-better',
    pick: preferredActiveCalories,
    formatAvg: (v) => formatNumber(Math.round(v)),
    summaryThresholdPct: 10,
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

function safeCompare(current: number | null, reference: number | null): PeriodCompare {
  if (current === null || reference === null) return compareTotals(0, null);
  return compareTotals(current, reference);
}

function summaryTone(
  metric: HealthMetricPeriod,
  previousAverage: number | null,
  thresholdPct: number,
): HealthSummaryItem['tone'] {
  if (
    metric.average === null ||
    previousAverage === null ||
    previousAverage === 0 ||
    metric.direction === 'neutral'
  ) {
    return 'neutral';
  }
  const pct = Math.abs(((metric.average - previousAverage) / Math.abs(previousAverage)) * 100);
  if (pct < thresholdPct) return 'neutral';
  const isUp = metric.average > previousAverage;
  if (metric.direction === 'more-better') return isUp ? 'good' : 'warning';
  return isUp ? 'warning' : 'good';
}

function buildSummary(
  metrics: readonly HealthMetricPeriod[],
  previousAverages: ReadonlyMap<string, number | null>,
): HealthSummaryItem[] {
  const ids = ['sleep', 'restingHr', 'steps', 'hrv'] as const;
  return ids.map((id) => {
    const metric = metrics.find((candidate) => candidate.id === id);
    if (!metric || metric.average === null) {
      return {
        id,
        label: id === 'restingHr' ? 'FC en reposo' : id === 'hrv' ? 'HRV' : id === 'steps' ? 'Pasos' : 'Sueño',
        detail: 'Sin datos suficientes en este período',
        tone: 'neutral',
      };
    }

    const definition = METRICS.find((candidate) => candidate.id === id) as MetricDefinition;
    const previousAverage = previousAverages.get(id) ?? null;
    const threshold = definition.summaryThresholdPct ?? 5;
    const tone = summaryTone(metric, previousAverage, threshold);
    const unit = metric.unit ? ` ${metric.unit}` : '';
    const summaryLabel = definition.summaryLabel ?? definition.label;

    let detail = 'Sin período comparable';
    if (metric.compare.available) {
      detail =
        tone === 'neutral' && metric.direction !== 'neutral'
          ? `Estable vs período anterior (${metric.compare.label})`
          : `${metric.compare.label} vs período anterior`;
    }

    return {
      id,
      label: `${summaryLabel} ${metric.averageLabel}${unit}`,
      detail,
      tone,
    };
  });
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
  const previousWindow = previousPeriodWindow(input.window);
  const prev = saludAvailableDays(input.records, previousWindow);
  const baselineWindow: PeriodWindow = {
    days: 30,
    start: addDaysYmd(input.window.start, -30),
    end: addDaysYmd(input.window.start, -1),
  };
  const baseline = saludAvailableDays(input.records, baselineWindow);
  const previousAverages = new Map<string, number | null>();

  const metrics: HealthMetricPeriod[] = METRICS.map((def) => {
    const current = averageOf(available, def.pick);
    const previous = averageOf(prev, def.pick);
    const baselineMetric = averageOf(baseline, def.pick);
    previousAverages.set(def.id, previous.average);

    return {
      id: def.id,
      label: def.label,
      unit: def.unit,
      domain: def.domain,
      category: def.category,
      direction: def.direction,
      average: current.average,
      averageLabel: current.average === null ? 'Sin datos' : def.formatAvg(current.average),
      series: seriesOf(map, input.window, availableSet, def.pick),
      compare: safeCompare(current.average, previous.average),
      baselineAverage: baselineMetric.average,
      baselineLabel:
        baselineMetric.average === null ? 'Sin baseline' : def.formatAvg(baselineMetric.average),
      baselineCompare: safeCompare(current.average, baselineMetric.average),
      coverageDays: current.values.length,
    };
  });

  const history: HealthDayRow[] = available
    .slice()
    .reverse()
    .map((record) => {
      const importKind = parseImportStatus(record.importStatus);
      return {
        date: record.date as string,
        label: formatShortDay(record.date as string),
        sleep: cellLabel(record.sleepHours, (v) => `${Math.round(v * 10) / 10} h`),
        steps: cellLabel(record.steps, (v) => formatNumber(v)),
        restingHr: cellLabel(record.restingHr, (v) => String(Math.round(v))),
        importKind: importKind === 'none' ? 'complete' : importKind,
        workout:
          record.workout.kind === 'value' && record.workout.value.trim() !== ''
            ? record.workout.value
            : '—',
      };
    });

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
    baselineAvailableDays: baseline.length,
    metrics,
    summary: buildSummary(metrics, previousAverages),
    today: todayState(map.get(input.today), input.today),
    history,
  };
}
