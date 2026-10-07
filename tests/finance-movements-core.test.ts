import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFinanceMovementsModel, filterFinanceMovements } from '@/lib/finance/movements-core';
import { FINANCE_SHEETS } from '@/lib/finance/store/schema';

function rows(headers: readonly string[], data: readonly (readonly unknown[])[]) {
  return [headers, ...data];
}

function account(id: string, label: string, ownership: 'owned' | 'clearing' = 'owned') {
  return [
    id,
    label,
    label,
    ownership === 'owned' ? 'wallet' : 'clearing',
    'ARS',
    ownership,
    ownership === 'owned' ? 'personal' : 'mixed',
    ownership === 'owned' ? 'immediate' : 'illiquid',
    ownership === 'owned' ? 'x' : 'system',
    true,
    '',
    '',
  ];
}

function transaction(id: string, occurredAt: string, description: string) {
  return [id, occurredAt, description, 'posted', 1, 'resolved', '', ''];
}

function posting(
  transactionId: string,
  line: number,
  accountId: string,
  amountMinor: number,
  category: string | null,
  role: string,
) {
  return [transactionId, line, accountId, amountMinor, 'ARS', category, role, 'source', ''];
}

function manual(input: {
  id: string;
  occurredAt: string;
  rawText: string;
  direction: 'income' | 'expense';
  amountMinor: number;
  category: string;
  role: string;
  note?: string;
  status?: string;
  supersedes?: string;
  reconciled?: string;
  source?: string;
}) {
  return [
    input.id,
    input.occurredAt,
    '',
    input.rawText,
    input.direction,
    input.amountMinor,
    'ARS',
    input.category,
    input.role,
    input.note ?? '',
    input.status ?? 'active',
    input.supersedes ?? '',
    'finance-logger',
    input.reconciled ?? '',
    input.source ?? 'naranja-x:ars',
  ];
}

const accounts = rows(FINANCE_SHEETS.accounts.headers, [
  account('naranja', 'Naranja X'),
  account('mp', 'Mercado Pago'),
  account('clear', 'Clearing', 'clearing'),
]);

test('movements combines canonical ledger and active manual captures without duplicates', () => {
  const model = buildFinanceMovementsModel({
    accounts,
    transactions: rows(FINANCE_SHEETS.transactions.headers, [
      transaction('t-expense', '2026-09-05T15:00:00Z', 'Supermercado'),
      transaction('t-transfer', '2026-09-06T15:00:00Z', 'Transferencia propia'),
    ]),
    postings: rows(FINANCE_SHEETS.postings.headers, [
      posting('t-expense', 1, 'naranja', -500000, 'comida', 'expense_personal'),
      posting('t-expense', 2, 'clear', 500000, 'comida', 'expense_personal'),
      posting('t-transfer', 1, 'naranja', -200000, null, 'internal_transfer'),
      posting('t-transfer', 2, 'mp', 200000, null, 'internal_transfer'),
    ]),
    manualIntake: rows(FINANCE_SHEETS.manualIntake.headers, [
      manual({
        id: 'm-active',
        occurredAt: '2026-10-07T10:00:00-03:00',
        rawText: 'Gasté 9000 en helado',
        direction: 'expense',
        amountMinor: 900000,
        category: 'cafe/salidas',
        role: 'expense_personal',
        note: 'Helado',
        source: 'cash:ars',
      }),
      manual({
        id: 'm-corrected',
        occurredAt: '2026-10-06T10:00:00-03:00',
        rawText: 'Gasté 10000',
        direction: 'expense',
        amountMinor: 1000000,
        category: 'otros',
        role: 'expense_personal',
        status: 'corrected',
      }),
      manual({
        id: 'm-linked',
        occurredAt: '2026-09-05T15:00:00Z',
        rawText: 'Supermercado',
        direction: 'expense',
        amountMinor: 500000,
        category: 'comida',
        role: 'expense_personal',
        reconciled: 't-expense',
      }),
    ]),
  });

  assert.equal(model.movements.length, 3);
  assert.equal(model.movements[0]?.id, 'm-active');
  assert.equal(
    model.movements.some((movement) => movement.id === 'm-corrected'),
    false,
  );
  assert.equal(
    model.movements.some((movement) => movement.id === 'm-linked'),
    false,
  );

  const expense = model.movements.find((movement) => movement.id === 't-expense');
  assert.equal(expense?.kind, 'expense');
  assert.equal(expense?.sourceLabel, 'Naranja X');
  assert.equal(expense?.categoryLabel, 'Comida');

  const transfer = model.movements.find((movement) => movement.id === 't-transfer');
  assert.equal(transfer?.kind, 'transfer');
  assert.equal(transfer?.sourceLabel, 'Naranja X → Mercado Pago');
  assert.equal(transfer?.amountMinor, 200000);

  const naranjaTransfers = filterFinanceMovements(model.movements, {
    month: '2026-09',
    kind: 'transfer',
    source: 'naranja',
  });
  assert.deepEqual(
    naranjaTransfers.map((movement) => movement.id),
    ['t-transfer'],
  );
});

