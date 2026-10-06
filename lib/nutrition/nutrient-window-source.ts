import 'server-only';

import type { PlainCell } from '@/lib/data/plain';
import type { SheetReadCode } from '@/lib/google/errors';

import { auditNutritionNutrientSummaryFreshness } from './nutrient-summary-freshness';
import { sanitizeNutritionNutrientSummaryIntegrity } from './nutrient-summary-integrity';
import { sanitizeNutritionNutrientSummaryUniqueness } from './nutrient-summary-uniqueness';
import {
  buildNutritionNutrientWindow,
  type NutritionNutrientWindowData,
} from './nutrient-window';
import { readNutritionTabValues } from './sheets-read';

type Row = Record<string, PlainCell>;

function rowsFromValues(values: readonly (readonly PlainCell[])[]): Row[] {
  if (values.length === 0) return [];
  const headers = values[0]!.map((cell) => String(cell ?? '').trim());
  return values.slice(1).map((cells) => {
    const row: Row = {};
    headers.forEach((header, index) => {
      if (header) row[header] = cells[index] ?? null;
    });
    return row;
  });
}

export interface NutritionNutrientWindowResult extends NutritionNutrientWindowData {
  source: {
    status: 'ready' | 'partial' | 'unavailable';
    code: SheetReadCode | null;
    targetStatus: 'ready' | 'missing' | 'unavailable';
    staleDateCount: number;
    unverifiableDateCount: number;
    integrityDowngradedDateCount: number;
    integrityUnverifiableRowCount: number;
    integritySuppressedSubtotalRowCount: number;
    duplicateSummaryKeyCount: number;
    duplicateSummaryRowCount: number;
  };
}

function windowStartDate(endDate: string, windowDays: number): string {
  const date = new Date(`${endDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - Math.max(windowDays - 1, 0));
  return date.toISOString().slice(0, 10);
}

function optionalStatus(result: Awaited<ReturnType<typeof readNutritionTabValues>>) {
  if (result.ok) return 'ready' as const;
  return result.code === 'missing-tab' ? ('missing' as const) : ('unavailable' as const);
}

export async function loadNutritionNutrientWindow(
  endDate: string,
  windowDays: number,
): Promise<NutritionNutrientWindowResult> {
  const [
    summaryResult,
    targetResult,
    mealsResult,
    itemsResult,
    dailyResult,
    foodNutrientsResult,
  ] = await Promise.all([
    readNutritionTabValues('Nutrient Summary'),
    readNutritionTabValues('Nutrient Targets'),
    readNutritionTabValues('Meals'),
    readNutritionTabValues('Food Items'),
    readNutritionTabValues('Daily Summary'),
    readNutritionTabValues('Food Nutrients'),
  ]);

  const summaryRows = summaryResult.ok ? rowsFromValues(summaryResult.values) : [];
  const targetRows = targetResult.ok ? rowsFromValues(targetResult.values) : [];
  const mealRows = mealsResult.ok ? rowsFromValues(mealsResult.values) : [];
  const itemRows = itemsResult.ok ? rowsFromValues(itemsResult.values) : [];
  const dailyRows = dailyResult.ok ? rowsFromValues(dailyResult.values) : [];
  const foodNutrientRows = foodNutrientsResult.ok
    ? rowsFromValues(foodNutrientsResult.values)
    : [];
  const startDate = windowStartDate(endDate, windowDays);
  const uniqueness = sanitizeNutritionNutrientSummaryUniqueness(
    summaryRows,
    startDate,
    endDate,
  );
  const auditSourcesReady =
    mealsResult.ok && itemsResult.ok && dailyResult.ok && foodNutrientsResult.ok;

  const freshness = auditSourcesReady
    ? auditNutritionNutrientSummaryFreshness(
        uniqueness.rows,
        mealRows,
        itemRows,
        dailyRows,
        startDate,
        endDate,
        foodNutrientRows,
      )
    : uniqueness.rows
        .map((row) => String(row.date ?? '').trim())
        .filter((date) => date >= startDate && date <= endDate)
        .filter((date, index, values) => Boolean(date) && values.indexOf(date) === index)
        .map((date) => ({
          date,
          state: 'unverifiable' as const,
          latestEvidenceAt: null,
          earliestSummaryAt: null,
        }));

  const rejectedDates = new Set(
    freshness
      .filter((entry) => entry.state !== 'current')
      .map((entry) => entry.date),
  );
  const usableSummaryRows = uniqueness.rows.filter(
    (row) => !rejectedDates.has(String(row.date ?? '').trim()),
  );
  const integrity = sanitizeNutritionNutrientSummaryIntegrity(
    usableSummaryRows,
    mealRows,
    itemRows,
    foodNutrientRows,
    startDate,
    endDate,
  );
  const staleDateCount = freshness.filter((entry) => entry.state === 'stale').length;
  const unverifiableDateCount = freshness.filter(
    (entry) => entry.state === 'unverifiable',
  ).length;
  const data = buildNutritionNutrientWindow(
    integrity.rows,
    targetRows,
    endDate,
    windowDays,
  );

  if (!summaryResult.ok) {
    return {
      ...data,
      source: {
        status: 'unavailable',
        code: summaryResult.code,
        targetStatus: optionalStatus(targetResult),
        staleDateCount: 0,
        unverifiableDateCount: 0,
        integrityDowngradedDateCount: 0,
        integrityUnverifiableRowCount: 0,
        integritySuppressedSubtotalRowCount: 0,
        duplicateSummaryKeyCount: 0,
        duplicateSummaryRowCount: 0,
      },
    };
  }

  const targetStatus = optionalStatus(targetResult);
  const freshnessIssue = staleDateCount > 0 || unverifiableDateCount > 0;
  const integrityIssue = integrity.downgradedDateCount > 0;
  const uniquenessIssue = uniqueness.duplicateKeyCount > 0;

  return {
    ...data,
    source: {
      status:
        targetStatus === 'ready' &&
        !freshnessIssue &&
        !integrityIssue &&
        !uniquenessIssue
          ? 'ready'
          : 'partial',
      code: targetResult.ok ? null : targetResult.code,
      targetStatus,
      staleDateCount,
      unverifiableDateCount,
      integrityDowngradedDateCount: integrity.downgradedDateCount,
      integrityUnverifiableRowCount: integrity.unverifiableRowCount,
      integritySuppressedSubtotalRowCount: integrity.suppressedSubtotalRowCount,
      duplicateSummaryKeyCount: uniqueness.duplicateKeyCount,
      duplicateSummaryRowCount: uniqueness.duplicateRowCount,
    },
  };
}
