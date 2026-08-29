import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';

import {
  VIDA_HMAC_PROTOCOL,
  buildCanonicalString,
  formatTimestamp,
  sha256Hex,
  signCanonical,
} from '../openclaw-plugin/vida-2-0-api/src/canonical';
import {
  VIDA_REQUEST_ID_PATTERN,
  createDefaultRequestIdGenerator,
  isValidVidaRequestId,
} from '../openclaw-plugin/vida-2-0-api/src/request-id';

test('sha256Hex matches an independently computed digest of the exact input string', () => {
  const input = '{"operation":"areas.list","input":{}}';
  const expected = createHash('sha256').update(Buffer.from(input, 'utf8')).digest('hex');
  assert.equal(sha256Hex(input), expected);
});

test('sha256Hex of the empty string is the well-known empty-body digest (GET empty-body hashing)', () => {
  assert.equal(sha256Hex(''), createHash('sha256').update(Buffer.from('', 'utf8')).digest('hex'));
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('buildCanonicalString produces the exact vida2-openclaw-hmac-v2 layout', () => {
  const params = {
    timestamp: '1700000000000',
    requestId: 'req-abc123',
    method: 'post',
    pathname: '/api/openclaw/v1/read',
    rawBody: '{"operation":"areas.list","input":{}}',
  };
  const expectedBodyHash = createHash('sha256')
    .update(Buffer.from(params.rawBody, 'utf8'))
    .digest('hex');
  const expected = [
    VIDA_HMAC_PROTOCOL,
    params.timestamp,
    params.requestId,
    'POST',
    params.pathname,
    expectedBodyHash,
  ].join('\n');

  assert.equal(buildCanonicalString(params), expected);
});

test('signCanonical matches an independently computed HMAC-SHA256 over the exact canonical string', () => {
  const secret = 'test-only-fixture-secret-never-real';
  const canonical = buildCanonicalString({
    timestamp: '1700000000000',
    requestId: 'req-xyz',
    method: 'GET',
    pathname: '/api/openclaw/v1/health',
    rawBody: '',
  });
  const expected = createHmac('sha256', secret).update(canonical).digest('hex');
  assert.equal(signCanonical(secret, canonical), expected);
  assert.match(signCanonical(secret, canonical), /^[0-9a-f]{64}$/);
});

test('formatTimestamp yields a 13-digit epoch-millisecond string', () => {
  const value = formatTimestamp(1700000000000);
  assert.equal(value, '1700000000000');
  assert.match(value, /^[0-9]{13}$/);
});

test('request IDs are unique across a large batch and match the Vida grammar (boundary check)', () => {
  const generate = createDefaultRequestIdGenerator();
  const count = 5000;
  const seen = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    const id = generate();
    assert.ok(isValidVidaRequestId(id), `expected valid request id, got: ${id}`);
    seen.add(id);
  }
  assert.equal(seen.size, count, 'expected every generated request id to be unique');
});

test('VIDA_REQUEST_ID_PATTERN rejects an empty string and a value with disallowed characters', () => {
  assert.equal(VIDA_REQUEST_ID_PATTERN.test(''), false);
  assert.equal(VIDA_REQUEST_ID_PATTERN.test('has a space'), false);
  assert.equal(VIDA_REQUEST_ID_PATTERN.test('has/slash'), false);
  assert.equal(VIDA_REQUEST_ID_PATTERN.test('abc-123._:OK'), true);
});
