import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  parseSkillDemandBaseline,
  resolveSkillDemandBaseline,
} from '@/lib/professional/skill-demand-contract';

const RAW = readFileSync(
  join(process.cwd(), 'data/generated/professional-skills-demand-c2.json'),
  'utf8',
);

function snapshot() {
  const parsed = parseSkillDemandBaseline(JSON.parse(RAW));
  assert.ok(parsed, 'PAS-derived observed job-sample snapshot must validate');
  return parsed;
}

test('PRO-C2-01: 17 observed patterns from a purposively selected 20-posting sample', () => {
  const source = snapshot();
  assert.equal(source.sample.n, 20);
  assert.equal(source.sample.method, 'PURPOSIVE_REPRESENTATIVE_NOT_CENSUS');
  assert.equal(source.source.observedAt, '2026-10-02');
  assert.equal(source.source.commit, '08ae01c509111438cb77f0f9582b9966013ae4a2');
  assert.equal(source.entries.length, 17);
  assert.deepEqual(source.sample.geographies, ['CORDOBA', 'ARGENTINA', 'LATAM_REMOTE']);
  assert.ok(source.sample.scope.includes('not representative'));
});

test('PRO-C2-02: every count matches the published PAS representative market-fit QA', () => {
  const expected: Record<string, number> = {
    typescript_javascript: 20,
    react_nextjs: 19,
    postgresql_sql: 16,
    production_reliability_failure_handling: 13,
    cloud_aws_or_cloud_operations: 12,
    ai_assisted_engineering: 12,
    node_backend_javascript: 12,
    testing_qa: 11,
    api_integrations: 10,
    product_cross_functional_ownership: 10,
    ci_cd: 8,
    security_auth_permissions: 8,
    docker_containers: 7,
    architecture_system_design: 7,
    english_explicit: 5,
    observability_explicit: 4,
    playwright_explicit: 4,
  };
  assert.deepEqual(
    Object.fromEntries(snapshot().entries.map((item) => [item.id, item.mentions])),
    expected,
  );
});

test('PRO-C2-03: cross-geography skill percentages or fabricated trend data fail closed', () => {
  const fabricated = JSON.parse(RAW);
  fabricated.entries[0].marketSharePct = 95;
  assert.equal(parseSkillDemandBaseline(fabricated), null);

  const extra = JSON.parse(RAW);
  extra.currentCollection.monthlyTrend = [{ date: '2026-10', value: 15 }];
  assert.equal(parseSkillDemandBaseline(extra), null);

  const impossible = JSON.parse(RAW);
  impossible.entries[0].mentions = 21;
  assert.equal(parseSkillDemandBaseline(impossible), null);
});

test('PRO-C2-04: the current observation sheet is empty; no repeated sampling is asserted', () => {
  const data = snapshot();
  assert.equal(data.currentCollection.status, 'HEADERS_ONLY_NO_OBSERVATIONS');
  assert.equal(data.currentCollection.repeatedComparableWindows, 0);
  assert.equal(data.currentCollection.skillTrend, 'HELD');
  assert.equal(data.currentCollection.skillFrequencyByGeography, 'HELD');
  assert.equal(data.currentCollection.observedAt, '2026-10-10');
});

test('PRO-C2-05: unmatched source, geography or method is not silently accepted', () => {
  const source = JSON.parse(RAW);
  source.source.commit = '0'.repeat(40);
  assert.equal(parseSkillDemandBaseline(source), null);

  const otherMarket = JSON.parse(RAW);
  otherMarket.sample.geographies = ['ARGENTINA'];
  assert.equal(parseSkillDemandBaseline(otherMarket), null);

  const replacement = JSON.parse(RAW);
  replacement.sample.method = 'REPRESENTATIVE_PROBABILITY_SAMPLE';
  assert.equal(parseSkillDemandBaseline(replacement), null);
});

test('PRO-C2-06: missing, malformed and historical evidence are visibly qualified', () => {
  assert.equal(resolveSkillDemandBaseline(null).status, 'missing');
  assert.equal(resolveSkillDemandBaseline('not JSON').status, 'invalid');
  const current = resolveSkillDemandBaseline(RAW, new Date('2026-10-10T12:00:00Z'));
  assert.equal(current.status, 'ready');
  assert.equal(current.stale, false);
  const later = resolveSkillDemandBaseline(RAW, new Date('2026-11-15T12:00:00Z'));
  assert.equal(later.status, 'ready');
  assert.equal(later.stale, true);
  assert.ok(later.notice?.includes('histórica'));
});

test('PRO-C2-07: the display separates technical stacks and broader professional capabilities', () => {
  const data = snapshot();
  const tech = data.entries.filter((item) => item.kind === 'stack');
  const skills = data.entries.filter((item) => item.kind === 'professional');
  assert.equal(tech.length + skills.length, 17);
  assert.ok(tech.length > 0 && skills.length > 0);
  for (const entry of data.entries) {
    assert.equal(typeof entry.label, 'string');
    assert.ok(entry.label.length > 4);
    assert.ok(entry.mentions >= 0 && entry.mentions <= data.sample.n);
  }
});
