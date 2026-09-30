import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { MercadoPagoStatementResult } from '@/lib/finance/importers/mercado-pago';
import {
  buildMercadoPagoImportPlan,
  mercadoPagoImportPlanMutations,
} from '@/lib/finance/importers/mercado-pago-plan';
import { preflightMercadoPagoImport } from '@/lib/finance/importers/mercado-pago-preflight';

const GENERATED_AT = '2026-09-30T20:00:00.000Z';
const SOURCE_HASH_A = 'a'.repeat(64);
const SOURCE_HASH_B = 'b'.repeat(64);

function statement(
  period: string,
  transactionId: string,
  amountMinor: number,
  openingBalanceMinor: number,
): MercadoPagoStatementResult {
  const closing = openingBalanceMinor + amountMinor;

  return {
    statementPeriod: period,
    openingBalanceMinor,
    statementInflowsMinor: amountMinor > 0 ? amountMinor : 0,
    statementOutflowsMinor: amountMinor < 0 ? amountMinor : 0,
    statementClosingBalanceMinor: closing,
    derivedClosingBalanceMinor: closing,
    transactions: [
      {
        sourceTransactionId: transactionId,
        occurredOn: `${period}-02`,
        description: 'Synthetic Mercado Pago movement',
        amountMinor,
        balanceAfterMinor: closing,
        currency: 'ARS',
      },
    ],
  };
}

test('Mercado Pago import plan is deterministic and preserves mixed-use account scope', () => {
  const input = [
    {
      sourceHash: SOURCE_HASH_B,
      evidenceRef: 'drive:feb',
      parsed: statement('2026-02', '200000000002', -5_000, 10_000),
    },
    {
      sourceHash: SOURCE_HASH_A,
      evidenceRef: 'drive:jan',
      parsed: statement('2026-01', '200000000001', 10_000, 0),
    },
  ];

  const first = buildMercadoPagoImportPlan(input, GENERATED_AT);
  const second = buildMercadoPagoImportPlan(input, GENERATED_AT);

  assert.deepEqual(first, second);
  assert.equal(first.statementCount, 2);
  assert.equal(first.rawTransactionCount, 2);
  assert.equal(first.accounts.rows[0][6], 'mixed');
  assert.equal(first.accounts.rows[0][4], 'ARS');

  assert.deepEqual(
    mercadoPagoImportPlanMutations(first).map((mutation) => [mutation.kind, mutation.sheet]),
    [
      ['append', 'accounts'],
      ['append', 'importBatches'],
      ['append', 'rawTransactions'],
    ],
  );
});

test('Mercado Pago raw identities remain source-specific and stable', () => {
  const plan = buildMercadoPagoImportPlan(
    [
      {
        sourceHash: SOURCE_HASH_A,
        evidenceRef: 'drive:jan',
        parsed: statement('2026-01', '200000000001', 10_000, 0),
      },
    ],
    GENERATED_AT,
  );

  const row = plan.rawTransactions.rows[0];
  assert.equal(row[0], 'finance-raw:mercado-pago:ars:200000000001');
  assert.equal(row[3], '200000000001');
  assert.equal(row[6], 10_000);
  assert.equal(row[7], 'ARS');
  assert.match(String(row[9]), /^[0-9a-f]{64}$/);
});

test('Mercado Pago preflight accepts existing Naranja data and reports only new rows', () => {
  const plan = buildMercadoPagoImportPlan(
    [
      {
        sourceHash: SOURCE_HASH_A,
        evidenceRef: 'drive:jan',
        parsed: statement('2026-01', '200000000001', 10_000, 0),
      },
    ],
    GENERATED_AT,
  );

  const result = preflightMercadoPagoImport(
    {
      accounts: [['id'], ['finance-account:naranja-x:ars']],
      importBatches: [['id'], ['finance-import:naranja-x:2026-01:ars:abc']],
      rawTransactions: [['id'], ['finance-raw:naranja-x:ars:10000000001']],
    },
    plan,
  );

  assert.deepEqual(result, {
    ok: true,
    appendAccounts: 1,
    appendBatches: 1,
    appendRawTransactions: 1,
  });
});

test('Mercado Pago preflight blocks duplicate batch and raw identities', () => {
  const plan = buildMercadoPagoImportPlan(
    [
      {
        sourceHash: SOURCE_HASH_A,
        evidenceRef: 'drive:jan',
        parsed: statement('2026-01', '200000000001', 10_000, 0),
      },
    ],
    GENERATED_AT,
  );

  const batchId = String(plan.importBatches.rows[0][0]);
  const rawId = String(plan.rawTransactions.rows[0][0]);

  assert.deepEqual(
    preflightMercadoPagoImport(
      {
        accounts: [['id']],
        importBatches: [['id'], [batchId]],
        rawTransactions: [['id']],
      },
      plan,
    ),
    { ok: false, reason: 'duplicate-batch', conflictKey: batchId },
  );

  assert.deepEqual(
    preflightMercadoPagoImport(
      {
        accounts: [['id']],
        importBatches: [['id']],
        rawTransactions: [['id'], [rawId]],
      },
      plan,
    ),
    { ok: false, reason: 'duplicate-raw-transaction', conflictKey: rawId },
  );
});

test('Mercado Pago import plan rejects duplicate periods and cross-statement operation ids', () => {
  assert.throws(
    () =>
      buildMercadoPagoImportPlan(
        [
          {
            sourceHash: SOURCE_HASH_A,
            evidenceRef: 'drive:a',
            parsed: statement('2026-01', '200000000001', 10_000, 0),
          },
          {
            sourceHash: SOURCE_HASH_B,
            evidenceRef: 'drive:b',
            parsed: statement('2026-01', '200000000002', 10_000, 10_000),
          },
        ],
        GENERATED_AT,
      ),
    /Duplicate Mercado Pago statement period/,
  );

  assert.throws(
    () =>
      buildMercadoPagoImportPlan(
        [
          {
            sourceHash: SOURCE_HASH_A,
            evidenceRef: 'drive:a',
            parsed: statement('2026-01', '200000000001', 10_000, 0),
          },
          {
            sourceHash: SOURCE_HASH_B,
            evidenceRef: 'drive:b',
            parsed: statement('2026-02', '200000000001', -5_000, 10_000),
          },
        ],
        GENERATED_AT,
      ),
    /Duplicate Mercado Pago operation across statements/,
  );
});
