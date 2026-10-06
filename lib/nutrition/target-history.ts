import type { PlainCell } from '@/lib/data/plain';

import {
  nutritionTargetCoversDate,
  nutritionTargetHasActiveAmbiguityForDate,
  nutritionTargetIsActiveLike,
} from './target-integrity';

export type NutritionTargetRow = Readonly<Record<string, PlainCell | undefined>>;

export interface NutritionHistoricalEnergyTarget {
  decisionId: string | null;
  energyKcal: number | null;
  energyKcalLow: number | null;
  energyKcalHigh: number | null;
}

function stringValue(value: PlainCell | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function numberValue(value: PlainCell | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function canRepresentTargetDecision(row: NutritionTargetRow, includeSuperseded: boolean): boolean {
  const status = stringValue(row.status)?.toLowerCase();
  return nutritionTargetIsActiveLike(row) || (includeSuperseded && status === 'superseded');
}

function historicalStatusRank(row: NutritionTargetRow): number {
  const status = stringValue(row.status)?.toLowerCase();
  if (status === 'active') return 3;
  if (status === null) return 2;
  if (status === 'superseded') return 1;
  return 0;
}

export function selectNutritionTargetRowForDate<T extends NutritionTargetRow>(
  targetRows: readonly T[],
  date: string,
  options: { includeSuperseded?: boolean } = {},
): T | null {
  const includeSuperseded = options.includeSuperseded ?? true;
  const candidates = targetRows
    .filter((row) => canRepresentTargetDecision(row, includeSuperseded))
    .filter((row) => nutritionTargetCoversDate(row, date));

  const activeLike = candidates.filter(nutritionTargetIsActiveLike);
  if (activeLike.length > 1) return null;
  if (activeLike.length === 1) return activeLike[0]!;

  if (!includeSuperseded) return null;
  return (
    candidates
      .filter((row) => stringValue(row.status)?.toLowerCase() === 'superseded')
      .sort((a, b) => {
        const dateOrder = (stringValue(b.effectiveFrom) ?? '').localeCompare(
          stringValue(a.effectiveFrom) ?? '',
        );
        if (dateOrder !== 0) return dateOrder;
        return historicalStatusRank(b) - historicalStatusRank(a);
      })[0] ?? null
  );
}

function historicalTargetFromRow(
  row: NutritionTargetRow,
  fallbackDecisionId: string | null = null,
): NutritionHistoricalEnergyTarget {
  return {
    decisionId: stringValue(row.decisionId) ?? fallbackDecisionId,
    energyKcal: numberValue(row.energyTargetKcal),
    energyKcalLow: numberValue(row.energyTargetKcalLow),
    energyKcalHigh: numberValue(row.energyTargetKcalHigh),
  };
}

function summaryFallback(
  summaryRow: NutritionTargetRow,
  decisionId: string | null,
): NutritionHistoricalEnergyTarget {
  return {
    decisionId,
    energyKcal: numberValue(summaryRow.energyTargetKcal),
    energyKcalLow: null,
    energyKcalHigh: null,
  };
}

export function resolveNutritionHistoricalEnergyTarget(
  summaryRow: NutritionTargetRow,
  targetRows: readonly NutritionTargetRow[],
  date: string,
  currentDate: string,
): NutritionHistoricalEnergyTarget {
  const decisionId = stringValue(summaryRow.targetDecisionId);
  const includeSuperseded = date < currentDate;
  const usableTargets = targetRows.filter((row) =>
    canRepresentTargetDecision(row, includeSuperseded),
  );

  if (decisionId) {
    const exactMatches = usableTargets.filter(
      (row) => stringValue(row.decisionId) === decisionId && nutritionTargetCoversDate(row, date),
    );
    return exactMatches.length === 1
      ? historicalTargetFromRow(exactMatches[0]!, decisionId)
      : summaryFallback(summaryRow, decisionId);
  }

  if (nutritionTargetHasActiveAmbiguityForDate(usableTargets, date)) {
    return {
      decisionId: null,
      energyKcal: null,
      energyKcalLow: null,
      energyKcalHigh: null,
    };
  }

  const effective = selectNutritionTargetRowForDate(usableTargets, date, {
    includeSuperseded,
  });
  return effective ? historicalTargetFromRow(effective) : summaryFallback(summaryRow, null);
}
