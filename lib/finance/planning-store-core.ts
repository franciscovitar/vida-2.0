import {
  buildFinancePlanningSnapshot,
  type FinancePlanningCommitment,
  type FinancePlanningSnapshot,
} from '@/lib/finance/planning-core';
import type { FinanceReconciliationStatus } from '@/types/finance';

type SheetRows = readonly (readonly unknown[])[];

export const FINANCE_PLANNING_SOURCE_VERSION = 'finance-planning-source-v1.0.0';

export const FINANCE_PLANNING_POLICY_V1 = {
  maxBalanceAgeDays: 35,
  obligationHorizonDays: 31,
} as const;

export interface FinancePlanningStoreRows {
  accounts: SheetRows;
  reconciliations: SheetRows;
  obligations: SheetRows;
  goals: SheetRows;
  commitments: SheetRows;
}

export interface FinancePlanningPolicy {
  asOf: string;
  maxBalanceAgeDays: number;
  obligationHorizonDays: number;
}

export type FinanceLiquidityQuality = 'verified' | 'partial';

export type FinanceLiquidityExclusionReason =
  | 'non-personal-scope'
  | 'non-immediate'
  | 'missing-reconciliation'
  | 'untrusted-reconciliation'
  | 'stale-balance'
  | 'negative-balance';

export interface FinanceEligibleLiquidityAccount {
  accountId: string;
  displayName: string;
  currency: string;
  balanceMinor: number;
  balanceAsOf: string;
  reconciliationStatus: 'reconciled' | 'partial';
}

export interface FinanceExcludedLiquidityAccount {
  accountId: string;
  displayName: string;
  currency: string;
  reason: FinanceLiquidityExclusionReason;
}

export type FinancePlanningIssueCode =
  | 'invalid-obligation'
  | 'invalid-commitment'
  | 'missing-goal-reference'
  | 'invalid-planning-commitments';

export interface FinancePlanningIssue {
  code: FinancePlanningIssueCode;
  referenceId: string;
  currency: string | null;
}

export type FinancePlanningMissingInput = 'eligible-liquidity' | 'reserve-policy';

export interface FinancePlanningCurrencyModel {
  currency: string;
  status: 'ready' | 'configuration-required' | 'invalid';
  eligibleLiquidityMinor: number;
  liquidityQuality: FinanceLiquidityQuality | null;
  includedAccountCount: number;
  commitmentCount: number;
  essentialMonthlyBurnMinor: number | null;
  missing: FinancePlanningMissingInput[];
  issues: FinancePlanningIssue[];
  snapshot: FinancePlanningSnapshot | null;
}

export interface FinancePlanningReadModel {
  version: typeof FINANCE_PLANNING_SOURCE_VERSION;
  asOf: string;
  maxBalanceAgeDays: number;
  obligationHorizonDays: number;
  includedAccounts: FinanceEligibleLiquidityAccount[];
  excludedAccounts: FinanceExcludedLiquidityAccount[];
  currencies: FinancePlanningCurrencyModel[];
}

