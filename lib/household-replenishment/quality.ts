import { estimateCadence } from './engine';
import type {
  CorrectionEvent,
  PredictionQualitySummary,
  PurchaseEvent,
  ReplenishmentNeed,
} from './types';

const DAY_MS = 86_400_000;

function dayDifference(left: string, right: string): number {
  return (Date.parse(right) - Date.parse(left)) / DAY_MS;
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return left == null || right == null ? null : (left + right) / 2;
}

export function evaluatePredictionQuality(input: {
  needs: ReplenishmentNeed[];
  purchases: PurchaseEvent[];
  corrections: CorrectionEvent[];
}): PredictionQualitySummary {
  const activeNeeds = input.needs.filter((need) => need.active);
  const errors: number[] = [];
  let earlyCount = 0;
  let lateCount = 0;
  let withinToleranceCount = 0;
  let needsWithPurchases = 0;
  let needsWithThreePurchases = 0;

  for (const need of activeNeeds) {
    const purchases = input.purchases
      .filter((event) => event.needId === need.id)
      .sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt));

    if (purchases.length > 0) needsWithPurchases += 1;
    if (purchases.length >= 3) needsWithThreePurchases += 1;

    for (let index = 2; index < purchases.length; index += 1) {
      const target = purchases[index];
      if (!target) continue;
      const priorPurchases = purchases.slice(0, index);
      const lastPrior = priorPurchases.at(-1);
      if (!lastPrior) continue;

      const relevantCorrections = input.corrections.filter(
        (event) =>
          event.needId === need.id &&
          event.occurredAt > lastPrior.purchasedAt &&
          event.occurredAt < target.purchasedAt,
      );
      const estimate = estimateCadence({
        need,
        purchases: priorPurchases,
        corrections: relevantCorrections,
        now: new Date(target.purchasedAt),
      });
      if (!estimate.nextExpectedAt || !estimate.expectedIntervalDays) continue;

      const signedError = dayDifference(estimate.nextExpectedAt, target.purchasedAt);
      const absoluteError = Math.abs(signedError);
      const toleranceDays = Math.max(3, Math.min(10, estimate.expectedIntervalDays * 0.2));
      errors.push(absoluteError);

      if (absoluteError <= toleranceDays) {
        withinToleranceCount += 1;
      } else if (signedError > 0) {
        earlyCount += 1;
      } else {
        lateCount += 1;
      }
    }
  }

  const evaluatedPredictions = errors.length;
  const status: PredictionQualitySummary['status'] =
    evaluatedPredictions >= 10 && needsWithThreePurchases >= 3
      ? 'CALIBRATION_READY'
      : needsWithPurchases > 0
        ? 'COLLECTING'
        : 'NO_DATA';

  return {
    status,
    activeNeeds: activeNeeds.length,
    needsWithPurchases,
    needsWithThreePurchases,
    evaluatedPredictions,
    meanAbsoluteErrorDays:
      evaluatedPredictions === 0
        ? null
        : rounded(errors.reduce((sum, value) => sum + value, 0) / evaluatedPredictions),
    medianAbsoluteErrorDays: median(errors) == null ? null : rounded(median(errors) ?? 0),
    withinToleranceRate:
      evaluatedPredictions === 0 ? null : rounded(withinToleranceCount / evaluatedPredictions),
    earlyCount,
    lateCount,
    withinToleranceCount,
    stillHaveCorrections: input.corrections.filter((event) => event.type === 'STILL_HAVE').length,
    outCorrections: input.corrections.filter((event) => event.type === 'OUT').length,
  };
}
