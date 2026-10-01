type SheetRows = readonly (readonly unknown[])[];

export type FinanceMonthlyPace = 'calm' | 'watch' | 'accelerated' | 'over-target';

export interface FinanceMonthlyCategory {
  category: string;
  amountMinor: number;
  share: number;
}

export interface FinanceMonthlyTarget {
  month: string;
  currency: string;
  baseTargetMinor: number;
  activeTargetMinor: number;
  suggestedTargetMinor: number | null;
  suggestionStatus: string;
  suggestionReason: string;
  suggestionSource: string;
  suggestedAt: string | null;
  updatedAt: string;
}

export interface FinanceLiquidityCushionSource {
  key: string;
  label: string;
  amountMinor: number;
}

export interface FinanceLiquidityCushion {
  snapshotId: string;
  asOf: string;
  totalMinor: number;
  quality: string;
  openingEstimateMinor: number | null;
  sources: FinanceLiquidityCushionSource[];
}

export interface FinanceMonthlyDashboard {
  month: string;
  currency: string;
  incomeMinor: number;
  expenseMinor: number;
  balanceMinor: number;
  activeCaptureCount: number;
  liquidityCushion: FinanceLiquidityCushion | null;
  target: FinanceMonthlyTarget | null;
  remainingTargetMinor: number | null;
  targetUsedRatio: number | null;
  monthElapsedRatio: number;
  pace: FinanceMonthlyPace;
  categories: FinanceMonthlyCategory[];
}

function dataRows(rows: SheetRows): readonly (readonly unknown[])[] {
  return rows.slice(1).filter((row) => row.some((value) => String(value ?? '').trim() !== ''));
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthKey(value: string): string {
  return value.slice(0, 7);
}

function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return 30;
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function dayOfMonth(asOf: string): number {
  const day = Number(asOf.slice(8, 10));
  return Number.isFinite(day) && day > 0 ? day : 1;
}

function resolvePace(
  targetUsedRatio: number | null,
  monthElapsedRatio: number,
): FinanceMonthlyPace {
  if (targetUsedRatio === null) return 'calm';
  if (targetUsedRatio >= 1) return 'over-target';
  if (targetUsedRatio > monthElapsedRatio + 0.15) return 'accelerated';
  if (targetUsedRatio > monthElapsedRatio + 0.05) return 'watch';
  return 'calm';
}

export function buildFinanceMonthlyDashboard(input: {
  manualIntake: SheetRows;
  monthlyTargets: SheetRows;
  liquiditySnapshots?: SheetRows;
  month: string;
  currency: string;
  asOf: string;
}): FinanceMonthlyDashboard {
  const currency = input.currency.trim().toUpperCase();
  const captures = dataRows(input.manualIntake).filter((row) => {
    return (
      text(row[10]) === 'active' &&
      text(row[6]).toUpperCase() === currency &&
      monthKey(text(row[1])) === input.month
    );
  });

  let incomeMinor = 0;
  let expenseMinor = 0;
  const categoryTotals = new Map<string, number>();

  for (const row of captures) {
    const direction = text(row[4]);
    const amountMinor = Math.abs(number(row[5]));
    if (direction === 'income') {
      incomeMinor += amountMinor;
      continue;
    }
    if (direction !== 'expense') continue;
    expenseMinor += amountMinor;
    const category = text(row[7]) || 'otros';
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + amountMinor);
  }

  const targetRow = dataRows(input.monthlyTargets).find(
    (row) => text(row[0]) === input.month && text(row[1]).toUpperCase() === currency,
  );
  const target = targetRow
    ? {
        month: text(targetRow[0]),
        currency: text(targetRow[1]).toUpperCase(),
        baseTargetMinor: number(targetRow[2]),
        activeTargetMinor: number(targetRow[3]),
        suggestedTargetMinor: nullableNumber(targetRow[4]),
        suggestionStatus: text(targetRow[5]),
        suggestionReason: text(targetRow[6]),
        suggestionSource: text(targetRow[7]),
        suggestedAt: text(targetRow[8]) || null,
        updatedAt: text(targetRow[9]),
      }
    : null;

  const balanceMinor = incomeMinor - expenseMinor;
  const liquidityRows = input.liquiditySnapshots ? dataRows(input.liquiditySnapshots) : [];
  const liquidityGroups = new Map<
    string,
    { asOf: string; asOfMs: number; rows: readonly (readonly unknown[])[] }
  >();

  for (const row of liquidityRows) {
    if (text(row[7]) !== 'active' || text(row[2]).toUpperCase() !== currency) continue;
    const snapshotId = text(row[0]);
    const asOf = text(row[1]);
    const asOfMs = Date.parse(asOf);
    if (!snapshotId || !Number.isFinite(asOfMs)) continue;

    const existing = liquidityGroups.get(snapshotId);
    if (existing) {
      liquidityGroups.set(snapshotId, {
        asOf: asOfMs > existing.asOfMs ? asOf : existing.asOf,
        asOfMs: Math.max(asOfMs, existing.asOfMs),
        rows: [...existing.rows, row],
      });
    } else {
      liquidityGroups.set(snapshotId, { asOf, asOfMs, rows: [row] });
    }
  }

  const latestLiquidityGroup =
    [...liquidityGroups.entries()].sort(
      (left, right) =>
        right[1].asOfMs - left[1].asOfMs || right[0].localeCompare(left[0]),
    )[0] ?? null;

  const liquidityCushion: FinanceLiquidityCushion | null = latestLiquidityGroup
    ? (() => {
        const [snapshotId, group] = latestLiquidityGroup;
        const sources = group.rows
          .map((row) => ({
            key: text(row[3]),
            label: text(row[4]) || text(row[3]) || 'Liquidez',
            amountMinor: number(row[5]),
            quality: text(row[6]) || 'unknown',
          }))
          .filter((item) => item.key && item.amountMinor >= 0)
          .sort(
            (left, right) =>
              right.amountMinor - left.amountMinor || left.label.localeCompare(right.label),
          );
        const totalMinor = sources.reduce((total, item) => total + item.amountMinor, 0);
        const qualities = [...new Set(sources.map((item) => item.quality))];
        const openingEstimate = totalMinor - balanceMinor;

        return {
          snapshotId,
          asOf: group.asOf,
          totalMinor,
          quality: qualities.length === 1 ? qualities[0] : 'mixed',
          openingEstimateMinor:
            monthKey(group.asOf) === input.month && openingEstimate >= 0 ? openingEstimate : null,
          sources: sources.map(({ key, label, amountMinor }) => ({ key, label, amountMinor })),
        };
      })()
    : null;

  const targetUsedRatio =
    target && target.activeTargetMinor > 0 ? expenseMinor / target.activeTargetMinor : null;
  const elapsed = Math.min(1, Math.max(0, dayOfMonth(input.asOf) / daysInMonth(input.month)));

  const categories = [...categoryTotals.entries()]
    .map(([category, amountMinor]) => ({
      category,
      amountMinor,
      share: expenseMinor > 0 ? amountMinor / expenseMinor : 0,
    }))
    .sort((left, right) => right.amountMinor - left.amountMinor);

  return {
    month: input.month,
    currency,
    incomeMinor,
    expenseMinor,
    balanceMinor,
    activeCaptureCount: captures.length,
    liquidityCushion,
    target,
    remainingTargetMinor: target ? Math.max(0, target.activeTargetMinor - expenseMinor) : null,
    targetUsedRatio,
    monthElapsedRatio: elapsed,
    pace: resolvePace(targetUsedRatio, elapsed),
    categories,
  };
}