interface ReconciliationRecord {
  accountId: string;
  asOf: string;
  asOfMs: number;
  sourceBalanceMinor: number | null;
  ledgerBalanceMinor: number | null;
  differenceMinor: number | null;
  currency: string;
  status: FinanceReconciliationStatus;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TRUSTED_RECONCILIATION = new Set<FinanceReconciliationStatus>(['reconciled', 'partial']);

function dataRows(rows: SheetRows): readonly (readonly unknown[])[] {
  return rows.slice(1).filter((row) => row.some((value) => String(value ?? '').trim() !== ''));
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function booleanValue(value: unknown): boolean {
  if (value === true) return true;
  const normalized = text(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function minor(value: unknown): number | null {
  if (value === null || value === undefined || text(value) === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function timestamp(value: unknown): number | null {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function safeSum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total))
      throw new RangeError('planning sum exceeds safe integer range');
  }
  return total;
}

function pushCommitment(
  map: Map<string, FinancePlanningCommitment[]>,
  commitment: FinancePlanningCommitment,
): void {
  const current = map.get(commitment.currency) ?? [];
  current.push(commitment);
  map.set(commitment.currency, current);
}

function addMinor(map: Map<string, number>, currency: string, value: number): void {
  const next = (map.get(currency) ?? 0) + value;
  if (!Number.isSafeInteger(next))
    throw new RangeError('planning amount exceeds safe integer range');
  map.set(currency, next);
}

export function buildFinancePlanningReadModel(
  rows: FinancePlanningStoreRows,
  policy: Readonly<FinancePlanningPolicy>,
): FinancePlanningReadModel {
  if (!Number.isFinite(policy.maxBalanceAgeDays) || policy.maxBalanceAgeDays < 0) {
    throw new RangeError('maxBalanceAgeDays must be non-negative');
  }
  if (!Number.isFinite(policy.obligationHorizonDays) || policy.obligationHorizonDays < 0) {
    throw new RangeError('obligationHorizonDays must be non-negative');
  }

  const asOfMs = timestamp(policy.asOf);
  if (asOfMs === null) throw new RangeError('asOf must be a valid date');
  const asOf = new Date(asOfMs).toISOString();
  const horizonEndMs = asOfMs + policy.obligationHorizonDays * DAY_MS;

  const latestReconciliation = new Map<string, ReconciliationRecord>();
  for (const row of dataRows(rows.reconciliations)) {
    const accountId = text(row[1]);
    const asOfValue = text(row[2]);
    const asOfValueMs = timestamp(asOfValue);
    const currency = text(row[6]).toUpperCase();
    const status = text(row[7]) as FinanceReconciliationStatus;
    if (!accountId || asOfValueMs === null || !currency) continue;

    const record: ReconciliationRecord = {
      accountId,
      asOf: asOfValue,
      asOfMs: asOfValueMs,
      sourceBalanceMinor: minor(row[3]),
      ledgerBalanceMinor: minor(row[4]),
      differenceMinor: minor(row[5]),
      currency,
      status,
    };
    const previous = latestReconciliation.get(accountId);
    if (!previous || record.asOfMs > previous.asOfMs) {
      latestReconciliation.set(accountId, record);
    }
  }

  const includedAccounts: FinanceEligibleLiquidityAccount[] = [];
  const excludedAccounts: FinanceExcludedLiquidityAccount[] = [];

  for (const row of dataRows(rows.accounts)) {
    const accountId = text(row[0]);
    const displayName = text(row[2]) || accountId;
    const currency = text(row[4]).toUpperCase();
    const ownership = text(row[5]);
    const beneficialScope = text(row[6]);
    const liquidityClass = text(row[7]);
    const active = booleanValue(row[9]);

    if (!accountId || !active || ownership !== 'owned') continue;

    if (beneficialScope !== 'personal') {
      excludedAccounts.push({
        accountId,
        displayName,
        currency,
        reason: 'non-personal-scope',
      });
      continue;
    }

    if (liquidityClass !== 'immediate') {
      excludedAccounts.push({ accountId, displayName, currency, reason: 'non-immediate' });
      continue;
    }

    const reconciliation = latestReconciliation.get(accountId);
    if (!reconciliation) {
      excludedAccounts.push({
        accountId,
        displayName,
        currency,
        reason: 'missing-reconciliation',
      });
      continue;
    }

    const trusted =
      reconciliation.currency === currency &&
      TRUSTED_RECONCILIATION.has(reconciliation.status) &&
      reconciliation.sourceBalanceMinor !== null &&
      reconciliation.ledgerBalanceMinor !== null &&
      reconciliation.differenceMinor === 0 &&
      reconciliation.sourceBalanceMinor === reconciliation.ledgerBalanceMinor;

    if (!trusted || reconciliation.asOfMs > asOfMs) {
      excludedAccounts.push({
        accountId,
        displayName,
        currency,
        reason: 'untrusted-reconciliation',
      });
      continue;
    }

    const ageDays = (asOfMs - reconciliation.asOfMs) / DAY_MS;
    if (ageDays > policy.maxBalanceAgeDays) {
      excludedAccounts.push({
        accountId,
        displayName,
        currency,
        reason: 'stale-balance',
      });
      continue;
    }

    if (reconciliation.sourceBalanceMinor < 0) {
      excludedAccounts.push({
        accountId,
        displayName,
        currency,
        reason: 'negative-balance',
      });
      continue;
    }

    includedAccounts.push({
      accountId,
      displayName,
      currency,
      balanceMinor: reconciliation.sourceBalanceMinor,
      balanceAsOf: reconciliation.asOf,
      reconciliationStatus: reconciliation.status as 'reconciled' | 'partial',
    });
  }

  const commitmentsByCurrency = new Map<string, FinancePlanningCommitment[]>();
  const essentialBurnByCurrency = new Map<string, number>();
  const issues: FinancePlanningIssue[] = [];

  const goalNameById = new Map<string, string>();
  for (const row of dataRows(rows.goals)) {
    const id = text(row[0]);
    if (id) goalNameById.set(id, text(row[1]) || id);
  }

  for (const row of dataRows(rows.obligations)) {
    if (!booleanValue(row[7])) continue;

    const id = text(row[0]);
    const name = text(row[1]) || id;
    const amountMinor = minor(row[2]);
    const currency = text(row[3]).toUpperCase();
    const cadence = text(row[4]).toLowerCase();
    const nextDueAt = text(row[5]);
    const nextDueAtMs = timestamp(nextDueAt);

    if (!id || amountMinor === null || amountMinor < 0 || !currency || nextDueAtMs === null) {
      issues.push({
        code: 'invalid-obligation',
        referenceId: id || 'unknown',
        currency: currency || null,
      });
      continue;
    }

    if (booleanValue(row[6]) && cadence === 'monthly') {
      addMinor(essentialBurnByCurrency, currency, amountMinor);
    }

    if (nextDueAtMs <= horizonEndMs) {
      pushCommitment(commitmentsByCurrency, {
        id: `obligation:${id}`,
        label: name,
        bucket: 'obligation',
        amountMinor,
        currency,
        overlapGroup: null,
      });
    }
  }

  for (const row of dataRows(rows.commitments)) {
    if (!booleanValue(row[8])) continue;

    const id = text(row[0]);
    const type = text(row[1]).toLowerCase();
    const referenceId = text(row[2]);
    const amountMinor = minor(row[3]);
    const currency = text(row[4]).toUpperCase();
    const startAt = text(row[5]);
    const endAt = text(row[6]);
    const startAtMs = startAt ? timestamp(startAt) : asOfMs;
    const endAtMs = endAt ? timestamp(endAt) : null;

    if (
      !id ||
      amountMinor === null ||
      amountMinor < 0 ||
      !currency ||
      startAtMs === null ||
      (endAt && endAtMs === null)
    ) {
      issues.push({
        code: 'invalid-commitment',
        referenceId: id || 'unknown',
        currency: currency || null,
      });
      continue;
    }

    if (startAtMs > asOfMs || (endAtMs !== null && endAtMs < asOfMs)) continue;

    let bucket: FinancePlanningCommitment['bucket'];
    let label: string;

    if (type === 'reserve') {
      bucket = 'reserve';
      label = referenceId ? `Reserva · ${referenceId}` : 'Reserva protegida';
    } else if (type === 'goal') {
      const goalName = goalNameById.get(referenceId);
      if (!referenceId || !goalName) {
        issues.push({ code: 'missing-goal-reference', referenceId: id, currency });
        continue;
      }
      bucket = 'goal';
      label = goalName;
    } else if (type === 'other') {
      bucket = 'other';
      label = referenceId ? `Compromiso · ${referenceId}` : 'Otro compromiso';
    } else {
      issues.push({ code: 'invalid-commitment', referenceId: id, currency });
      continue;
    }

    pushCommitment(commitmentsByCurrency, {
      id: `commitment:${id}`,
      label,
      bucket,
      amountMinor,
      currency,
      overlapGroup: text(row[7]) || null,
    });
  }

  const currencies = new Set<string>();
  for (const account of includedAccounts) currencies.add(account.currency);
  for (const currency of commitmentsByCurrency.keys()) currencies.add(currency);
  for (const currency of essentialBurnByCurrency.keys()) currencies.add(currency);
  for (const issue of issues) if (issue.currency) currencies.add(issue.currency);

  const currencyModels: FinancePlanningCurrencyModel[] = [];

  for (const currency of [...currencies].sort()) {
    const accounts = includedAccounts.filter((account) => account.currency === currency);
    const commitments = commitmentsByCurrency.get(currency) ?? [];
    const eligibleLiquidityMinor = safeSum(accounts.map((account) => account.balanceMinor));
    const missing: FinancePlanningMissingInput[] = [];
    const currencyIssues = issues.filter(
      (issue) => issue.currency === null || issue.currency === currency,
    );

    if (accounts.length === 0) missing.push('eligible-liquidity');
    if (!commitments.some((commitment) => commitment.bucket === 'reserve')) {
      missing.push('reserve-policy');
    }

    const liquidityQuality: FinanceLiquidityQuality | null =
      accounts.length === 0
        ? null
        : accounts.some((account) => account.reconciliationStatus === 'partial')
          ? 'partial'
          : 'verified';

    let status: FinancePlanningCurrencyModel['status'];
    let snapshot: FinancePlanningSnapshot | null = null;

    if (currencyIssues.length > 0) {
      status = 'invalid';
    } else if (missing.length > 0) {
      status = 'configuration-required';
    } else {
      try {
        snapshot = buildFinancePlanningSnapshot({
          asOf,
          currency,
          eligibleLiquidityMinor,
          commitments,
          essentialMonthlyBurnMinor: essentialBurnByCurrency.get(currency) ?? null,
        });
        status = 'ready';
      } catch {
        currencyIssues.push({
          code: 'invalid-planning-commitments',
          referenceId: currency,
          currency,
        });
        status = 'invalid';
      }
    }

    currencyModels.push({
      currency,
      status,
      eligibleLiquidityMinor,
      liquidityQuality,
      includedAccountCount: accounts.length,
      commitmentCount: commitments.length,
      essentialMonthlyBurnMinor: essentialBurnByCurrency.get(currency) ?? null,
      missing,
      issues: currencyIssues,
      snapshot,
    });
  }

  return {
    version: FINANCE_PLANNING_SOURCE_VERSION,
    asOf,
    maxBalanceAgeDays: policy.maxBalanceAgeDays,
    obligationHorizonDays: policy.obligationHorizonDays,
    includedAccounts: includedAccounts.sort(
      (left, right) =>
        left.currency.localeCompare(right.currency) ||
        left.accountId.localeCompare(right.accountId),
    ),
    excludedAccounts: excludedAccounts.sort((left, right) =>
      left.accountId.localeCompare(right.accountId),
    ),
    currencies: currencyModels,
  };
}
