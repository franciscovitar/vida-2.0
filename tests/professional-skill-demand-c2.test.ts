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

const REFERENCE: Record<string, number> = {
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

function snapshot() {
  const parsed = parseSkillDemandBaseline(JSON.parse(RAW));
  assert.ok(parsed);
  return parsed;
}

test('PRO-C2-01 17 PAS observations match the bounded 20-posting baseline', () => {
  const s = snapshot();
  assert.equal(s.entries.length, 17);
  assert.equal(s.sample.n, 20);
  assert.equal(s.source.commit, '08ae01c509111438cb77f0f9582b9966013ae4a2');
  assert.equal(s.source.observedAt, '2026-10-02');
  assert.equal(s.sample.method, 'PURPOSIVE_REPRESENTATIVE_NOT_CENSUS');
  assert.deepEqual(
    Object.fromEntries(s.entries.map((entry) => [entry.id, entry.mentions])),
    REFERENCE,
  );
});

test('PRO-C2-02 count comparisons are never vacancy prevalence or market rate', () => {
  const s = snapshot();
  assert.equal(s.semantics, 'COUNTS_OF_MENTIONS_IN_PURPOSIVE_POSTING_SAMPLE_NOT_VACANCY_RATE');
  assert.deepEqual(s.sample.geographies, ['CORDOBA', 'ARGENTINA', 'LATAM_REMOTE']);
  assert.ok(s.entries.every((entry) => Number.isInteger(entry.mentions) && entry.mentions <= 20));
  assert.ok(s.entries.every((entry) => !('marketSharePct' in entry)));
});

test('PRO-C2-03 no fictitious repeated samples, geographic rates or trends', () => {
  const s = snapshot();
  assert.equal(s.currentCollection.status, 'HEADERS_ONLY_NO_OBSERVATIONS');
  assert.equal(s.currentCollection.repeatedComparableWindows, 0);
  assert.equal(s.currentCollection.skillFrequencyByGeography, 'HELD');
  assert.equal(s.currentCollection.skillTrend, 'HELD');
  const invented = JSON.parse(RAW);
  invented.currentCollection.skillTrend = 'RISING_28_PERCENT';
  assert.equal(parseSkillDemandBaseline(invented), null);
  const falseGeography = JSON.parse(RAW);
  falseGeography.sample.geographies = ['ARGENTINA'];
  assert.equal(parseSkillDemandBaseline(falseGeography), null);
});

test('PRO-C2-04 false metric values, missing sources and sample changes are rejected', () => {
  const wrongCount = JSON.parse(RAW);
  wrongCount.entries[0].mentions = 21;
  assert.equal(parseSkillDemandBaseline(wrongCount), null);
  const extra = JSON.parse(RAW);
  extra.entries[0].employmentProbability = 0.8;
  assert.equal(parseSkillDemandBaseline(extra), null);
  const source = JSON.parse(RAW);
  source.source.commit = '0'.repeat(40);
  assert.equal(parseSkillDemandBaseline(source), null);
  const missing = JSON.parse(RAW);
  missing.entries.pop();
  assert.equal(parseSkillDemandBaseline(missing), null);
});

test('PRO-C2-05 historical sample expires instead of silently pretending to be live', () => {
  assert.equal(resolveSkillDemandBaseline(RAW, new Date('2026-10-10')).stale, false);
  const future = resolveSkillDemandBaseline(RAW, new Date('2026-11-15'));
  assert.equal(future.stale, true);
  assert.ok(future.notice);
  assert.equal(resolveSkillDemandBaseline(null).status, 'missing');
  assert.equal(resolveSkillDemandBaseline('not-json').status, 'invalid');
});

test('PRO-C2-06 separate role data and source references retain correct semantics', () => {
  const s = snapshot();
  assert.deepEqual(s.sample.roleFamilies, ['Software Engineer', 'Full-Stack Product Engineer']);
  assert.equal(
    s.source.canonicalRef,
    'AI/projects/professional-profile-v1/MARKET_FIT_QA_CURRENT_V1.json',
  );
  assert.equal(
    s.source.evidenceDocumentRef,
    'AI/projects/professional-profile-v1/MARKET_FIT_QA_2026-10-02.md',
  );
  assert.equal(s.source.sourceSpreadsheetId, '1JzpLjmMO1TK15KlNSzgJbSoq3a5PT0BBsUa0kMCAX0k');
});
