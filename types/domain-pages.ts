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
export type HealthMetricGroupId = 'sleep' | 'cardio' | 'movement' | 'oxygen' | 'energy';
export type HealthInsightTone = 'neutral' | 'positive' | 'watch';
/** Naturaleza de una observación: hecho verificable, tendencia personal o contexto temporal. */
export type HealthInsightKind = 'fact' | 'trend' | 'context';

/** Señales de salud con valor numérico exacto disponibles para interpretación. */
export type HealthSignalId =
  | 'sleep'
  | 'deepSleep'
  | 'remSleep'
  | 'restingHr'
  | 'meanHr'
  | 'hrv'
  | 'steps'
  | 'walkRunKm'
  | 'activeCalories'
  | 'spo2';

export interface HealthMetricPeriod {
  id: string;
  label: string;
  unit: string;
  group: HealthMetricGroupId;
  average: number | null;
  averageLabel: string;
  previousAverage: number | null;
  baselineAverage: number | null;
  coverageDays: number;
  series: (number | null)[];
  compare: PeriodCompare;
  baselineCompare: PeriodCompare;
  domain: Domain;
}

export interface HealthInsight {
  id: string;
  title: string;
  detail: string;
  tone: HealthInsightTone;
  /** Distingue hecho, tendencia y contexto para no presentar asociaciones como causas. */
  kind: HealthInsightKind;
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
  details: string | null;
}

/** Valores exactos de un día, sin convertir faltantes en cero. */
export interface HealthDaySignals {
  date: string;
  label: string;
  importKind: HealthImportKind;
  /** Lista declarada por la fuente de señales núcleo ausentes, cuando existe. */
  missingCore: string | null;
  workout: string | null;
  /** null = desconocido. Nunca 0 por ausencia. */
  values: Record<HealthSignalId, number | null>;
}

/** Base personal reciente de una señal. */
export interface HealthBaselineSignal {
  average: number | null;
  days: number;
}

/**
 * Modelo numérico exacto que consume la capa de interpretación.
 * No contiene textos de UI: las cadenas formateadas viven en `metrics` e `insights`.
 */
export interface HealthSignalsModel {
  /** Fila de hoy si existe, aunque sea parcial. */
  today: HealthDaySignals | null;
  /** Día más reciente (<= hoy) con sueño o FC en reposo. Puede ser el propio hoy. */
  lastInterpretable: HealthDaySignals | null;
  /** Base personal de los 30 días previos a hoy, independiente del período elegido. */
  baseline: Record<HealthSignalId, HealthBaselineSignal>;
  baselineWindowDays: number;
  /** Días con datos dentro de la ventana de base personal. */
  baselineCoverageDays: number;
}

export interface HealthPageData extends DomainPageMeta {
  /** Modelo numérico exacto para la capa de interpretación. */
  signals: HealthSignalsModel;
  metrics: HealthMetricPeriod[];
  today: HealthTodayState;
  history: HealthDayRow[];
  baselineDays: number;
  completeDays: number;
  partialDays: number;
  insights: HealthInsight[];
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
