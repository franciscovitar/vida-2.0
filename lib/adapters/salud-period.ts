/**
 * Agregaciones de salud para un período.
 */
import { compareTotals } from '@/lib/adapters/compare';
import type { Cell } from '@/lib/adapters/cells';
import { addDaysYmd, formatShortDay, isFutureDate } from '@/lib/adapters/dates';
import { parseImportStatus, saludHasData, type SaludRecord } from '@/lib/adapters/salud';
import { formatNumber } from '@/lib/format';
import type { PeriodWindow } from '@/lib/periods';
import { inPeriod, periodWindow, previousPeriodWindow } from '@/lib/periods';
import type {
  HealthDayRow,
  HealthImportKind,
  HealthInsight,
  HealthMetricGroupId,
  HealthMetricPeriod,
  HealthPageData,
  HealthTodayState,
} from '@/types/domain-pages';
import type { Domain, TodayStatus } from '@/types';

type NumericPicker = (record: SaludRecord) => number | null;

type MetricDefinition = {
  id: string;
  label: string;
  unit: string;
  group: HealthMetricGroupId;
  domain: Domain;
  pick: NumericPicker;
  formatAvg: (value: number) => string;
  optional?: boolean;
};

function cellValue(cell: Cell<number>): number | null {
  return cell.kind === 'value' ? cell.value : null;
}

const oneDecimal = (value: number): string => String(Math.round(value * 10) / 10);
const integer = (value: number): string => formatNumber(Math.round(value));

