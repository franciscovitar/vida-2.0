import type { FinanceEconomicRole } from '@/types/finance';

type SheetRows = readonly (readonly unknown[])[];

export type FinanceMovementKind = 'income' | 'expense' | 'transfer' | 'other';
export type FinanceMovementOrigin = 'ledger' | 'manual';
export type FinanceMovementState = 'resolved' | 'review' | 'captured' | 'link-missing';

export interface FinanceMovement {
  id: string;
  occurredAt: string;
  description: string;
  amountMinor: number;
  currency: string;
  signedAmountMinor: number;
  kind: FinanceMovementKind;
  category: string;
  categoryLabel: string;
  sourceKey: string;
  sourceLabel: string;
  origin: FinanceMovementOrigin;
  state: FinanceMovementState;
  stateLabel: string;
  economicRole: string;
  note: string;
  rawText: string;
}

export interface FinanceMovementsModel {
  movements: FinanceMovement[];
  months: string[];
  categories: Array<{ key: string; label: string }>;
  sources: Array<{ key: string; label: string }>;
}

export interface FinanceMovementFilters {
  month?: string;
  query?: string;
  kind?: 'all' | FinanceMovementKind;
  category?: string;
  source?: string;
}

function dataRows(rows: SheetRows): readonly (readonly unknown[])[] {
  return rows.slice(1).filter((row) => row.some((value) => String(value ?? '').trim() !== ''));
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function amount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR')
    .trim();
}

function monthKey(value: string): string {
  return value.slice(0, 7);
}

function categoryLabel(value: string): string {
  const normalized = value.replaceAll('_', ' ').replaceAll('/', ' / ').trim();
  if (!normalized) return 'Sin categoría';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    income_work: 'Trabajo',
    income_family_support: 'Ayuda familiar',
    income_financial: 'Rendimientos',
    expense_personal: 'Gasto personal',
    expense_professional: 'Gasto profesional',
    reimbursement: 'Reembolso',
    internal_transfer: 'Transferencia propia',
    liability_settlement: 'Pago de deuda',
    business_pass_through: 'Movimiento de negocio',
    family_pass_through: 'Movimiento familiar',
    refund_adjustment: 'Devolución / ajuste',
    unknown_review: 'Por revisar',
  };
  return labels[role] ?? categoryLabel(role);
}

function movementKind(role: string): FinanceMovementKind {
  if (role === 'internal_transfer') return 'transfer';
  if (role.startsWith('income_')) return 'income';
  if (role === 'expense_personal' || role === 'expense_professional') {
    return 'expense';
  }
  return 'other';
}

