import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { NaranjaStatementResult } from '@/lib/finance/importers/naranja-x';
import {
  buildNaranjaImportPlan,
  naranjaImportPlanMutations,
} from '@/lib/finance/importers/naranja-x-plan';
import { preflightNaranjaImport } from '@/lib/finance/importers/naranja-x-preflight';

const SOURCE_HASH = 'a'.repeat(64);
const GENERATED_AT = '2026-09-30T17:45:00.000Z';

const PARSED: NaranjaStatementResult = {
  sections: [
    {
      currency: 'ARS',
      statementClosed: true,
      openingBalanceMinor: 100_000,
      statementClosingBalanceMinor: 112_500,
      derivedClosingBalanceMinor: 112_500,
      duplicateSourceTransactionIds: ['10000000003'],
      reconciliationDifferenceMinor: 0,
      transactions: [
        {
          sourceTransactionId: '10000000001',
          occurredOn: '2026-07-01',
          description: 'Rendimiento diario',
          sourceAmountMinor: 2_500,
          amountMinor: 2_500,
          balanceAfterMinor: 102_500,
          currency: 'ARS',
        },
        {
          sourceTransactionId: '10000000002',
          occurredOn: '2026-07-02',
          description: 'Transferencia recibida Persona Ejemplo',
          sourceAmountMinor: 10_000,
          amountMinor: 10_000,
          balanceAfterMinor: 112_500,
          currency: 'ARS',
        },
      ],
    },
    {
      currency: 'USD',
      statementClosed: false,
      openingBalanceMinor: 0,
      statementClosingBalanceMinor: null,
      derivedClosingBalanceMinor: 150,
      duplicateSourceTransactionIds: [],
      reconciliationDifferenceMinor: null,
      transactions: [
        {
          sourceTransactionId: '10000000004',
          occurredOn: '2026-07-04',
          description: 'Compra de dólar oficial',
          sourceAmountMinor: 150,
          amountMinor: 150,
          balanceAfterMinor: 150,
          currency: 'USD',
        },
      ],
    },
  ],
};

test('Naranja X import plan is deterministic and contains only bounded append mutations', () => {
  const input = {
    statementPeriod: '2026-07',
    sourceHash: SOURCE_HASH,
    evidenceRef: 'drive:evidence-ref',
    generatedAt: GENERATED_AT,
    parsed: PARSED,
  };

  const first = buildNaranjaImportPlan(input);
  const second = buildNaranjaImportPlan(input);

  assert.deepEqual(first, second);
  assert.equal(first.totalRawTransactions, 3);
  assert.equal(first.sections[0].duplicateRowsDetected, 1);
  assert.equal(first.sections[1].statementClosed, false);

  const mutations = naranjaImportPlanMutations(first);
  assert.deepEqual(
    mutations.map((mutation) => [mutation.kind, mutation.sheet]),
    [
      ['append', 'accounts'],
      ['append', 'importBatches'],
      ['append', 'rawTransactions'],
    ],
  );
});

test('Naranja X plan preserves signed amount, native currency and stable source identity', () => {
  const plan = buildNaranjaImportPlan({
    statementPeriod: '2026-07',
    sourceHash: SOURCE_HASH,
    evidenceRef: 'drive:evidence-ref',
    generatedAt: GENERATED_AT,
    parsed: PARSED,
  });

  assert.equal(plan.rawTransactions.kind, 'append');
  if (plan.rawTransactions.kind !== 'append') return;

  const ars = plan.rawTransactions.rows[0];
  assert.equal(ars[3], '10000000001');
  assert.equal(ars[6], 2_500);
  assert.equal(ars[7], 'ARS');

  const usd = plan.rawTransactions.rows[2];
  assert.equal(usd[6], 150);
  assert.equal(usd[7], 'USD');
});

test('Naranja X preflight accepts an empty store and reports exact append counts', () => {
  const plan = buildNaranjaImportPlan({
    statementPeriod: '2026-07',
    sourceHash: SOURCE_HASH,
    evidenceRef: 'drive:evidence-ref',
    generatedAt: GENERATED_AT,
    parsed: PARSED,
  });

  assert.deepEqual(
    preflightNaranjaImport(
      {
        accounts: [['id']],
        importBatches: [['id']],
        rawTransactions: [['id']],
      },
      plan,
    ),
    {
      ok: true,
      existingAccounts: 0,
      appendAccounts: 2,
      appendBatches: 2,
      appendRawTransactions: 3,
    },
  );
});

test('Naranja X preflight reuses identical accounts but blocks duplicate batches', () => {
  const plan = buildNaranjaImportPlan({
    statementPeriod: '2026-07',
    sourceHash: SOURCE_HASH,
    evidenceRef: 'drive:evidence-ref',
    generatedAt: GENERATED_AT,
    parsed: PARSED,
  });

  assert.equal(plan.accounts.kind, 'append');
  assert.equal(plan.importBatches.kind, 'append');
  if (plan.accounts.kind !== 'append' || plan.importBatches.kind !== 'append') return;

  const duplicateBatch = plan.importBatches.rows[0];

  const result = preflightNaranjaImport(
    {
      accounts: [['id'], ...plan.accounts.rows],
      importBatches: [['id'], duplicateBatch],
      rawTransactions: [['id']],
    },
    plan,
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'duplicate-batch');
});

test('Naranja X plan rejects malformed period/hash and missing evidence reference', () => {
  assert.throws(
    () =>
      buildNaranjaImportPlan({
        statementPeriod: '07-2026',
        sourceHash: SOURCE_HASH,
        evidenceRef: 'drive:evidence-ref',
        generatedAt: GENERATED_AT,
        parsed: PARSED,
      }),
    /YYYY-MM/,
  );

  assert.throws(
    () =>
      buildNaranjaImportPlan({
        statementPeriod: '2026-07',
        sourceHash: 'bad',
        evidenceRef: 'drive:evidence-ref',
        generatedAt: GENERATED_AT,
        parsed: PARSED,
      }),
    /SHA-256/,
  );

  assert.throws(
    () =>
      buildNaranjaImportPlan({
        statementPeriod: '2026-07',
        sourceHash: SOURCE_HASH,
        evidenceRef: ' ',
        generatedAt: GENERATED_AT,
        parsed: PARSED,
      }),
    /evidenceRef/,
  );
});