test('movement with a broken reconciliation link remains visible', () => {
  const model = buildFinanceMovementsModel({
    accounts,
    transactions: rows(FINANCE_SHEETS.transactions.headers, []),
    postings: rows(FINANCE_SHEETS.postings.headers, []),
    manualIntake: rows(FINANCE_SHEETS.manualIntake.headers, [
      manual({
        id: 'm1',
        occurredAt: '2026-10-07T10:00:00-03:00',
        rawText: 'Ingreso',
        direction: 'income',
        amountMinor: 10000000,
        category: 'trabajo',
        role: 'income_work',
        reconciled: 'missing-tx',
      }),
    ]),
  });

  assert.equal(model.movements.length, 1);
  assert.equal(model.movements[0]?.state, 'link-missing');
});

test('movement filters do not change the underlying model', () => {
  const model = buildFinanceMovementsModel({
    accounts,
    transactions: rows(FINANCE_SHEETS.transactions.headers, []),
    postings: rows(FINANCE_SHEETS.postings.headers, []),
    manualIntake: rows(FINANCE_SHEETS.manualIntake.headers, [
      manual({
        id: 'a',
        occurredAt: '2026-10-07T10:00:00-03:00',
        rawText: 'Nafta',
        direction: 'expense',
        amountMinor: 5000000,
        category: 'transporte',
        role: 'expense_personal',
        note: 'Carga de nafta',
      }),
      manual({
        id: 'b',
        occurredAt: '2026-10-07T11:00:00-03:00',
        rawText: 'Web cliente',
        direction: 'income',
        amountMinor: 10000000,
        category: 'trabajo',
        role: 'income_work',
        note: 'Cliente web',
      }),
      manual({
        id: 'c',
        occurredAt: '2026-09-02T11:00:00-03:00',
        rawText: 'Cafe',
        direction: 'expense',
        amountMinor: 300000,
        category: 'cafe/salidas',
        role: 'expense_personal',
        source: 'cash:ars',
      }),
    ]),
  });

  const filtered = filterFinanceMovements(model.movements, {
    month: '2026-10',
    query: 'nafta',
    kind: 'expense',
    category: 'transporte',
    source: 'naranja-x:ars',
  });

  assert.deepEqual(
    filtered.map((movement) => movement.id),
    ['a'],
  );
  assert.equal(model.movements.length, 3);
});

test('a superseding active manual capture is labeled as the current correction', () => {
  const model = buildFinanceMovementsModel({
    accounts,
    transactions: rows(FINANCE_SHEETS.transactions.headers, []),
    postings: rows(FINANCE_SHEETS.postings.headers, []),
    manualIntake: rows(FINANCE_SHEETS.manualIntake.headers, [
      manual({
        id: 'replacement',
        occurredAt: '2026-10-07T10:00:00-03:00',
        rawText: 'El café eran 12',
        direction: 'expense',
        amountMinor: 1200000,
        category: 'cafe/salidas',
        role: 'expense_personal',
        supersedes: 'original',
      }),
    ]),
  });

  assert.equal(model.movements[0]?.stateLabel, 'Corrección vigente');
});
