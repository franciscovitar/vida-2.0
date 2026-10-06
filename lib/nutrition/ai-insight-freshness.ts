import type { PlainCell } from '@/lib/data/plain';

export type NutritionAiInsightFreshness = 'current' | 'stale' | 'unverifiable';

type EvidenceRow = Readonly<Record<string, PlainCell | undefined>>;

export interface NutritionAiInsightEvidence {
  meals: readonly EvidenceRow[];
  foodItems: readonly EvidenceRow[];
  foodNutrients?: readonly EvidenceRow[];
  dailySummary: readonly EvidenceRow[];
  nutrientSummary: readonly EvidenceRow[];
  targets: readonly EvidenceRow[];
  nutrientTargets: readonly EvidenceRow[];
}

export interface NutritionAiInsightFreshnessResult {
  state: NutritionAiInsightFreshness;
  windowStart: string | null;
  windowEnd: string | null;
  latestEvidenceAt: string | null;
}

function stringValue(value: PlainCell | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function timestampValue(row: EvidenceRow): { raw: string; time: number } | null {
  for (const field of ['updatedAt', 'createdAt'] as const) {
    const raw = stringValue(row[field]);
    if (!raw) continue;
    const time = Date.parse(raw);
    if (Number.isFinite(time)) return { raw, time };
    return null;
  }
  return null;
}

function shiftDate(date: string, days: number): string | null {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function insightWindow(
  row: EvidenceRow,
  asOfDate: string,
): { start: string; end: string } | null {
  const end = stringValue(row.date) ?? asOfDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end > asOfDate) return null;

  const window = stringValue(row.window)?.toLowerCase();
  if (window === 'today-so-far' || window === 'day-closed') {
    return { start: end, end };
  }

  const daysMatch = window?.match(/^(\d{1,3})d$/);
  if (!daysMatch) return null;
  const days = Number(daysMatch[1]);
  if (!Number.isInteger(days) || days < 1 || days > 365) return null;
  const start = shiftDate(end, -(days - 1));
  return start ? { start, end } : null;
}

function dateInRange(value: PlainCell | undefined, start: string, end: string): boolean {
  const date = stringValue(value);
  return Boolean(date && date >= start && date <= end);
}

function targetIntersectsWindow(row: EvidenceRow, start: string, end: string): boolean {
  const from = stringValue(row.effectiveFrom);
  const to = stringValue(row.effectiveTo);
  return Boolean(from && from <= end && (!to || to >= start));
}

function relevantEvidenceRows(
  evidence: NutritionAiInsightEvidence,
  start: string,
  end: string,
): EvidenceRow[] {
  const meals = evidence.meals.filter((row) => dateInRange(row.date, start, end));
  const mealIds = new Set(
    meals
      .map((row) => stringValue(row.mealId))
      .filter((mealId): mealId is string => Boolean(mealId)),
  );
  const foodItems = evidence.foodItems.filter((row) => {
    const mealId = stringValue(row.mealId);
    return Boolean(mealId && mealIds.has(mealId));
  });
  const foodNutrients = (evidence.foodNutrients ?? []).filter((row) =>
    dateInRange(row.date, start, end),
  );
  const dailySummary = evidence.dailySummary.filter((row) =>
    dateInRange(row.date, start, end),
  );
  const nutrientSummary = evidence.nutrientSummary.filter((row) =>
    dateInRange(row.date, start, end),
  );
  const targets = evidence.targets.filter((row) => targetIntersectsWindow(row, start, end));
  const nutrientTargets = evidence.nutrientTargets.filter((row) =>
    targetIntersectsWindow(row, start, end),
  );

  return [
    ...meals,
    ...foodItems,
    ...foodNutrients,
    ...dailySummary,
    ...nutrientSummary,
    ...targets,
    ...nutrientTargets,
  ];
}

export function evaluateNutritionAiInsightFreshness(
  insight: EvidenceRow,
  evidence: NutritionAiInsightEvidence,
  asOfDate: string,
): NutritionAiInsightFreshnessResult {
  const window = insightWindow(insight, asOfDate);
  const createdAt = timestampValue({ createdAt: insight.createdAt });

  if (!window || !createdAt) {
    return {
      state: 'unverifiable',
      windowStart: window?.start ?? null,
      windowEnd: window?.end ?? null,
      latestEvidenceAt: null,
    };
  }

  const rows = relevantEvidenceRows(evidence, window.start, window.end);
  if (rows.length === 0) {
    return {
      state: 'unverifiable',
      windowStart: window.start,
      windowEnd: window.end,
      latestEvidenceAt: null,
    };
  }

  let latest: { raw: string; time: number } | null = null;
  for (const row of rows) {
    const timestamp = timestampValue(row);
    if (!timestamp) {
      return {
        state: 'unverifiable',
        windowStart: window.start,
        windowEnd: window.end,
        latestEvidenceAt: latest?.raw ?? null,
      };
    }
    if (!latest || timestamp.time > latest.time) latest = timestamp;
  }

  return {
    state: latest && latest.time > createdAt.time ? 'stale' : 'current',
    windowStart: window.start,
    windowEnd: window.end,
    latestEvidenceAt: latest?.raw ?? null,
  };
}
