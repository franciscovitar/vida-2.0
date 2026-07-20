/**
 * Agregaciones de hábitos para un período (7/30/90).
 *
 * Disponibilidad estadística: por hábito + fecha de activación.
 * No depende de registroHasData, ActivityWatch, energía ni salud.
 */
import { AUTHORIZED_HABIT_META } from '@/lib/habits/authorized';
import {
  HABIT_ACTIVATION_DATES,
  habitActivationDate,
  habitsMissingActivation,
} from '@/lib/habits/activation';
import { RD } from '@/lib/google/constants';
import { clampPercent, compareRates } from '@/lib/adapters/compare';
import {
  addDaysYmd,
  formatShortDay,
  isFutureDate,
  isWithin,
  startOfWeekMonday,
} from '@/lib/adapters/dates';
import type { Cell } from '@/lib/adapters/cells';
import type { RegistroRecord } from '@/lib/adapters/registro-diario';
import type { PeriodWindow } from '@/lib/periods';
import { previousPeriodWindow } from '@/lib/periods';
import type {
  DayCellState,
  HabitCalendarDay,
  HabitPeriodStat,
  HabitsPageData,
  WeeklyGoalPeriodView,
} from '@/types/domain-pages';
import type { HabitStatus, HabitView, TodayStatus, WeeklyGoal } from '@/types';

const DAILY_HABIT_HEADERS = [RD.firstAlarm, RD.bed, RD.shower, RD.posture, RD.journaling] as const;

const WEEKLY_DEFS = [
  {
    id: 'goal-gym',
    name: 'Gimnasio',
    domain: 'habits' as const,
    target: 3,
    unit: 'veces',
    header: RD.gym,
  },
  {
    id: 'goal-cardio',
    name: 'Cardio',
    domain: 'health' as const,
    target: 3,
    unit: 'veces',
    header: RD.cardio,
  },
  {
    id: 'goal-stretch',
    name: 'Estiramiento',
    domain: 'health' as const,
    target: 3,
    unit: 'veces',
    header: RD.stretch,
  },
  {
    id: 'goal-mealprep',
    name: 'Meal prep',
    domain: 'habits' as const,
    target: 1,
    unit: 'vez',
    header: RD.mealPrep,
  },
  {
    id: 'goal-football',
    name: 'Fútbol',
    domain: 'habits' as const,
    target: 2,
    unit: 'veces',
    header: RD.football,
  },
];

function byDate(records: readonly RegistroRecord[]): Map<string, RegistroRecord> {
  const map = new Map<string, RegistroRecord>();
  for (const record of records) {
    if (record.date) map.set(record.date, record);
  }
  return map;
}

function habitCell(record: RegistroRecord | undefined, header: string): Cell<boolean> | undefined {
  return record?.habits[header];
}

function isDone(cell: Cell<boolean> | undefined): boolean {
  return cell?.kind === 'value' && cell.value === true;
}

/** true si la celda es explícitamente true; cualquier otro caso (false/vacío/ausente) → no cumplido. */
function habitValueTrue(cell: Cell<boolean> | undefined): boolean {
  return isDone(cell);
}

/**
 * Estado de un hábito en una fecha civil.
 * - antes de activación → unavailable
 * - futuro → unavailable
 * - hoy + false/vacío → pending
 * - hoy + true → done
 * - pasado + false/vacío/ausente → missed
 * - pasado + true → done
 */
export function resolveHabitDayState(opts: {
  date: string;
  today: string;
  activatedOn: string;
  value: boolean | null;
}): DayCellState {
  if (opts.date < opts.activatedOn) return 'unavailable';
  if (opts.date > opts.today) return 'unavailable';
  if (opts.date === opts.today) {
    return opts.value === true ? 'done' : 'pending';
  }
  return opts.value === true ? 'done' : 'missed';
}

/**
 * Días pasados evaluables en la ventana desde `activatedOn` (sin incluir hoy).
 * Independiente de métricas AW/salud/energía.
 */
export function habitEvaluablePastDays(
  window: PeriodWindow,
  today: string,
  activatedOn: string,
): string[] {
  const days: string[] = [];
  let cursor = window.start;
  while (cursor <= window.end) {
    if (cursor >= activatedOn && cursor < today) {
      days.push(cursor);
    }
    cursor = addDaysYmd(cursor, 1);
  }
  return days;
}

