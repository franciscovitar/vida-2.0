/**
 * Períodos de análisis (7 / 30 / 90 días) anclados a hoy en Argentina.
 */
import { addDaysYmd, isFutureDate, isWithin } from '@/lib/adapters/dates';

export const PERIOD_OPTIONS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIOD_OPTIONS)[number];

export interface PeriodWindow {
  days: PeriodDays;
  /** Inclusive start YYYY-MM-DD */
  start: string;
  /** Inclusive end (hoy) YYYY-MM-DD */
  end: string;
}

/** Interpreta `?period=` de la URL; por defecto 7. */
export function parsePeriodParam(raw: string | string[] | undefined): PeriodDays {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(value ?? '', 10);
  if (n === 7 || n === 30 || n === 90) return n;
  return 7;
}

/** Ventana [hoy-(days-1), hoy]. */
export function periodWindow(today: string, days: PeriodDays): PeriodWindow {
  return {
    days,
    start: addDaysYmd(today, -(days - 1)),
    end: today,
  };
}

/** Período inmediatamente anterior de igual duración. */
export function previousPeriodWindow(current: PeriodWindow): PeriodWindow {
  return {
    days: current.days,
    start: addDaysYmd(current.start, -current.days),
    end: addDaysYmd(current.start, -1),
  };
}

export function inPeriod(date: string | null, window: PeriodWindow): boolean {
  if (!date) return false;
  if (isFutureDate(date, window.end)) return false;
  return isWithin(date, window.start, window.end);
}

export function periodLabel(days: PeriodDays): string {
  return `${days} días`;
}
