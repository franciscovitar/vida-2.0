import type { PlainCell } from '@/lib/data/plain';

import type { NutritionCoverage, NutritionEstimateQuality } from './types';

type EnergyRow = Readonly<Record<string, PlainCell | undefined>>;

export interface NutritionRawDayEnergy {
  amount: number | null;
  low: number | null;
  high: number | null;
  coverage: NutritionCoverage;
  quality: NutritionEstimateQuality;
  quantifiedItemCount: number;
  totalItemCount: number;
  lowConfidenceItemCount: number;
}

function numberValue(value: PlainCell | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function confidenceValue(value: PlainCell | undefined): NutritionEstimateQuality {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
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
  if (unique.has('mixed') || unique.has('unknown') || unique.has('low')) return 'mixed';
  if (unique.has('medium')) return 'medium';
  return 'high';
}

export function summarizeNutritionRawDayEnergy(
  items: readonly EnergyRow[],
): NutritionRawDayEnergy {
  if (items.length === 0) {
    return {
      amount: null,
      low: null,
      high: null,
      coverage: 'none',
      quality: 'unknown',
      quantifiedItemCount: 0,
      totalItemCount: 0,
      lowConfidenceItemCount: 0,
    };
  }

  let central = 0;
  let low = 0;
  let high = 0;
  let centralComplete = true;
  let lowKnown = 0;
  let highKnown = 0;
  let quantifiedItemCount = 0;
  let fullyQuantifiedItemCount = 0;
  let lowConfidenceItemCount = 0;
  const qualities: NutritionEstimateQuality[] = [];

  for (const item of items) {
    const centralValue = numberValue(item.energyKcal);
    const lowValue = numberValue(item.energyKcalLow);
    const highValue = numberValue(item.energyKcalHigh);
    const hasRange = lowValue !== null && highValue !== null;
    const hasUsableEnergy = centralValue !== null || hasRange;

    if (centralValue === null) centralComplete = false;
    else central += centralValue;

    if (lowValue !== null || centralValue !== null) {
      low += lowValue ?? centralValue ?? 0;
      lowKnown += 1;
    }

    if (highValue !== null || centralValue !== null) {
      high += highValue ?? centralValue ?? 0;
      highKnown += 1;
    }

    if (centralValue !== null || lowValue !== null || highValue !== null) {
      quantifiedItemCount += 1;
      qualities.push(confidenceValue(item.confidence));
    }
    if (hasUsableEnergy) fullyQuantifiedItemCount += 1;
    if (confidenceValue(item.confidence) === 'low') lowConfidenceItemCount += 1;
  }

  const coverage: NutritionCoverage =
    fullyQuantifiedItemCount === items.length
      ? 'complete'
      : quantifiedItemCount > 0
        ? 'partial'
        : 'none';

  return {
    amount: centralComplete ? central : null,
    low: lowKnown > 0 ? low : null,
    high: highKnown > 0 ? high : null,
    coverage,
    quality: aggregateQuality(qualities),
    quantifiedItemCount,
    totalItemCount: items.length,
    lowConfidenceItemCount,
  };
}
