/**
 * Contratos de las páginas de dominio (Hábitos / Salud / Productividad).
 */
import type { Domain, HabitStatus, HabitView, TodayStatus, WeeklyGoal } from '@/types';

import type { PeriodCompare } from '@/lib/adapters/compare';
import type { PeriodDays } from '@/lib/periods';

/** Estado de celda en la matriz / calendario de hábitos. */
export type DayCellState =
  | 'done'
  | 'missed'
  | 'pending'
  | 'unavailable'
  /** @deprecated Preferir unavailable / pending. */
  | 'empty'
  /** @deprecated Preferir unavailable. */
  | 'future';

export interface DomainPageMeta {
  source: 'mock' | 'google';
  status: TodayStatus;
  notice: string | null;
  targetDate: string;
  periodDays: PeriodDays;
  periodStart: string;
  periodEnd: string;
  availableDays: number;
  previousAvailableDays: number;
}

export interface HabitPeriodStat {
  id: string;
  name: string;
  icon?: string;
  /** true / false / null(empty) history oldest→newest within period. */
  series: (boolean | null)[];
  completed: number;
  available: number;
  rate: number | null;
  compare: PeriodCompare;
  todayStatus: HabitStatus;
  todayValue: boolean;
}

export interface WeeklyGoalPeriodView {
  id: string;
  name: string;
  domain: Domain;
  target: number;
  unit: string;
  currentWeek: number;
  percent: number;
  weeklySeries: { weekStart: string; count: number }[];
  averagePerWeek: number | null;
}

export interface HabitCalendarDay {
  date: string;
  label: string;
  /** Por hábito id → estado visual. */
  cells: Record<string, DayCellState>;
}

export interface HabitsPageData extends DomainPageMeta {
  dailyHabits: HabitPeriodStat[];
  weeklyGoals: WeeklyGoalPeriodView[];
  calendar: HabitCalendarDay[];
  /** Para HabitsBoard de hoy. */
  todayHabits: HabitView[];
  todayWeekly: WeeklyGoal[];
  rowExists: boolean;
  writable: boolean;
}

export type HealthImportKind = 'partial' | 'complete' | 'none';

export interface HealthMetricPeriod {
  id: string;
  label: string;
  unit: string;
  average: number | null;
  averageLabel: string;
  series: (number | null)[];
  compare: PeriodCompare;
  domain: Domain;
}

export interface HealthDayRow {
  date: string;
  label: string;
  sleep: string;
  steps: string;
  restingHr: string;
  importKind: HealthImportKind;
  workout: string;
}

export interface HealthTodayState {
  kind: HealthImportKind | 'missing';
  date: string | null;
  label: string;
}

export interface HealthPageData extends DomainPageMeta {
  metrics: HealthMetricPeriod[];
  today: HealthTodayState;
  history: HealthDayRow[];
}

export interface ProductivityCategoryPeriod {
  id: string;
  label: string;
  domain: Domain;
  totalMinutes: number;
  totalLabel: string;
  dailyAverage: number | null;
  dailyAverageLabel: string;
  shareOfActive: number | null;
  shareLabel: string;
  compare: PeriodCompare;
  series: (number | null)[];
}

export interface ProductivityDayRow {
  date: string;
  label: string;
  work: string;
  faculty: string;
  vida2: string;
  leisure: string;
  active: string;
  unclassified: string;
  hasData: boolean;
}

export interface ProductivityPageData extends DomainPageMeta {
  categories: ProductivityCategoryPeriod[];
  activeTotalMinutes: number;
  activeTotalLabel: string;
  activeAverageLabel: string;
  activeCompare: PeriodCompare;
  coverageLabel: string;
  daysWithoutAw: number;
  history: ProductivityDayRow[];
  distributionMax: number;
}
