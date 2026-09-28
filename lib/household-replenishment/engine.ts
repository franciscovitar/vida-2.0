import type {
  CadenceEstimate,
  CorrectionEvent,
  PurchaseEvent,
  ReplenishmentConfidence,
  ReplenishmentNeed,
  UserCorrectionType,
} from './types';

const DAY_MS = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.max(0, (Date.parse(b) - Date.parse(a)) / DAY_MS);
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  if (left == null || right == null) return null;
  return (left + right) / 2;
}

function confidenceFor(purchases: PurchaseEvent[], intervals: number[]): ReplenishmentConfidence {
  if (purchases.length <= 1) return 'LOW';
  if (purchases.length <= 3) return 'MEDIUM';

  const center = median(intervals);
  if (!center || center <= 0) return 'MEDIUM';

  const deviations = intervals.map((value) => Math.abs(value - center));
  const mad = median(deviations) ?? center;
  return mad / center <= 0.25 ? 'HIGH' : 'MEDIUM';
}

function latestUserCorrection(
  corrections: CorrectionEvent[],
  after: string,
): CorrectionEvent | null {
  return (
    corrections
      .filter(
        (event) =>
          event.occurredAt > after &&
          (event.type === 'STILL_HAVE' || event.type === 'LOW' || event.type === 'OUT'),
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0] ?? null
  );
}

export function estimateCadence(input: {
  need: ReplenishmentNeed;
  purchases: PurchaseEvent[];
  corrections: CorrectionEvent[];
  now: Date;
}): CadenceEstimate {
  const purchases = [...input.purchases].sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt));
  const intervals = purchases.slice(1).map((event, index) => {
    const previous = purchases[index];
    return previous ? daysBetween(previous.purchasedAt, event.purchasedAt) : 0;
  });
  const observedCenter = median(intervals);
  const baseInterval = observedCenter ?? input.need.manualSeedIntervalDays;
  const confidence = confidenceFor(purchases, intervals);

  if (purchases.length === 0 || !baseInterval || baseInterval <= 0) {
    return {
      expectedIntervalDays: baseInterval ?? null,
      variabilityDays: null,
      nextExpectedAt: null,
      suggestAt: null,
      confidence,
      state: 'NOT_DUE',
      forcedByCorrection: null,
      observations: purchases.length,
    };
  }

  const latestPurchase = purchases[purchases.length - 1];
  if (!latestPurchase) {
    throw new Error('latest purchase missing after non-empty check');
  }

  const relevantCorrections = input.corrections.filter(
    (event) => event.occurredAt > latestPurchase.purchasedAt,
  );
  const stillHaveCount = relevantCorrections.filter((event) => event.type === 'STILL_HAVE').length;
  const outCount = relevantCorrections.filter((event) => event.type === 'OUT').length;
  const correctionFactor = Math.min(1.5, 1.1 ** stillHaveCount) * Math.max(0.6, 0.9 ** outCount);
  const expectedIntervalDays = Math.max(1, baseInterval * correctionFactor);
  const deviations = intervals.map((value) => Math.abs(value - (observedCenter ?? value)));
  const variabilityDays = median(deviations);

  const leadDays = Math.max(2, Math.min(7, expectedIntervalDays * 0.15));
  let nextExpectedAt = addDays(latestPurchase.purchasedAt, expectedIntervalDays);
  const latestCorrection = latestUserCorrection(relevantCorrections, latestPurchase.purchasedAt);
  const forcedByCorrection =
    latestCorrection?.type === 'LOW' || latestCorrection?.type === 'OUT'
      ? (latestCorrection.type as UserCorrectionType)
      : null;

  if (
    latestCorrection?.type === 'STILL_HAVE' &&
    addDays(nextExpectedAt, -leadDays) <= latestCorrection.occurredAt
  ) {
    nextExpectedAt = addDays(latestCorrection.occurredAt, leadDays + Math.max(3, leadDays));
  }

  const suggestAt = addDays(nextExpectedAt, -leadDays);
  const nowIso = input.now.toISOString();

  let state: CadenceEstimate['state'] = 'NOT_DUE';
  if (forcedByCorrection) {
    state = 'ADD_TO_LIST';
  } else if (nowIso >= nextExpectedAt) {
    state = confidence === 'HIGH' ? 'OVERDUE' : confidence === 'MEDIUM' ? 'WATCH' : 'NOT_DUE';
  } else if (nowIso >= suggestAt) {
    state = confidence === 'HIGH' ? 'ADD_TO_LIST' : confidence === 'MEDIUM' ? 'WATCH' : 'NOT_DUE';
  }

  return {
    expectedIntervalDays,
    variabilityDays,
    nextExpectedAt,
    suggestAt,
    confidence,
    state,
    forcedByCorrection,
    observations: purchases.length,
  };
}
