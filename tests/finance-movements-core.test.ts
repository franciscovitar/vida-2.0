import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildFinanceMovementsModel,
  filterFinanceMovements,
} from '@/lib/finance/movements-core';
import { FINANCE_SHEETS } from '@/lib/finance/store/schema';

function rows(headers: readonly string[], data: readonly (readonly unknown[])[]) {
  return [headers, ...data];
}

const accounts = rows(FINANCE_SHEETS.accounts.headers, [
  ['naranja', 'Naranja X', 'Naranja X', 'wallet', 'ARS', 'owned', 'personal', 'immediate', 'x', true, '', ''],
  ['mp', 'Mercado Pago', 'Mercado Pago', 'wallet', 'ARS', 'owned', 'mixed', 'immediate', 'x', true, '', ''],
  ['clear', 'Finance OS', 'Clearing', 'clearing', 'ARS', 'clearing', 'mixed', 'illiquid', 'system', true, '', ''],
]);

test('movements combines canonical ledger and unreconciled active manual captures without duplicates', () => {
  const model = buildFinanceMovementsModel({
    accounts,
    transactions: rows(FINANCE_SHEETS.transactions.headers, [
      ['t-expense', '2026-09-05T15:00:00Z', 'Supermercado', 'posted', 1, 'resolved', '', ''],
      ['t-transfer', '2026-09-06T15:00:00Z', 'Transferencia propia', 'posted', 1, 'resolved', '', ''],
    ]),
    postings: rows(FINANCE_SHEETS.postings.headers, [
      ['t-expense', 1, 'naranja', -500000, 'ARS', 'comida', 'expense_personal', 'source', ''],
      ['t-expense', 2, 'clear', 500000, 'ARS', 'comida', 'expense_personal', 'contra', ''],
      ['t-transfer', 1, 'naranja', -200000, 'ARS', null, 'internal_transfer', 'source', ''],
      ['t-transfer', 2, 'mp', 200000, 'ARS', null, 'internal_transfer', 'target', ''],
    ]),
    manualIntake: rows(FINANCE_SHEETS.manualIntake.headers, [
      ['m-active', '2026-10-07T10:00:00-03:00', '', 'Gasté 9000 en helado', 'expense', 900000, 'ARS', 'cafe/salidas', 'expense_personal', 'Helado', 'active', '', 'finance-logger', '', 'cash:ars'],
      ['m-corrected', '2026-10-06T10:00:00-03:00', '', 'Gasté 10000', 'expense', 1000000, 'ARS', 'otros', 'expense_personal', '', 'corrected', '', 'finance-logger', '', 'naranja-x:ars'],
      ['m-linked', '2026-09-05T15:00:00Z', '', 'Supermercado', 'expense', 500000, 'ARS', 'comida', 'expense_personal', '', 'active', '', 'finance-logger', 't-expense', 'naranja-x:ars'],
    ]),
  });

  assert.equal(model.movements.length, 3);
  assert.equal(model.movements[0]?.id, 'm-active');
  assert.equal(model.movements.some((movement) => movement.id === 'm-corrected'), false);
  assert.equal(model.movements.some((movement) => movement.id === 'm-linked'), false);

  const expense = model.movements.find((movement) => movement.id === 't-expense');
  assert.equal(expense?.kind, 'expense');
  assert.equal(expense?.sourceLabel, 'Naranja X');
  assert.equal(expense?.categoryLabel, 'Comida');

  const transfer = model.movements.find((movement) => movement.id === 't-transfer');
  assert.equal(transfer?.kind, 'transfer');
  assert.equal(transfer?.sourceLabel, 'Naranja X → Mercado Pago');
  assert.equal(transfer?.amountMinor, 200000);
});

test('movement with a broken reconciliation link remains visible instead of disappearing', () => {
  const model = buildFinanceMovementsModel({
    accounts,
    transactions: rows(FINANCE_SHEETS.transactions.headers, []),
    postings: rows(FINANCE_SHEETS.postings.headers, []),
    manualIntake: rows(FINANCE_SHEETS.manualIntake.headers, [
      ['m1', '2026-10-07T10:00:00-03:00', '', 'Ingreso', 'income', 10000000, 'ARS', 'trabajo', 'income_work', '', 'active', '', 'finance-logger', 'missing-tx', 'naranja-x:ars'],
    ]),
  });

  assert.equal(model.movements.length, 1);
  assert.equal(model.movements[0]?.state, 'link-missing');
});

test('movement filters search, period, type, category and source without changing the model', () => {
  const model = buildFinanceMovementsModel({
    accounts,
    transactions: rows(FINANCE_SHEETS.transactions.headers, []),
    postings: rows(FINANCE_SHEETS.postings.headers, []),
    manualIntake: rows(FINANCE_SHEETS.manualIntake.headers, [
      ['a', '2026-10-07T10:00:00-03:00', '', 'Nafta', 'expense', 5000000, 'ARS', 'transporte', 'expense_personal', 'Carga de nafta', 'active', '', 'finance-logger', '', 'naranja-x:ars'],
      ['b', '2026-10-07T11:00:00-03:00', '', 'Web cliente', 'income', 10000000, 'ARS', 'trabajo', 'income_work', 'Cliente web', 'active', '', 'finance-logger', '', 'naranja-x:ars'],
      ['c', '2026-09-02T11:00:00-03:00', '', 'Cafe', 'expense', 300000, 'ARS', 'cafe/salidas', 'expense_personal', '', 'active', '', 'finance-logger', '', 'cash:ars'],
    ]),
  });

  const filtered = filterFinanceMovements(model.movements, {
    month: '2026-10',
    query: 'nafta',
    kind: 'expense',
    category: 'transporte',
    source: 'naranja-x:ars',
  });

  assert.deepEqual(filtered.map((movement) => movement.id), ['a']);
  assert.equal(model.movements.length, 3);
});
