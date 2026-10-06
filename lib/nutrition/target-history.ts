import type { PlainCell } from '@/lib/data/plain';

type HistoricalRow = Readonly<Record<string, PlainCell | undefined>>;

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

function canRepresentHistoricalDecision(row: HistoricalRow): boolean {
  const status = stringValue(row.status)?.toLowerCase();
  return status === null || status === 'active' || status === 'superseded';
}

function historicalTargetFromRow(
  row: HistoricalRow,
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
  summaryRow: HistoricalRow,
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
  summaryRow: HistoricalRow,
  targetRows: readonly HistoricalRow[],
  date: string,
): NutritionHistoricalEnergyTarget {
  const decisionId = stringValue(summaryRow.targetDecisionId);
  const usableTargets = targetRows.filter(canRepresentHistoricalDecision);

  if (decisionId) {
    const exact = usableTargets.find((row) => stringValue(row.decisionId) === decisionId);
    return exact
      ? historicalTargetFromRow(exact, decisionId)
      : summaryFallback(summaryRow, decisionId);
  }

  const effective =
    usableTargets
      .filter((row) => {
        const from = stringValue(row.effectiveFrom);
        const to = stringValue(row.effectiveTo);
        return Boolean(from && from <= date && (!to || to >= date));
      })
      .sort((a, b) =>
        (stringValue(b.effectiveFrom) ?? '').localeCompare(stringValue(a.effectiveFrom) ?? ''),
      )[0] ?? null;

  return effective ? historicalTargetFromRow(effective) : summaryFallback(summaryRow, null);
}
