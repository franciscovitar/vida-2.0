import type { PlainCell } from '@/lib/data/plain';

import { NUTRIENT_CATALOG } from './nutrient-catalog';
import { nutritionDisplayPointEstimate } from './presentation';
import { classifyNutritionTargetSemantics } from './target-semantics';
import type {
  NutritionCoverage,
  NutritionEstimateQuality,
  NutritionNutrientTargetSemantics,
  NutrientGroup,
} from './types';

export type NutritionNutrientAttentionKind =
  | 'below-reference'
  | 'below-target'
  | 'above-limit'
  | 'outside-range'
  | 'mixed'
  | 'none';

export interface NutritionNutrientReference {
  decisionId: string | null;
  target: number | null;
  lowerTarget: number | null;
  upperTarget: number | null;
  basis: string | null;
  semantics: NutritionNutrientTargetSemantics;
}

export interface NutritionNutrientWindowRow {
  key: string;
  name: string;
  group: NutrientGroup;
  unit: string;
  averageAmount: number | null;
  averageApproximate: boolean;
  daysWithData: number;
  completeDays: number;
  partialDays: number;
  confidence: NutritionEstimateQuality;
  currentReference: NutritionNutrientReference | null;
  targetDecisionCount: number;
  evaluatedDays: number;
  attentionDays: number;
  attentionRate: number | null;
  attentionKind: NutritionNutrientAttentionKind;
}

export interface NutritionNutrientWindowData {
  startDate: string;
  endDate: string;
  windowDays: number;
  trackedDateCount: number;
  nutrients: readonly NutritionNutrientWindowRow[];
  attention: readonly NutritionNutrientWindowRow[];
}

type Row = Record<string, PlainCell>;

function stringValue(value: PlainCell): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function numberValue(value: PlainCell): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function activeRows(rows: readonly Row[]): Row[] {
  return rows.filter((row) => (stringValue(row.status)?.toLowerCase() ?? 'active') === 'active');
}

function coverageValue(value: PlainCell): NutritionCoverage {
  const normalized = stringValue(value)?.toLowerCase();
  return normalized === 'complete' ||
    normalized === 'partial' ||
    normalized === 'none' ||
    normalized === 'unknown'
    ? normalized
    : 'unknown';
}

function qualityValue(value: PlainCell): NutritionEstimateQuality {
  const normalized = stringValue(value)?.toLowerCase();
  return normalized === 'high' ||
    normalized === 'medium' ||
    normalized === 'low' ||
    normalized === 'mixed' ||
    normalized === 'unknown'
    ? normalized
    : 'unknown';
}

function aggregateQuality(values: readonly NutritionEstimateQuality[]): NutritionEstimateQuality {
  if (values.length === 0) return 'unknown';
  const unique = new Set(values);
  if (unique.size === 1) return values[0]!;
  if (unique.has('unknown') || unique.has('mixed') || unique.has('low')) return 'mixed';
  if (unique.has('medium')) return 'medium';
  return 'high';
}

