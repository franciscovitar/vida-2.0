import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { mapCalendarTokenHttpStatus } from '@/lib/calendar/errors';

test('CAL-TOKEN-1. Failed refresh credentials stay distinct from provider outages', () => {
  assert.equal(mapCalendarTokenHttpStatus(400), 'auth-error');
  assert.equal(mapCalendarTokenHttpStatus(401), 'auth-error');
  assert.equal(mapCalendarTokenHttpStatus(403), 'permission-error');
  assert.equal(mapCalendarTokenHttpStatus(429), 'rate-limited');
  for (const status of [404, 408, 500, 502, 503, 504]) {
    assert.equal(mapCalendarTokenHttpStatus(status), 'read-error');
  }
});

test('CAL-TOKEN-2. Token reader uses sanitized HTTP mapping without provider-body leaks', () => {
  const source = readFileSync(join(process.cwd(), 'lib', 'calendar', 'token.ts'), 'utf8');
  assert.match(source, /mapCalendarTokenHttpStatus\(response\.status\)/);
  assert.doesNotMatch(source, /console\.(log|info|debug|warn|error)\(/);
  assert.doesNotMatch(source, /return[^;]*bodyText/);
});

test('CAL-TOKEN-3. Malformed success is read-error, never proof of invalid credentials', () => {
  const source = readFileSync(join(process.cwd(), 'lib', 'calendar', 'token.ts'), 'utf8');
  assert.match(source, /typeof parsed\.access_token !== 'string'[\s\S]*?code: 'read-error'/);
  assert.match(source, /catch \{\s*return \{ ok: false, code: 'read-error' \};\s*\}/);
});