/**
 * @deprecated Preferir habitEvaluablePastDays + activación por hábito.
 * Conservado como alias de días pasados desde la activación más temprana tipada.
 */
export function habitAvailableDays(
  _records: readonly RegistroRecord[],
  window: PeriodWindow,
  today: string = window.end,
): { date: string }[] {
  const earliest = earliestActivation();
  return habitEvaluablePastDays(window, today, earliest).map((date) => ({ date }));
}

function earliestActivation(): string {
  const dates = Object.values(HABIT_ACTIVATION_DATES);
  return dates.reduce((min, value) => (value < min ? value : min));
}

function rateForHabit(
  map: Map<string, RegistroRecord>,
  header: string,
  window: PeriodWindow,
  today: string,
  activatedOn: string,
): { completed: number; available: number; rate: number | null } {
  let completed = 0;
  let available = 0;
  let cursor = window.start;
  while (cursor <= window.end) {
    if (cursor < activatedOn) {
      cursor = addDaysYmd(cursor, 1);
      continue;
    }
    if (cursor > today) break;

    const value = habitValueTrue(habitCell(map.get(cursor), header));

    if (cursor === today) {
      // Hoy solo entra al denominador si está cumplido (no penaliza pending).
      if (value) {
        available += 1;
        completed += 1;
      }
    } else {
      available += 1;
      if (value) completed += 1;
    }
    cursor = addDaysYmd(cursor, 1);
  }
  return {
    completed,
    available,
    rate: available === 0 ? null : completed / available,
  };
}

function seriesForHabit(
  map: Map<string, RegistroRecord>,
  window: PeriodWindow,
  today: string,
  header: string,
  activatedOn: string,
): (boolean | null)[] {
  const out: (boolean | null)[] = [];
  let cursor = window.start;
  while (cursor <= window.end) {
    if (isFutureDate(cursor, window.end) && cursor > today) break;
    if (cursor > today || cursor < activatedOn) {
      out.push(null);
    } else {
      out.push(habitValueTrue(habitCell(map.get(cursor), header)));
    }
    cursor = addDaysYmd(cursor, 1);
  }
  return out;
}

function todayStatus(
  record: RegistroRecord | undefined,
  header: string,
  rowExists: boolean,
): HabitStatus {
  const cell = habitCell(record, header);
  if (!cell || cell.kind === 'empty') return rowExists ? 'pending' : 'unavailable';
  if (cell.kind !== 'value') return 'unavailable';
  return cell.value ? 'done' : 'pending';
}

/**
 * Metas semanales: cuentan `true` por semana civil.
 * No usan el denominador diario de cumplimiento.
 */
function buildWeeklyViews(
  map: Map<string, RegistroRecord>,
  today: string,
  window: PeriodWindow,
): WeeklyGoalPeriodView[] {
  const monday = startOfWeekMonday(today);

  const weekStarts: string[] = [];
  let cursor = startOfWeekMonday(window.start);
  const lastWeek = startOfWeekMonday(window.end);
  while (cursor <= lastWeek) {
    weekStarts.push(cursor);
    cursor = addDaysYmd(cursor, 7);
  }

  return WEEKLY_DEFS.map((def) => {
    const activatedOn = habitActivationDate(def.header) ?? earliestActivation();

    const currentWeek = countTruesInRange(map, def.header, monday, today, today, activatedOn);

    const weeklySeries = weekStarts.map((weekStart) => {
      const weekEnd = addDaysYmd(weekStart, 6);
      const end = weekEnd < window.end ? weekEnd : window.end;
      const start = weekStart > window.start ? weekStart : window.start;
      const count = countTruesInRange(map, def.header, start, end, today, activatedOn);
      return { weekStart, count };
    });

    const weeksWithActivity = weeklySeries.filter((week) => {
      const weekEnd = addDaysYmd(week.weekStart, 6);
      const rangeStart = week.weekStart > window.start ? week.weekStart : window.start;
      const rangeEnd = weekEnd < window.end ? weekEnd : window.end;
      // Semana evaluable si intersecta [activación, hoy] dentro del período.
      return rangeStart <= today && rangeEnd >= activatedOn && rangeStart <= rangeEnd;
    });

    const averagePerWeek =
      weeksWithActivity.length > 0
        ? weeksWithActivity.reduce((sum, week) => sum + week.count, 0) / weeksWithActivity.length
        : null;

    return {
      id: def.id,
      name: def.name,
      domain: def.domain,
      target: def.target,
      unit: def.unit,
      currentWeek,
      percent: clampPercent(currentWeek, def.target),
      weeklySeries,
      averagePerWeek,
    };
  });
}