function startDateFor(endDate: string, windowDays: number): string {
  const date = new Date(`${endDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - Math.max(windowDays - 1, 0));
  return date.toISOString().slice(0, 10);
}

function referenceFromRow(row: Row | null): NutritionNutrientReference | null {
  if (!row) return null;
  const target = numberValue(row.targetAmount ?? row.target);
  const lowerTarget = numberValue(row.lowerTarget);
  const upperTarget = numberValue(row.upperTarget);
  const basis = stringValue(row.basis);
  const semantics = classifyNutritionTargetSemantics({
    target,
    lowerTarget,
    upperTarget,
    basis,
  });
  if (semantics === 'none') return null;
  return {
    decisionId: stringValue(row.decisionId ?? row.targetDecisionId),
    target,
    lowerTarget,
    upperTarget,
    basis,
    semantics,
  };
}

function targetRowForDate(
  rows: readonly Row[],
  nutrientKey: string,
  date: string,
): Row | null {
  return (
    activeRows(rows)
      .filter((row) => {
        const key = stringValue(row.nutrientKey);
        const from = stringValue(row.effectiveFrom);
        const to = stringValue(row.effectiveTo);
        return key === nutrientKey && Boolean(from && from <= date && (!to || to >= date));
      })
      .sort((a, b) =>
        (stringValue(b.effectiveFrom) ?? '').localeCompare(stringValue(a.effectiveFrom) ?? ''),
      )[0] ?? null
  );
}

function referenceForDay(
  targetRows: readonly Row[],
  nutrientKey: string,
  date: string,
): NutritionNutrientReference | null {
  return referenceFromRow(targetRowForDate(targetRows, nutrientKey, date));
}

function attentionKindFor(
  semantics: NutritionNutrientTargetSemantics,
): NutritionNutrientAttentionKind {
  if (semantics === 'adequacy') return 'below-reference';
  if (semantics === 'point') return 'below-target';
  if (semantics === 'upper-limit') return 'above-limit';
  if (semantics === 'range') return 'outside-range';
  return 'none';
}

function needsAttention(value: number, reference: NutritionNutrientReference): boolean | null {
  if (reference.semantics === 'adequacy') {
    const minimum = reference.target ?? reference.lowerTarget;
    return minimum === null ? null : value < minimum;
  }

  if (reference.semantics === 'point') {
    return reference.target === null ? null : value < reference.target;
  }

  if (reference.semantics === 'upper-limit') {
    const limit = reference.upperTarget ?? reference.target;
    return limit === null ? null : value > limit;
  }

  if (reference.semantics === 'range') {
    if (reference.lowerTarget === null && reference.upperTarget === null) return null;
    if (reference.lowerTarget !== null && value < reference.lowerTarget) return true;
    if (reference.upperTarget !== null && value > reference.upperTarget) return true;
    return false;
  }

  return null;
}

export function buildNutritionNutrientWindow(
  summaryRows: readonly Row[],
  targetRows: readonly Row[],
  endDate: string,
  windowDays: number,
): NutritionNutrientWindowData {
  const startDate = startDateFor(endDate, windowDays);
  const rows = activeRows(summaryRows).filter((row) => {
    const date = stringValue(row.date);
    return Boolean(date && date >= startDate && date <= endDate);
  });
  const trackedDates = new Set(
    rows
      .map((row) => stringValue(row.date))
      .filter((date): date is string => Boolean(date)),
  );

  const nutrients = NUTRIENT_CATALOG.map((catalog) => {
    const nutrientRows = rows
      .filter((row) => stringValue(row.nutrientKey) === catalog.key)
      .sort((a, b) => (stringValue(a.date) ?? '').localeCompare(stringValue(b.date) ?? ''));

    const completePoints: Array<{
      value: number;
      approximate: boolean;
      quality: NutritionEstimateQuality;
      reference: NutritionNutrientReference | null;
    }> = [];

    let daysWithData = 0;
    let partialDays = 0;

    for (const row of nutrientRows) {
      const display = nutritionDisplayPointEstimate(
        numberValue(row.amount),
        numberValue(row.amountLow),
        numberValue(row.amountHigh),
      );
      const coverage = coverageValue(row.sourceCoverage ?? row.coverage);
      if (display.value !== null) daysWithData += 1;
      if (coverage === 'partial' && display.value !== null) partialDays += 1;
      if (coverage !== 'complete' || display.value === null) continue;

      const date = stringValue(row.date);
      completePoints.push({
        value: display.value,
        approximate: display.approximate,
        quality: qualityValue(row.confidence),
        reference: date ? referenceForDay(targetRows, catalog.key, date) : null,
      });
    }

    const averageAmount =
      completePoints.length === 0
        ? null
        : completePoints.reduce((sum, point) => sum + point.value, 0) / completePoints.length;
    const currentTargetRow = targetRowForDate(targetRows, catalog.key, endDate);
    const currentReference = referenceFromRow(currentTargetRow);

    let evaluatedDays = 0;
    let attentionDays = 0;
    const kinds = new Set<NutritionNutrientAttentionKind>();
    const targetDecisionIds = new Set<string>();

    for (const point of completePoints) {
      if (!point.reference) continue;
      const result = needsAttention(point.value, point.reference);
      if (result === null) continue;
      evaluatedDays += 1;
      if (result) attentionDays += 1;
      const kind = attentionKindFor(point.reference.semantics);
      if (kind !== 'none') kinds.add(kind);
      if (point.reference.decisionId) targetDecisionIds.add(point.reference.decisionId);
    }

    const attentionKind: NutritionNutrientAttentionKind =
      kinds.size === 0 ? 'none' : kinds.size === 1 ? [...kinds][0]! : 'mixed';

    return {
      key: catalog.key,
      name: catalog.name,
      group: catalog.group,
      unit: currentReference ? stringValue(currentTargetRow?.unit) ?? catalog.unit : catalog.unit,
      averageAmount,
      averageApproximate: completePoints.some((point) => point.approximate),
      daysWithData,
      completeDays: completePoints.length,
      partialDays,
      confidence: aggregateQuality(completePoints.map((point) => point.quality)),
      currentReference,
      targetDecisionCount: targetDecisionIds.size,
      evaluatedDays,
      attentionDays,
      attentionRate: evaluatedDays > 0 ? attentionDays / evaluatedDays : null,
      attentionKind,
    } satisfies NutritionNutrientWindowRow;
  });

  const attention = nutrients
    .filter(
      (nutrient) =>
        nutrient.evaluatedDays >= 3 &&
        nutrient.attentionDays >= 2 &&
        nutrient.attentionRate !== null &&
        nutrient.attentionRate >= 0.5,
    )
    .sort(
      (a, b) =>
        (b.attentionRate ?? 0) - (a.attentionRate ?? 0) ||
        b.evaluatedDays - a.evaluatedDays ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 6);

  return {
    startDate,
    endDate,
    windowDays,
    trackedDateCount: trackedDates.size,
    nutrients,
    attention,
  };
}
