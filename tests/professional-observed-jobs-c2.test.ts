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
    Object.fromEntries(observedSkillCounts(result.observations).map((item) => [item.id, item.mentions])),
    {react: 12, node: 10, typescript: 9, sql: 7, testing: 6, cloud: 6, aws: 5},
  );
  assert.equal(result.sample.historicalTrend, 'HELD');
  assert.equal(result.sample.crossGeographyDemand, 'HELD');
});

test('PRO-C2-10: experience groups are disjoint, unknowns explicit, junior title separate', () => {
  const result = sample();
  assert.deepEqual(
    Object.fromEntries(observedExperienceCounts(result.observations).map(({id, mentions}) => [id, mentions])),
    {upTo2: 1, threePlus: 7, unspecified: 6},
  );
  assert.equal(result.observations.filter(({role}) => /\bjunior\b/i.test(role)).length, 3);
});

test('PRO-C2-11: geographic sample composition is not geography demand', () => {
  const result = sample();
  assert.deepEqual(
    Object.fromEntries(observedGeographyCounts(result.observations).map(({id, mentions}) => [id, mentions])),
    {CORDOBA_ONSITE_HYBRID: 4, ARGENTINA_REMOTE: 4, LATAM_REMOTE: 4, UNKNOWN: 2},
  );
});

test('PRO-C2-12: fabricated trend, market share, row removal, and overlaps fail closed', () => {
  const source = JSON.parse(RAW);
  source.marketSharePct = 90;
  assert.equal(parseObservedJobs(source), null);

  const trend = JSON.parse(RAW);
  trend.sample.historicalTrend = 'INCREASING';
  assert.equal(parseObservedJobs(trend), null);

  const removed = JSON.parse(RAW);
  removed.observations.pop();
  assert.equal(parseObservedJobs(removed), null);

  const overlap = JSON.parse(RAW);
  overlap.sample.historicalUrlOverlaps = 0;
  assert.equal(parseObservedJobs(overlap), null);
});

test('PRO-C2-13: duplicate job identities and unsupported geography are blocked', () => {
  const duplicate = JSON.parse(RAW);
  duplicate.observations[1].key = duplicate.observations[0].key;
  assert.equal(parseObservedJobs(duplicate), null);

  const unsupported = JSON.parse(RAW);
  unsupported.observations[0].geography = 'ALL_ARGENTINA';
  assert.equal(parseObservedJobs(unsupported), null);

  const invalidYears = JSON.parse(RAW);
  invalidYears.observations[0].yearsRequired = -2;
  assert.equal(parseObservedJobs(invalidYears), null);
});

test('PRO-C2-14: unavailable or stale snapshots are explained without invented freshness', () => {
  assert.equal(resolveObservedJobs(null).status, 'missing');
  assert.equal(resolveObservedJobs('{bad json').status, 'invalid');
  const current = resolveObservedJobs(RAW, new Date('2026-10-10T12:00:00Z'));
  assert.equal(current.status, 'ready');
  assert.equal(current.notice, null);
  const later = resolveObservedJobs(RAW, new Date('2026-11-20T00:00:00Z'));
  assert.equal(later.status, 'ready');
  assert.ok(later.notice?.includes('histórica'));
});
