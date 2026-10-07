type SheetRows = readonly (readonly unknown[])[];

export type FinanceMonthlyPace = 'calm' | 'watch' | 'accelerated' | 'over-target';

export interface FinanceMonthlyCategory {
  category: string;
  amountMinor: number;
  share: number;
}

export interface FinanceMonthlyMovement {
  id: string;
  occurredAt: string;
  direction: 'income' | 'expense';
  amountMinor: number;
  currency: string;
  category: string;
  liquiditySourceLabel: string;
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
  includedThroughOccurredAt: string | null;
  baseTotalMinor: number;
  movementDeltaMinor: number;
  totalMinor: number;
  quality: string;
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
  recentMovements: FinanceMonthlyMovement[];
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

interface FinanceLiquiditySnapshotGroup {
  asOf: string;
  asOfMs: number;
  rows: SheetRows;
}

function defaultLiquiditySourceKey(currency: string): string | null {
  return currency === 'ARS' ? 'naranja-x:ars' : null;
}

function fallbackLiquiditySourceLabel(sourceKey: string): string {
  if (sourceKey === 'naranja-x:ars') return 'Naranja X';
  if (sourceKey === 'cash:ars') return 'Efectivo';
  return sourceKey;
}

function buildLiquidityCushion(input: {
  snapshotRows: SheetRows;
  manualIntakeRows: SheetRows;
  currency: string;
}): FinanceLiquidityCushion | null {
  const groups = new Map<string, FinanceLiquiditySnapshotGroup>();

  for (const row of dataRows(input.snapshotRows)) {
    if (text(row[7]) !== 'active' || text(row[2]).toUpperCase() !== input.currency) continue;

    const snapshotId = text(row[0]);
    const asOf = text(row[1]);
    const asOfMs = Date.parse(asOf);
    if (!snapshotId || !Number.isFinite(asOfMs)) continue;

    const existing = groups.get(snapshotId);
    groups.set(snapshotId, {
      asOf: existing && existing.asOfMs >= asOfMs ? existing.asOf : asOf,
      asOfMs: Math.max(asOfMs, existing?.asOfMs ?? asOfMs),
      rows: existing ? [...existing.rows, row] : [row],
    });
  }

  let latest: { snapshotId: string; group: FinanceLiquiditySnapshotGroup } | null = null;
  for (const [snapshotId, group] of groups) {
    const isNewer =
      !latest ||
      group.asOfMs > latest.group.asOfMs ||
      (group.asOfMs === latest.group.asOfMs && snapshotId > latest.snapshotId);
    if (isNewer) latest = { snapshotId, group };
  }
  if (!latest) return null;

  const balances = new Map<
    string,
    { key: string; label: string; amountMinor: number; quality: string }
  >();
  for (const row of latest.group.rows) {
    const key = text(row[3]);
    if (!key) continue;
    balances.set(key, {
      key,
      label: text(row[4]) || fallbackLiquiditySourceLabel(key),
      amountMinor: number(row[5]),
      quality: text(row[6]) || 'unknown',
    });
  }

  const baseTotalMinor = [...balances.values()].reduce(
    (total, source) => total + source.amountMinor,
    0,
  );
  const cutoffs = latest.group.rows
    .map((row) => text(row[10]))
    .map((value) => ({ value, timestamp: Date.parse(value) }))
    .filter((item) => item.value && Number.isFinite(item.timestamp))
    .sort((left, right) => right.timestamp - left.timestamp);
  const includedThroughOccurredAt = cutoffs[0]?.value ?? null;
  const cutoffMs = cutoffs[0]?.timestamp ?? null;

  let movementDeltaMinor = 0;
  if (cutoffMs !== null) {
    for (const row of dataRows(input.manualIntakeRows)) {
      if (text(row[10]) !== 'active' || text(row[6]).toUpperCase() !== input.currency) continue;

      const occurredAtMs = Date.parse(text(row[1]));
      if (!Number.isFinite(occurredAtMs) || occurredAtMs <= cutoffMs) continue;

      const direction = text(row[4]);
      if (direction !== 'income' && direction !== 'expense') continue;

      const sourceKey = text(row[14]) || defaultLiquiditySourceKey(input.currency);
      if (!sourceKey) continue;

      const amountMinor = Math.abs(number(row[5]));
      const deltaMinor = direction === 'income' ? amountMinor : -amountMinor;
      const existing = balances.get(sourceKey);
      balances.set(sourceKey, {
        key: sourceKey,
        label: existing?.label ?? fallbackLiquiditySourceLabel(sourceKey),
        amountMinor: (existing?.amountMinor ?? 0) + deltaMinor,
        quality: existing?.quality ?? 'manual_derived',
      });
      movementDeltaMinor += deltaMinor;
    }
  }

  const sources = [...balances.values()]
    .sort(
      (left, right) =>
        right.amountMinor - left.amountMinor || left.label.localeCompare(right.label),
    )
    .map(({ key, label, amountMinor }) => ({ key, label, amountMinor }));
  const qualities = [...new Set([...balances.values()].map((item) => item.quality))];

  return {
    snapshotId: latest.snapshotId,
    asOf: latest.group.asOf,
    includedThroughOccurredAt,
    baseTotalMinor,
    movementDeltaMinor,
    totalMinor: baseTotalMinor + movementDeltaMinor,
    quality:
      movementDeltaMinor === 0 && qualities.length === 1
        ? qualities[0]
        : 'user_reported_plus_manual',
    sources,
  };
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
  const liquidityCushion = buildLiquidityCushion({
    snapshotRows: input.liquiditySnapshots ?? [],
    manualIntakeRows: input.manualIntake,
    currency,
  });

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

  const recentMovements: FinanceMonthlyMovement[] = captures
    .flatMap((row, index) => {
      const direction = text(row[4]);
      if (direction !== 'income' && direction !== 'expense') return [];

      const sourceKey = text(row[14]) || defaultLiquiditySourceKey(currency) || '';
      return [
        {
          id: text(row[0]) || `${text(row[1])}-${index}`,
          occurredAt: text(row[1]),
          direction,
          amountMinor: Math.abs(number(row[5])),
          currency,
          category: text(row[7]) || (direction === 'income' ? 'ingreso' : 'otros'),
          liquiditySourceLabel: sourceKey
            ? fallbackLiquiditySourceLabel(sourceKey)
            : 'Sin fuente',
        },
      ];
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.occurredAt);
      const rightTime = Date.parse(right.occurredAt);
      const normalizedLeft = Number.isFinite(leftTime) ? leftTime : 0;
      const normalizedRight = Number.isFinite(rightTime) ? rightTime : 0;
      return normalizedRight - normalizedLeft || right.id.localeCompare(left.id);
    })
    .slice(0, 5);

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
    recentMovements,
  };
}