function manualSourceLabel(sourceKey: string): string {
  if (sourceKey === 'naranja-x:ars') return 'Naranja X';
  if (sourceKey === 'cash:ars') return 'Efectivo';
  return sourceKey || 'Finance Logger';
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function canonicalMovements(input: {
  accounts: SheetRows;
  transactions: SheetRows;
  postings: SheetRows;
}): FinanceMovement[] {
  const accountById = new Map<string, { label: string; ownership: string; currency: string }>();

  for (const row of dataRows(input.accounts)) {
    const id = text(row[0]);
    if (!id) continue;

    accountById.set(id, {
      label: text(row[2]) || id,
      ownership: text(row[5]),
      currency: text(row[4]),
    });
  }

  const postingsByTransaction = new Map<string, readonly (readonly unknown[])[]>();

  for (const row of dataRows(input.postings)) {
    const transactionId = text(row[0]);
    if (!transactionId) continue;

    const current = postingsByTransaction.get(transactionId) ?? [];
    postingsByTransaction.set(transactionId, [...current, row]);
  }

  const movements: FinanceMovement[] = [];

  for (const row of dataRows(input.transactions)) {
    const id = text(row[0]);
    const occurredAt = text(row[1]);
    if (!id || !occurredAt) continue;

    const postings = postingsByTransaction.get(id) ?? [];
    const owned = postings.filter((posting) => {
      const account = accountById.get(text(posting[2]));
      return account?.ownership === 'owned';
    });
    if (owned.length === 0) continue;

    const role =
      owned
        .map((posting) => text(posting[6]))
        .find((candidate) => candidate && candidate !== 'unknown_review') ||
      text(owned[0]?.[6]) ||
      'unknown_review';
    const kind = movementKind(role);
    const currency = text(owned[0]?.[4]) || accountById.get(text(owned[0]?.[2]))?.currency || '';
    const netOwnedMinor = owned.reduce((total, posting) => total + amount(posting[3]), 0);
    const maxAbsoluteMinor = owned.reduce(
      (maximum, posting) => Math.max(maximum, Math.abs(amount(posting[3]))),
      0,
    );
    const signedAmountMinor = kind === 'transfer' ? 0 : netOwnedMinor;
    const amountMinor = kind === 'transfer' ? maxAbsoluteMinor : Math.abs(netOwnedMinor);

    const negativeOwned = owned.find((posting) => amount(posting[3]) < 0);
    const positiveOwned = owned.find((posting) => amount(posting[3]) > 0);
    const ownedLabels = [
      ...new Set(owned.map((posting) => accountById.get(text(posting[2]))?.label).filter(Boolean)),
    ] as string[];
    const sourceLabel =
      kind === 'transfer' && negativeOwned && positiveOwned
        ? `${accountById.get(text(negativeOwned[2]))?.label ?? text(negativeOwned[2])} → ${accountById.get(text(positiveOwned[2]))?.label ?? text(positiveOwned[2])}`
        : ownedLabels.join(' + ') || 'Cuenta propia';
    const sourceKey = owned
      .map((posting) => text(posting[2]))
      .sort()
      .join('|');

    const explicitCategory = owned.map((posting) => text(posting[5])).find(Boolean) || '';
    const categoryKey = explicitCategory || role || 'sin-categoria';
    const reviewState = text(row[5]);
    const description = text(row[2]) || roleLabel(role);

    movements.push({
      id,
      occurredAt,
      description,
      amountMinor,
      currency,
      signedAmountMinor,
      kind,
      category: categoryKey,
      categoryLabel: explicitCategory ? categoryLabel(explicitCategory) : roleLabel(role),
      sourceKey,
      sourceLabel,
      origin: 'ledger',
      state: reviewState === 'review_required' ? 'review' : 'resolved',
      stateLabel: reviewState === 'review_required' ? 'Revisar' : 'Registrado',
      economicRole: role,
      note: owned.map((posting) => text(posting[7])).find(Boolean) || '',
      rawText: '',
    });
  }

  return movements;
}

function manualMovements(rows: SheetRows, canonicalIds: ReadonlySet<string>): FinanceMovement[] {
  const movements: FinanceMovement[] = [];

  for (const row of dataRows(rows)) {
    if (text(row[10]) !== 'active') continue;

    const direction = text(row[4]);
    if (direction !== 'income' && direction !== 'expense') continue;

    const reconciledTransactionId = text(row[13]);
    if (reconciledTransactionId && canonicalIds.has(reconciledTransactionId)) {
      continue;
    }

    const id = text(row[0]);
    const occurredAt = text(row[1]);
    if (!id || !occurredAt) continue;

    const role = text(row[8]) as FinanceEconomicRole;
    const categoryKey = text(row[7]) || role || (direction === 'income' ? 'ingreso' : 'otros');
    const sourceKey = text(row[14]) || text(row[12]) || 'finance-logger';
    const note = text(row[9]);
    const rawText = text(row[3]);

    movements.push({
      id,
      occurredAt,
      description: note || categoryLabel(categoryKey),
      amountMinor: Math.abs(amount(row[5])),
      currency: text(row[6]).toUpperCase(),
      signedAmountMinor:
        direction === 'income' ? Math.abs(amount(row[5])) : -Math.abs(amount(row[5])),
      kind: direction,
      category: categoryKey,
      categoryLabel: categoryLabel(categoryKey),
      sourceKey,
      sourceLabel: manualSourceLabel(sourceKey),
      origin: 'manual',
      state: reconciledTransactionId ? 'link-missing' : 'captured',
      stateLabel: reconciledTransactionId
        ? 'Enlace para revisar'
        : text(row[11])
          ? 'Corrección vigente'
          : 'Registrado en Finance Logger',
      economicRole: role,
      note,
      rawText,
    });
  }

  return movements;
}

export function buildFinanceMovementsModel(input: {
  accounts: SheetRows;
  transactions: SheetRows;
  postings: SheetRows;
  manualIntake: SheetRows;
}): FinanceMovementsModel {
  const canonical = canonicalMovements(input);
  const canonicalIds = new Set(canonical.map((movement) => movement.id));
  const manual = manualMovements(input.manualIntake, canonicalIds);
  const movements = [...canonical, ...manual].sort(
    (left, right) =>
      timestamp(right.occurredAt) - timestamp(left.occurredAt) || right.id.localeCompare(left.id),
  );

  const months = [
    ...new Set(movements.map((movement) => monthKey(movement.occurredAt)).filter(Boolean)),
  ]
    .sort()
    .reverse();

  const categoryMap = new Map<string, string>();
  const sourceMap = new Map<string, string>();

  for (const row of dataRows(input.accounts)) {
    if (text(row[5]) !== 'owned') continue;

    const key = text(row[0]);
    if (!key) continue;
    sourceMap.set(key, text(row[2]) || key);
  }

  for (const movement of movements) {
    categoryMap.set(movement.category, movement.categoryLabel);
    if (movement.origin === 'manual' && !sourceMap.has(movement.sourceKey)) {
      sourceMap.set(movement.sourceKey, movement.sourceLabel);
    }
  }

  return {
    movements,
    months,
    categories: [...categoryMap.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((left, right) => left.label.localeCompare(right.label, 'es')),
    sources: [...sourceMap.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((left, right) => left.label.localeCompare(right.label, 'es')),
  };
}

export function filterFinanceMovements(
  movements: readonly FinanceMovement[],
  filters: FinanceMovementFilters,
): FinanceMovement[] {
  const query = normalize(filters.query ?? '');
  const kind = filters.kind ?? 'all';

  return movements.filter((movement) => {
    if (filters.month && monthKey(movement.occurredAt) !== filters.month) {
      return false;
    }
    if (kind !== 'all' && movement.kind !== kind) return false;
    if (filters.category && movement.category !== filters.category) {
      return false;
    }
    if (filters.source && !movement.sourceKey.split('|').includes(filters.source)) {
      return false;
    }

    if (query) {
      const haystack = normalize(
        [
          movement.description,
          movement.categoryLabel,
          movement.sourceLabel,
          movement.note,
          movement.rawText,
          movement.economicRole,
        ].join(' '),
      );
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}
