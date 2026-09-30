import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  matchExactOwnedAccountTransfers,
  type OwnedTransferCandidate,
} from '@/lib/finance/matching/exact-owned-transfer';

function candidate(
  source: 'naranja-x' | 'mercado-pago',
  id: string,
  amountMinor: number,
  confirmedOwnedAccountTransfer = true,
): OwnedTransferCandidate {
  return {
    source,
    rawTransactionId: `raw:${source}:${id}`,
    sourceTransactionId: id,
    occurredOn: '2026-04-15',
    amountMinor,
    currency: 'ARS',
    confirmedOwnedAccountTransfer,
  };
}

test('exact owned-transfer matcher creates one high-confidence match for opposite movements', () => {
  const result = matchExactOwnedAccountTransfers([
    candidate('naranja-x', 'nx-1', -10_000),
    candidate('mercado-pago', 'mp-1', 10_000),
  ]);

  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.matches[0], {
    id: 'finance-match:owned-transfer:nx-1:mp-1',
    naranjaRawTransactionId: 'raw:naranja-x:nx-1',
    mercadoPagoRawTransactionId: 'raw:mercado-pago:mp-1',
    occurredOn: '2026-04-15',
    amountMinor: 10_000,
    currency: 'ARS',
    direction: 'NARANJA_X_TO_MERCADO_PAGO',
    confidence: 1,
  });
  assert.deepEqual(result.ambiguousCandidateIds, []);
  assert.deepEqual(result.unmatchedConfirmedCandidateIds, []);
});

test('same-sign movements do not auto-match', () => {
  const result = matchExactOwnedAccountTransfers([
    candidate('naranja-x', 'nx-1', 10_000),
    candidate('mercado-pago', 'mp-1', 10_000),
  ]);

  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatchedConfirmedCandidateIds.length, 2);
});

test('multiple plausible opposite movements remain ambiguous', () => {
  const result = matchExactOwnedAccountTransfers([
    candidate('naranja-x', 'nx-1', 10_000),
    candidate('naranja-x', 'nx-2', 10_000),
    candidate('mercado-pago', 'mp-1', -10_000),
  ]);

  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.ambiguousCandidateIds, [
    'raw:mercado-pago:mp-1',
    'raw:naranja-x:nx-1',
    'raw:naranja-x:nx-2',
  ]);
});

test('unconfirmed candidates are never considered for auto-match', () => {
  const result = matchExactOwnedAccountTransfers([
    candidate('naranja-x', 'nx-1', -10_000, false),
    candidate('mercado-pago', 'mp-1', 10_000),
  ]);

  assert.equal(result.matches.length, 0);
  assert.equal(result.ignoredUnconfirmedCount, 1);
  assert.deepEqual(result.unmatchedConfirmedCandidateIds, ['raw:mercado-pago:mp-1']);
});

test('matcher rejects duplicate candidate IDs and invalid amounts', () => {
  const duplicate = candidate('naranja-x', 'same', -10_000);

  assert.throws(
    () =>
      matchExactOwnedAccountTransfers([
        duplicate,
        { ...duplicate, sourceTransactionId: 'other' },
      ]),
    /Duplicate owned-transfer candidate/,
  );

  assert.throws(
    () => matchExactOwnedAccountTransfers([candidate('naranja-x', 'zero', 0)]),
    RangeError,
  );
});