const METRICS: readonly MetricDefinition[] = [
  {
    id: 'sleep',
    label: 'Sueño total',
    unit: 'h',
    group: 'sleep',
    domain: 'health',
    pick: (r) => cellValue(r.sleepHours),
    formatAvg: oneDecimal,
  },
  {
    id: 'deep',
    label: 'Sueño profundo',
    unit: 'h',
    group: 'sleep',
    domain: 'health',
    pick: (r) => cellValue(r.deepSleepHours),
    formatAvg: oneDecimal,
  },
  {
    id: 'rem',
    label: 'Sueño REM',
    unit: 'h',
    group: 'sleep',
    domain: 'health',
    pick: (r) => cellValue(r.remSleepHours),
    formatAvg: oneDecimal,
  },
  {
    id: 'coreSleep',
    label: 'Sueño núcleo',
    unit: 'h',
    group: 'sleep',
    domain: 'health',
    pick: (r) => cellValue(r.coreSleepHours),
    formatAvg: oneDecimal,
    optional: true,
  },
  {
    id: 'awakeSleep',
    label: 'Tiempo despierto',
    unit: 'h',
    group: 'sleep',
    domain: 'health',
    pick: (r) => cellValue(r.awakeSleepHours),
    formatAvg: oneDecimal,
    optional: true,
  },
  {
    id: 'restingHr',
    label: 'FC en reposo',
    unit: 'ppm',
    group: 'cardio',
    domain: 'health',
    pick: (r) => cellValue(r.restingHr),
    formatAvg: integer,
  },
  {
    id: 'meanHr',
    label: 'FC media',
    unit: 'ppm',
    group: 'cardio',
    domain: 'health',
    pick: (r) => cellValue(r.meanHr),
    formatAvg: integer,
  },
  {
    id: 'minHr',
    label: 'FC mínima',
    unit: 'ppm',
    group: 'cardio',
    domain: 'health',
    pick: (r) => cellValue(r.minHr),
    formatAvg: integer,
    optional: true,
  },
  {
    id: 'maxHr',
    label: 'FC máxima',
    unit: 'ppm',
    group: 'cardio',
    domain: 'health',
    pick: (r) => cellValue(r.maxHr),
    formatAvg: integer,
    optional: true,
  },
  {
    id: 'hrv',
    label: 'HRV',
    unit: 'ms',
    group: 'cardio',
    domain: 'health',
    pick: (r) => cellValue(r.hrv),
    formatAvg: integer,
    optional: true,
  },
  {
    id: 'steps',
    label: 'Pasos',
    unit: '',
    group: 'movement',
    domain: 'health',
    pick: (r) => cellValue(r.steps),
    formatAvg: integer,
  },
  {
    id: 'distance',
    label: 'Distancia',
    unit: 'km',
    group: 'movement',
    domain: 'health',
    pick: (r) => cellValue(r.walkRunKm),
    formatAvg: oneDecimal,
  },
  {
    id: 'walkingSpeed',
    label: 'Velocidad al caminar',
    unit: 'km/h',
    group: 'movement',
    domain: 'health',
    pick: (r) => cellValue(r.walkingSpeed),
    formatAvg: oneDecimal,
    optional: true,
  },
  {
    id: 'stepLength',
    label: 'Longitud de paso',
    unit: 'cm',
    group: 'movement',
    domain: 'health',
    pick: (r) => cellValue(r.stepLengthCm),
    formatAvg: oneDecimal,
    optional: true,
  },
  {
    id: 'floors',
    label: 'Pisos subidos',
    unit: '',
    group: 'movement',
    domain: 'health',
    pick: (r) => cellValue(r.floorsClimbed),
    formatAvg: oneDecimal,
    optional: true,
  },
  {
    id: 'walkingAsymmetry',
    label: 'Asimetría al caminar',
    unit: '%',
    group: 'movement',
    domain: 'health',
    pick: (r) => cellValue(r.walkingAsymmetry),
    formatAvg: oneDecimal,
    optional: true,
  },
  {
    id: 'spo2',
    label: 'SpO₂',
    unit: '%',
    group: 'oxygen',
    domain: 'health',
    pick: (r) => cellValue(r.spo2),
    formatAvg: oneDecimal,
    optional: true,
  },
  {
    id: 'calories',
    label: 'Calorías activas',
    unit: 'kcal',
    group: 'energy',
    domain: 'health',
    pick: (r) => cellValue(r.activeCalories),
    formatAvg: integer,
  },
  {
    id: 'restingEnergy',
    label: 'Energía en reposo',
    unit: 'kcal',
    group: 'energy',
    domain: 'health',
    pick: (r) => {
      const value = cellValue(r.restingEnergyKj);
      return value === null ? null : value / 4.184;
    },
    formatAvg: integer,
    optional: true,
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
    const value = pick(record);
    if (value !== null && Number.isFinite(value)) values.push(value);
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
    else out.push(pick(record));
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
    return {
      kind: 'missing',
      date: null,
      label: `Sin datos · ${formatShortDay(today)}`,
      details: null,
    };
  }
  const kind = parseImportStatus(record.importStatus);
  const importKind: HealthImportKind = kind === 'none' ? 'complete' : kind;
  const label =
    importKind === 'partial'
      ? `Importación parcial · ${formatShortDay(record.date as string)}`
      : `Datos del día · ${formatShortDay(record.date as string)}`;
  const details =
    importKind === 'partial' && record.missingCore.kind === 'value'
      ? `Faltan: ${record.missingCore.value}`
      : null;
  return { kind: importKind, date: record.date, label, details };
}

function compareMagnitude(label: string): number {
  const match = label.match(/([0-9]+(?:[.,][0-9]+)?)\s*%/);
  return match ? Number(match[1].replace(',', '.')) : -1;
}

function changeVerb(direction: HealthMetricPeriod['compare']['direction']): string {
  if (direction === 'up') return 'subió';
  if (direction === 'down') return 'bajó';
  if (direction === 'steady') return 'se mantuvo';
  return 'cambió';
}

