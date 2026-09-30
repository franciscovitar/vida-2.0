import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildNaranjaCanonicalPlan,
  naranjaCanonicalPlanMutations,
  type CanonicalRawTransaction,
} from '@/lib/finance/ledger/naranja-canonical-plan';
import { preflightNaranjaCanonicalPlan } from '@/lib/finance/ledger/naranja-canonical-preflight';

const RAW: CanonicalRawTransaction[] = [
  {
    id: 'finance-raw:naranja-x:ars:10000000001',
    batchId: 'finance-import:naranja-x:2026-01:ars:abc',
    accountId: 'finance-account:naranja-x:ars',
    sourceTransactionId: '10000000001',
    occurredAt: '2026-01-01T12:00:00.000Z',
    description: 'Synthetic credit',
    amountMinor: 10_000,
    currency: 'ARS',
    rawHash: 'a'.repeat(64),
  },
  {
    id: 'finance-raw:naranja-x:usd:10000000002',
    batchId: 'finance-import:naranja-x:2026-01:usd:abc',
    accountId: 'finance-account:naranja-x:usd',
    sourceTransactionId: '10000000002',
    occurredAt: '2026-01-02T12:00:00.000Z',
    description: 'Synthetic debit',
    amountMinor: -500,
    currency: 'USD',
    rawHash: 'b'.repeat(64),
  },
];

test('canonical Naranja plan creates one transaction/source and two balanced postings per raw row', () => {
  const plan = buildNaranjaCanonicalPlan(RAW, '2026-09-30T18:00:00.000Z');

  assert.equal(plan.transactionCount, 2);
  assert.equal(plan.postingCount, 4);

  assert.equal(plan.transactions.kind, 'append');
  assert.equal(plan.transactionSources.kind, 'append');
  assert.equal(plan.postings.kind, 'append');
  if (
    plan.transactions.kind !== 'append' ||
    plan.transactionSources.kind !== 'append' ||
    plan.postings.kind !== 'append'
  ) {
    return;
  }

  assert.equal(plan.transactions.rows.length, 2);
  assert.equal(plan.transactionSources.rows.length, 2);
  assert.equal(plan.postings.rows.length, 4);

  for (const tx of plan.transactions.rows) {
    const txId = String(tx[0]);
    const postings = plan.postings.rows.filter((posting) => posting[0] === txId);
    assert.equal(postings.length, 2);
    assert.equal(
      postings.reduce((sum, posting) => sum + Number(posting[3]), 0),
      0,
    );
    assert.equal(new Set(postings.map((posting) => posting[4])).size, 1);
  }
});

test('canonical plan keeps economic classification unresolved instead of guessing', () => {
  const plan = buildNaranjaCanonicalPlan(RAW, '2026-09-30T18:00:00.000Z');
  assert.equal(plan.postings.kind, 'append');
  if (plan.postings.kind !== 'append') return;

  assert.equal(
    plan.postings.rows.every((posting) => posting[6] === 'unknown_review'),
    true,
  );
  assert.equal(
    plan.postings.rows.filter((posting) => posting[7] === 'unclassified_contra').length,
    2,
  );
});

test('canonical plan creates native-currency system clearing accounts only once', () => {
  const plan = buildNaranjaCanonicalPlan(RAW, '2026-09-30T18:00:00.000Z');
  assert.equal(plan.accounts.kind, 'append');
  if (plan.accounts.kind !== 'append') return;

  assert.deepEqual(
    plan.accounts.rows.map((row) => [row[0], row[4]]),
    [
      ['finance-account:system:unclassified:ars', 'ARS'],
      ['finance-account:system:unclassified:usd', 'USD'],
    ],
  );
});

test('canonical plan mutations contain no write execution side effect', () => {
  const plan = buildNaranjaCanonicalPlan(RAW, '2026-09-30T18:00:00.000Z');
  assert.deepEqual(
    naranjaCanonicalPlanMutations(plan).map((mutation) => [
      mutation.kind,
      mutation.sheet,
    ]),
    [
      ['append', 'accounts'],
      ['append', 'transactions'],
      ['append', 'transactionSources'],
      ['append', 'postings'],
    ],
  );
});

test('canonical preflight accepts existing source accounts and empty canonical tabs', () => {
  const plan = buildNaranjaCanonicalPlan(RAW, '2026-09-30T18:00:00.000Z');

  const result = preflightNaranjaCanonicalPlan(
    {
      accounts: [
        ['id'],
        ['finance-account:naranja-x:ars'],
        ['finance-account:naranja-x:usd'],
      ],
      transactions: [['id']],
      transactionSources: [['transaction_id']],
      postings: [['transaction_id']],
    },
    plan,
  );

  assert.deepEqual(result, {
    ok: true,
    appendAccounts: 2,
    appendTransactions: 2,
    appendTransactionSources: 2,
    appendPostings: 4,
  });
});

test('canonical preflight blocks existing canonical rows', () => {
  const plan = buildNaranjaCanonicalPlan(RAW, '2026-09-30T18:00:00.000Z');

  const result = preflightNaranjaCanonicalPlan(
    {
      accounts: [['id']],
      transactions: [['id'], ['already-there']],
      transactionSources: [['transaction_id']],
      postings: [['transaction_id']],
    },
    plan,
  );

  assert.deepEqual(result, { ok: false, reason: 'existing-canonical-data' });
});

test('canonical plan rejects duplicate raw IDs and zero amounts', () => {
  assert.throws(
    () => buildNaranjaCanonicalPlan([RAW[0], RAW[0]], '2026-09-30T18:00:00.000Z'),
    /Duplicate raw id/,
  );

  assert.throws(
    () =>
      buildNaranjaCanonicalPlan(
        [{ ...RAW[0], id: 'finance-raw:naranja-x:ars:3', sourceTransactionId: '3', amountMinor: 0 }],
        '2026-09-30T18:00:00.000Z',
      ),
    RangeError,
  );
});
