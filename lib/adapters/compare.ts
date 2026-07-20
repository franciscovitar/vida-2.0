/**
 * Comparaciones entre períodos (nunca produce infinito).
 */
import type { DeltaDirection } from '@/types';

export interface PeriodCompare {
  direction: DeltaDirection;
  /** Texto corto para UI, p. ej. "+12 %" o "Sin comparación". */
  label: string;
  /** true si hay base comparable. */
  available: boolean;
}

/** Compara dos totales numéricos del mismo período de duración. */
export function compareTotals(current: number, previous: number | null): PeriodCompare {
  if (previous === null || !Number.isFinite(previous)) {
    return { direction: 'none', label: 'Sin comparación', available: false };
  }
  if (previous === 0) {
    if (current === 0) return { direction: 'steady', label: 'igual', available: true };
    return { direction: 'none', label: 'Sin comparación', available: false };
  }
  const diff = current - previous;
  if (diff === 0) return { direction: 'steady', label: 'igual', available: true };
  const pct = Math.round((diff / Math.abs(previous)) * 100);
  if (pct === 0) return { direction: 'steady', label: '≈0 %', available: true };
  const sign = pct > 0 ? '+' : '−';
  return {
    direction: pct > 0 ? 'up' : 'down',
    label: `${sign}${Math.abs(pct)} %`,
    available: true,
  };
}

/** Compara tasas 0–1 (cumplimiento). */
export function compareRates(current: number | null, previous: number | null): PeriodCompare {
  if (current === null || previous === null) {
    return { direction: 'none', label: 'Sin comparación', available: false };
  }
  const diffPp = Math.round((current - previous) * 1000) / 10;
  if (diffPp === 0) return { direction: 'steady', label: 'igual', available: true };
  const sign = diffPp > 0 ? '+' : '−';
  return {
    direction: diffPp > 0 ? 'up' : 'down',
    label: `${sign}${Math.abs(diffPp)} pp`,
    available: true,
  };
}

/** Porcentaje de presentación, nunca > 100. */
export function clampPercent(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}