function countTruesInRange(
  map: Map<string, RegistroRecord>,
  header: string,
  start: string,
  end: string,
  today: string,
  activatedOn: string,
): number {
  let count = 0;
  let cursor = start;
  while (cursor <= end) {
    if (cursor >= activatedOn && cursor <= today && isWithin(cursor, start, end)) {
      if (habitValueTrue(habitCell(map.get(cursor), header))) count += 1;
    }
    cursor = addDaysYmd(cursor, 1);
  }
  return count;
}

function buildCalendar(
  map: Map<string, RegistroRecord>,
  window: PeriodWindow,
  today: string,
  headers: readonly string[],
): HabitCalendarDay[] {
  const days: HabitCalendarDay[] = [];
  let cursor = window.start;
  while (cursor <= window.end) {
    const cells: Record<string, DayCellState> = {};
    for (const header of headers) {
      const activatedOn = habitActivationDate(header);
      if (!activatedOn) {
        cells[header] = 'unavailable';
        continue;
      }
      const cell = habitCell(map.get(cursor), header);
      const value = cell?.kind === 'value' ? cell.value : null;
      cells[header] = resolveHabitDayState({
        date: cursor,
        today,
        activatedOn,
        value,
      });
    }
    days.push({ date: cursor, label: formatShortDay(cursor), cells });
    cursor = addDaysYmd(cursor, 1);
  }
  return days;
}

export function buildHabitsPageData(input: {
  records: readonly RegistroRecord[];
  today: string;
  window: PeriodWindow;
  todayHabits: HabitView[];
  todayWeekly: WeeklyGoal[];
  rowExists: boolean;
  writable: boolean;
  source: 'mock' | 'google';
  status: TodayStatus;
  notice: string | null;
}): HabitsPageData {
  const { window, today } = input;
  const map = byDate(input.records);
  const prevWindow = previousPeriodWindow(window);

  const allHeaders = AUTHORIZED_HABIT_META.map((item) => item.header);
  const missing = habitsMissingActivation(allHeaders);
  const activationNotice =
    missing.length > 0 ? `Hábitos sin fecha de activación tipada: ${missing.join(', ')}.` : null;
  const notice = [input.notice, activationNotice].filter(Boolean).join(' ') || null;

  const earliest = earliestActivation();
  const availableDays = habitEvaluablePastDays(window, today, earliest).length;
  const previousAvailableDays = habitEvaluablePastDays(prevWindow, today, earliest).length;

  const meta = AUTHORIZED_HABIT_META.filter((item) =>
    (DAILY_HABIT_HEADERS as readonly string[]).includes(item.header),
  );

  const dailyHabits: HabitPeriodStat[] = meta.map((item) => {
    const activatedOn = habitActivationDate(item.header) ?? earliest;
    const current = rateForHabit(map, item.header, window, today, activatedOn);
    const previous = rateForHabit(map, item.header, prevWindow, today, activatedOn);
    const todayRecord = map.get(today);
    const status = todayStatus(todayRecord, item.header, input.rowExists);
    return {
      id: item.header,
      name: item.name,
      icon: item.icon,
      series: seriesForHabit(map, window, today, item.header, activatedOn),
      completed: current.completed,
      available: current.available,
      rate: current.rate,
      compare: compareRates(current.rate, previous.rate),
      todayStatus: status,
      todayValue: status === 'done',
    };
  });

  return {
    source: input.source,
    status: input.status,
    notice,
    targetDate: today,
    periodDays: window.days,
    periodStart: window.start,
    periodEnd: window.end,
    availableDays,
    previousAvailableDays,
    dailyHabits,
    weeklyGoals: buildWeeklyViews(map, today, window),
    calendar: buildCalendar(map, window, today, allHeaders),
    todayHabits: input.todayHabits,
    todayWeekly: input.todayWeekly,
    rowExists: input.rowExists,
    writable: input.writable,
  };
}
