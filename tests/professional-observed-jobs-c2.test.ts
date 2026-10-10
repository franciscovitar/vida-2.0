import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  observedExperienceCounts,
  observedGeographyCounts,
  observedSkillCounts,
  parseObservedJobs,
  resolveObservedJobs,
} from '@/lib/professional/observed-jobs-contract';

const RAW = readFileSync(
  join(process.cwd(), 'data/generated/professional-observed-jobs-c2.json'),
  'utf8',
);

function sample() {
  const result = parseObservedJobs(JSON.parse(RAW));
  assert.ok(result, 'observed vacancies must validate against the authoritative Sheet');
  return result;
}

test('PRO-C2-08: registered sample retains exact 14 rows and two historical URL overlaps', () => {
  const result = sample();
  assert.equal(result.sample.n, 14);
  assert.equal(result.source.spreadsheetId, '1JzpLjmMO1TK15KlNSzgJbSoq3a5PT0BBsUa0kMCAX0k');
  assert.equal(result.source.observedAt, '2026-10-10');
  assert.equal(result.sample.historicalUrlOverlaps, 2);
  assert.equal(result.sample.newUniqueUrlsComparedToOct02, 12);
  assert.equal(new Set(result.observations.map((o) => o.key)).size, 14);
  assert.equal(new Set(result.observations.map((o) => o.url)).size, 14);
});

test('PRO-C2-09: explicit skill mentions reproduce logged must-have terms, not market rates', () => {
  const result = sample();
  assert.deepEqual(
    Object.fromEntries(
      observedSkillCounts(result.observations).map((item) => [item.id, item.mentions]),
    ),
    { react: 12, ¶»§q«^