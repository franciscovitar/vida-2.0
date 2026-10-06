import type { PlainCell } from '@/lib/data/plain';

import { summarizeNutritionRawDayEnergy } from './day-energy';
import { resolveNutritionHistoricalEnergyTarget } from './target-history';
import type { NutritionCoverage, NutritionDailyPoint } from './types';

export type NutritionRawHistoryRow = Readonly<Record<string, PlainCell | undefined>>;

export interface NutritionRawDayFacts {
  date: string;
  mealCount: number;
  validItemCount: number;
  unknownContributionCount: number;
  energy: ReturnType<typeof summarizeNutritionRawDayEnergy>;
  macroCoverage: NutritionCoverage;
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

function isActive(row: NutritionRawHistoryRow): boolean {
  return (stringValue(row.status)?.toLowerCase() ?? 'active') === 'active';
}

function rawMacroCoverage(
  items: readonly NutritionRawHistoryRow[],
  unknownContributionCount: number,
): NutritionCoverage {
  const columns = ['proteinGrams', 'carbohydrateGrams', 'fatGrams', 'fiberGrams'] as const;
  if (items.length === 0) return 'none';

  const knownCounts = columns.map(
    (column) => items.filter((item) => numberValue(item[column]) !== null).length,
  );
  const allComplete =
    unknownContributionCount === 0 && knownCounts.every((count) => count === items.length);
  if (allComplete) return 'complete';
  if (knownCounts.some((count) => count > 0)) return 'partial';
  return 'none';
}

export function buildNutritionRawDayFacts(
  mealRows: readonly NutritionRawHistoryRow[],
  validItemRows: readonly NutritionRawHistoryRow[],
  invalidItemRows: readonly NutritionRawHistoryRow[],
  endDate: string,
  invalidMealRows: readonly NutritionRawHistoryRow[] = [],
): Map<string, NutritionRawDayFacts> {
  const relevantMeals = mealRows.filter((row) => {
    const date = stringValue(row.date);
    return Boolean(date && date <= endDate);
  });
  const activeMeals = relevantMeals.filter(isActive);
  const activeValidItems = validItemRows.filter(isActive);
  const facts = new Map<string, NutritionRawDayFacts>();

  const dates = new Set(
    [...relevantMeals, ...invalidMealRows]
      .map((row) => stringValue(row.date))
      .filter((date): date is string => Boolean(date && date <= endDate)),
  );

  for (const date of dates) {
    const meals = activeMeals.filter((row) => stringValue(row.date) === date);
    const mealIds = new Set(
      meals
        .map((row) => stringValue(row.mealId))
        .filter((mealId): mealId is string => Boolean(mealId)),
    );
    const validItems = activeValidItems.filter((row) => {
      const mealId = stringValue(row.mealId);
      return Boolean(mealId && mealIds.has(mealId));
    });
    const invalidItems = invalidItemRows.filter((row) => {
      if (!isActive(row)) return false;
      const mealId = stringValue(row.mealId);
      return Boolean(mealId && mealIds.has(mealId));
    });

    const representedMealIds = new Set(
      [...validItems, ...invalidItems]
        .map((row) => stringValue(row.mealId))
        .filter((mealId): mealId is string => Boolean(mealId)),
    );
    const mealsWithoutItems = [...mealIds].filter(
      (mealId) => !representedMealIds.has(mealId),
    ).length;
    const invalidMealsOnDate = invalidMealRows.filter(
      (row) => isActive(row) && stringValue(row.date) === date,
    ).length;
    const unknownContributionCount =
      invalidItems.length + mealsWithoutItems + invalidMealsOnDate;
    const energy = summarizeNutritionRawDayEnergy(validItems, {
      additionalUnknownItemCount: unknownContributionCount,
    });

    facts.set(date, {
      date,
      mealCount: meals.length,
      validItemCount: validItems.length,
      unknownContributionCount,
      energy,
      macroCoverage: rawMacroCoverage(validItems, unknownContributionCount),
    });
  }

  return facts;
}

function pointAsSummaryRow(point: NutritionDailyPoint | null): NutritionRawHistoryRow {
  if (!point) return {};
  return {
    targetDecisionId: point.targetDecisionId,
    energyTargetKcal: point.energyTargetKcal,
  };
}

export function reconcileNutritionHistoryWithRaw(
  summaryPoints: readonly NutritionDailyPoint[],
  targetRows: readonly NutritionRawHistoryRow[],
  rawDays: ReadonlyMap<string, NutritionRawDayFacts>,
  endDate: string,
  currentDate: string,
  maxDays = 90,
): NutritionDailyPoint[] {
  const byDate = new Map(
    summaryPoints.filter((point) => point.date <= endDate).map((point) => [point.date, point]),
  );

  for (const [date, raw] of rawDays) {
    if (date > endDate) continue;
    const base = byDate.get(date) ?? null;
    const historicalTarget = resolveNutritionHistoricalEnergyTarget(
      pointAsSummaryRow(base),
      targetRows,
      date,
      currentDate,
    );
    byDate.set(date, {
      date,
      energyKcal: raw.energy.amount,
      energyKcalLow: raw.energy.low,
      energyKcalHigh: raw.energy.high,
      targetDecisionId: historicalTarget.decisionId,
      energyTargetKcal: historicalTarget.energyKcal,
      energyTargetKcalLow: historicalTarget.energyKcalLow,
      energyTargetKcalHigh: historicalTarget.energyKcalHigh,
      estimateQuality: raw.energy.quality,
      energyCoverage: raw.energy.coverage,
      macroCoverage: raw.macroCoverage,
      trackedMealCount: raw.mealCount,
      lowConfidenceItemCount: raw.energy.lowConfidenceItemCount,
    });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-maxDays);
}
