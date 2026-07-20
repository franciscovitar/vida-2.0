/**
 * Agregaciones de productividad (ActivityWatch vía Registro diario).
 */
import { compareTotals } from '@/lib/adapters/compare';
import type { Cell } from '@/lib/adapters/cells';
import { addDaysYmd, formatShortDay, isFutureDate } from '@/lib/adapters/dates';
import { registroHasData, type RegistroRecord } from '@/lib/adapters/registro-diario';
import { formatDuration } from '@/lib/format';
import type { PeriodWindow } from '@/lib/periods';
import { inPeriod, previousPeriodWindow } from '@/lib/periods';
import type {
  ProductivityCategoryPeriod,
  ProductivityDayRow,
  ProductivityPageData,
} from '@/types/domain-pages';
import type { Domain, TodayStatus } from '@/types';

type MinutePicker = (record: RegistroRecord) => Cell<number>;

/** Día con datos de productividad reales (incluye 0). */
export function productivityHasData(record: RegistroRecord): boolean {
  const cells: Cell<number>[] = [
    record.work,
    record.faculty,
    record.vida2,
    record.leisure,
    record.screen,
    record.pcActive,
    record.pcAway,
    record.unclassified,
  ];
  return cells.some((cell) => cell.kind === 'value');
}

export function productivityAvailableDays(
  records: readonly RegistroRecord[],
  window: PeriodWindow,
): RegistroRecord[] {
  return records
    .filter(
      (record) =>
        record.date !== null &&
        inPeriod(record.date, window) &&
        !isFutureDate(record.date, window.end) &&
        productivityHasData(record),
    )
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));
}

const CATEGORIES: {
  id: string;
  label: string;
  domain: Domain;
  pick: MinutePicker;
  shareOfActive: boolean;
}[] = [
  {
    id: 'work',
    label: 'Trabajo / Genova',
    domain: 'productivity',
    pick: (r) => r.work,
    shareOfActive: true,
  },
  {
    id: 'faculty',
    label: 'Facultad',
    domain: 'learning',
    pick: (r) => r.faculty,
    shareOfActive: true,
  },
  { id: 'vida2', label: 'Vida 2.0', domain: 'habits', pick: (r) => r.vida2, shareOfActive: true },
  {
    id: 'leisure',
    label: 'Ocio y comunicación',
    domain: 'neutral',
    pick: (r) => r.leisure,
    shareOfActive: true,
  },
  {
    id: 'pcActive',
    label: 'PC activa',
    domain: 'productivity',
    pick: (r) => r.pcActive,
    shareOfActive: false,
  },
  {
    id: 'pcAway',
    label: 'PC ausente',
    domain: 'neutral',
    pick: (r) => r.pcAway,
    shareOfActive: false,
  },
  {
    id: 'unclassified',
    label: 'Sin clasificar',
    domain: 'neutral',
    pick: (r) => r.unclassified,
    shareOfActive: true,
  },
];

function sumOf(available: readonly RegistroRecord[], pick: MinutePicker): number {
  return available.reduce((sum, record) => {
    const cell = pick(record);
    return cell.kind === 'value' ? sum + cell.value : sum;
  }, 0);
}

function daysWithValue(available: readonly RegistroRecord[], pick: MinutePicker): number {
  return available.reduce((count, record) => {
    const cell = pick(record);
    return cell.kind === 'value' ? count + 1 : count;
  }, 0);
}

function seriesOf(
  map: Map<string, RegistroRecord>,
  window: PeriodWindow,
  availableSet: Set<string>,
  pick: MinutePicker,
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

function minuteLabel(cell: Cell<number>): string {
  if (cell.kind !== 'value') return '—';
  return formatDuration(cell.value);
}

export function buildProductivityPageData(input: {
  records: readonly RegistroRecord[];
  today: string;
  window: PeriodWindow;
  source: 'mock' | 'google';
  status: TodayStatus;
  notice: string | null;
}): ProductivityPageData {
  const map = new Map<string, RegistroRecord>();
  for (const record of input.records) {
    if (record.date) map.set(record.date, record);
  }

  const available = productivityAvailableDays(input.records, input.window);
  const availableSet = new Set(available.map((r) => r.date as string));
  const prev = productivityAvailableDays(input.records, previousPeriodWindow(input.window));

  const activeTotal = sumOf(available, (r) => r.pcActive);
  const prevActive = sumOf(prev, (r) => r.pcActive);
  const activeDays = daysWithValue(available, (r) => r.pcActive);

  const categories: ProductivityCategoryPeriod[] = CATEGORIES.map((def) => {
    const total = sumOf(available, def.pick);
    const prevTotal = sumOf(prev, def.pick);
    const days = daysWithValue(available, def.pick);
    const dailyAverage = days > 0 ? total / days : null;
    const share =
      def.shareOfActive && activeTotal > 0 ? total / activeTotal : def.shareOfActive ? null : null;
    return {
      id: def.id,
      label: def.label,
      domain: def.domain,
      totalMinutes: total,
      totalLabel: formatDuration(total),
      dailyAverage,
      dailyAverageLabel: dailyAverage === null ? 'Sin datos' : formatDuration(dailyAverage),
      shareOfActive: share,
      shareLabel:
        share === null
          ? def.shareOfActive
            ? 'Sin comparación'
            : '—'
          : `${Math.round(share * 100)} %`,
      compare: compareTotals(total, prev.length === 0 && total === 0 ? null : prevTotal),
      series: seriesOf(map, input.window, availableSet, def.pick),
    };
  });

  // Días del período civil sin ActivityWatch (sin datos de productividad).
  let calendarDays = 0;
  let cursor = input.window.start;
  while (cursor <= input.window.end) {
    calendarDays += 1;
    cursor = addDaysYmd(cursor, 1);
  }
  const daysWithoutAw = Math.max(0, calendarDays - available.length);
  const coverage = calendarDays === 0 ? 0 : Math.round((available.length / calendarDays) * 100);

  const history: ProductivityDayRow[] = available
    .slice()
    .reverse()
    .map((record) => ({
      date: record.date as string,
      label: formatShortDay(record.date as string),
      work: minuteLabel(record.work),
      faculty: minuteLabel(record.faculty),
      vida2: minuteLabel(record.vida2),
      leisure: minuteLabel(record.leisure),
      active: minuteLabel(record.pcActive),
      unclassified: minuteLabel(record.unclassified),
      hasData: true,
    }));

  const distributionMax = Math.max(
    ...categories
      .filter((c) => ['work', 'faculty', 'vida2', 'leisure', 'unclassified'].includes(c.id))
      .map((c) => c.totalMinutes),
    1,
  );

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
    categories,
    activeTotalMinutes: activeTotal,
    activeTotalLabel: formatDuration(activeTotal),
    activeAverageLabel: activeDays > 0 ? formatDuration(activeTotal / activeDays) : 'Sin datos',
    activeCompare: compareTotals(
      activeTotal,
      prev.length === 0 && activeTotal === 0 ? null : prevActive,
    ),
    coverageLabel: `${coverage}% del período · ${available.length} días con datos`,
    daysWithoutAw,
    history,
    distributionMax,
  };
}

/** Re-export útil para tests de registroHasData vs productividad. */
export { registroHasData };