function buildInsights(input: {
  metrics: readonly HealthMetricPeriod[];
  availableDays: number;
  partialDays: number;
  baselineDays: number;
  periodDays: number;
}): HealthInsight[] {
  const insights: HealthInsight[] = [];

  const periodCandidate = [...input.metrics]
    .filter((metric) => metric.compare.available && metric.coverageDays >= 2)
    .sort((a, b) => compareMagnitude(b.compare.label) - compareMagnitude(a.compare.label))[0];
  if (periodCandidate) {
    insights.push({
      id: 'period-change',
      title: 'Cambio destacado',
      detail: `${periodCandidate.label} ${changeVerb(periodCandidate.compare.direction)} (${periodCandidate.compare.label}) vs el período anterior.`,
      tone: 'neutral',
    });
  }

  const baselineCandidate = [...input.metrics]
    .filter((metric) => metric.baselineCompare.available && metric.coverageDays >= 2)
    .sort(
      (a, b) =>
        compareMagnitude(b.baselineCompare.label) - compareMagnitude(a.baselineCompare.label),
    )[0];
  if (baselineCandidate) {
    insights.push({
      id: 'baseline-change',
      title: 'Contra tu base personal',
      detail: `${baselineCandidate.label}: ${baselineCandidate.baselineCompare.label} frente a los 30 días previos disponibles.`,
      tone: 'neutral',
    });
  }

  if (input.partialDays > 0) {
    insights.push({
      id: 'partial-data',
      title: 'Cobertura parcial',
      detail: `${input.partialDays} día(s) del período tienen importación parcial; las tendencias se muestran sin convertir faltantes en cero.`,
      tone: 'watch',
    });
  } else if (input.availableDays < Math.min(3, input.periodDays)) {
    insights.push({
      id: 'low-coverage',
      title: 'Pocos datos todavía',
      detail: `Hay ${input.availableDays} día(s) con datos. Conviene acumular más registros antes de interpretar tendencias.`,
      tone: 'watch',
    });
  }

  if (insights.length < 3) {
    insights.push({
      id: 'baseline-coverage',
      title: 'Base personal',
      detail:
        input.baselineDays > 0
          ? `La comparación personal usa ${input.baselineDays} día(s) con datos de los 30 días anteriores al período.`
          : 'Todavía no hay una base personal previa suficiente para todas las métricas.',
      tone: 'neutral',
    });
  }

  return insights.slice(0, 3);
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
  const baselineWindow = periodWindow(addDaysYmd(input.window.start, -1), 30);
  const baseline = saludAvailableDays(input.records, baselineWindow);

  const metrics: HealthMetricPeriod[] = METRICS.map((def) => {
    const current = averageOf(available, def.pick);
    const previous = averageOf(prev, def.pick);
    const baselineMetric = averageOf(baseline, def.pick);
    return {
      id: def.id,
      label: def.label,
      unit: def.unit,
      group: def.group,
      domain: def.domain,
      average: current.average,
      averageLabel: current.average === null ? 'Sin datos' : def.formatAvg(current.average),
      previousAverage: previous.average,
      baselineAverage: baselineMetric.average,
      coverageDays: current.values.length,
      series: seriesOf(map, input.window, availableSet, def.pick),
      compare: compareTotals(current.average ?? 0, previous.average),
      baselineCompare: compareTotals(current.average ?? 0, baselineMetric.average),
    };
  }).filter((metric, index) => {
    const def = METRICS[index];
    if (!def.optional) return true;
    return (
      metric.average !== null || metric.previousAverage !== null || metric.baselineAverage !== null
    );
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

  const partialDays = available.filter(
    (record) => parseImportStatus(record.importStatus) === 'partial',
  ).length;
  const completeDays = available.length - partialDays;
  const insights = buildInsights({
    metrics,
    availableDays: available.length,
    partialDays,
    baselineDays: baseline.length,
    periodDays: input.window.days,
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
    metrics,
    today: todayState(map.get(input.today), input.today),
    history,
    baselineDays: baseline.length,
    completeDays,
    partialDays,
    insights,
  };
}
