/**
 * Block 3A — encryption AES-GCM roundtrip / tamper / store hygiene.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

import {
  createMemoryEncryptedPayloadStore,
  decryptProposalPayload,
  encryptProposalPayload,
  encryptedPayloadStorageKey,
  payloadDigest,
  validateEncryptionKey,
  type EncryptedProposalEnvelope,
} from '@/lib/actions/encryption';

test('B3A-01. encrypt/decrypt roundtrip', () => {
  const key = randomBytes(32);
  const plain = JSON.stringify({ proposedActionType: 'inbox.capture', payload: { text: 'hola' } });
  const envelope = encryptProposalPayload(key, plain);
  assert.equal(envelope.v, 1);
  assert.ok(envelope.nonce);
  assert.ok(envelope.ciphertext);
  assert.ok(envelope.tag);
  assert.equal(decryptProposalPayload(key, envelope), plain);
  assert.equal(payloadDigest(plain).length, 64);
});

test('B3A-02. wrong key fails decrypt', () => {
  const key = randomBytes(32);
  const other = randomBytes(32);
  const envelope = encryptProposalPayload(key, '{"ok":true}');
  assert.throws(() => decryptProposalPayload(other, envelope));
});

test('B3A-03. tampered ciphertext fails', () => {
  const key = randomBytes(32);
  const envelope = encryptProposalPayload(key, '{"ok":true}');
  const buf = Buffer.from(envelope.ciphertext, 'base64');
  buf[0] = buf[0]! ^ 0xff;
  const tampered: EncryptedProposalEnvelope = {
    ...envelope,
    ciphertext: buf.toString('base64'),
  };
  assert.throws(() => decryptProposalPayload(key, tampered));
});

test('B3A-04. unknown envelope version rejected', () => {
  const key = randomBytes(32);
  const envelope = encryptProposalPayload(key, '{"ok":true}');
  assert.throws(() =>
    decryptProposalPayload(key, { ...envelope, v: 99 as EncryptedProposalEnvelope['v'] }),
  );
});

test('B3A-05. store holds envelope only (no plaintext)', async () => {
  const key = randomBytes(32);
  const plain = '{"secret":"never-store-me","email":"user@example.com"}';
  const store = createMemoryEncryptedPayloadStore();
  const digest = payloadDigest(plain);
  const storageKey = encryptedPayloadStorageKey('prop-demo', digest);
  await store.put(storageKey, encryptProposalPayload(key, plain), 3600);
  const got = await store.get(storageKey);
  assert.ok(got);
  const serialized = JSON.stringify(got);
  assert.equal(serialized.includes('never-store-me'), false);
  assert.equal(serialized.includes('user@example.com'), false);
  assert.equal(serialized.includes(plain), false);
  assert.equal(validateEncryptionKey(key.toString('base64'))?.equals(key), true);
  assert.equal(validateEncryptionKey('too-short'), null);
});
