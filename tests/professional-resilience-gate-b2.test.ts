import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  parseCareerResilienceSnapshot,
  resolveCareerResilienceText,
} from '@/lib/professional/career-resilience-contract';

const RAW = readFileSync(join(process.cwd(), 'data/generated/ai-career-resilience.json'), 'utf8');

function snapshot() {
  const value = parseCareerResilienceSnapshot(JSON.parse(RAW));
  assert.ok(value, 'existing PAS-derived resilience evidence must validate');
  return value;
}

test('PRO-B2-01 reuses existing 11 roles and four complete horizons', () => {
  const value = snapshot();
  assert.equal(value.roles.length, 11);
  assert.equal(value.source.repository, 'franciscovitar/personal-ai-system');
  assert.equal(
    value.source.canonicalRef,
    'AI/projects/professional-intelligence/AI_CAREER_RESILIENCE_CURRENT_V1.json',
  );
  assert.equal(value.source.commit, 'aa5d930c43c39401a5cfed1a30556e8c72780f4f');
  for (const role of value.roles) {
    assert.deepEqual(Object.keys(role.horizons), ['Y1', 'Y5', 'Y10', 'Y20']);
  }
});

test('PRO-B2-02 source preserves three different numeric semantics', () => {
  const value = snapshot();
  assert.match(value.numericSemantics.ai_alone_substitution_pressure_pct_range, /UNCALIBRATED/);
  assert.match(value.numericSemantics.ai_native_resilience_index_range, /NOT_PROBABILITY/);
  assert.match(value.numericSemantics.headcount_compression_index_range, /NOT_PERCENT_JOBS_LOST/);
  const software = value.roles.find((role) => role.id === 'software-engineer');
  assert.ok(software);
  assert.deepEqual(software.horizons.Y1.aiAloneSubstitutionPressurePctRange, [5, 15]);
  assert.deepEqual(software.horizons.Y1.aiNativeResilienceIndexRange, [84, 94]);
  assert.deepEqual(software.horizons.Y1.headcountCompressionIndexRange, [25, 42]);
});

test('PRO-B2-03 widening horizons are stored as uncalibrated estimates', () => {
  const value = snapshot();
  const software = value.roles.find((role) => role.id === 'software-engineer');
  assert.ok(software);
  assert.equal(software.horizons.Y20.confidence, 'LOW');
  assert.equal(software.horizons.Y20.pressureSemantics, 'UNCALIBRATED_SCENARIO_ESTIMATE');
  assert.equal(software.horizons.Y20.resilienceSemantics, 'HEURISTIC_INDEX_NOT_PROBABILITY');
  assert.equal(software.horizons.Y20.compressionSemantics, 'HEURISTIC_INDEX_NOT_PROBABILITY');
});

test('PRO-B2-04 no invented percentages or probabilities pass validation', () => {
  const invalid = JSON.parse(RAW);
  invalid.roles[0].horizons.Y5.aiAloneSubstitutionPressurePctRange = [70, 150];
  assert.equal(parseCareerResilienceSnapshot(invalid), null);

  const wrongSemantics = JSON.parse(RAW);
  wrongSemantics.roles[0].horizons.Y5.compressionSemantics = 'PERCENT_JOBS_LOST';
  assert.equal(parseCareerResilienceSnapshot(wrongSemantics), null);

  const mixedMetric = JSON.parse(RAW);
  mixedMetric.numericSemantics.ai_native_resilience_index_range = 'EMPLOYMENT_PROBABILITY';
  assert.equal(parseCareerResilienceSnapshot(mixedMetric), null);
});

test('PRO-B2-05 differentiated data specializations remain separate', () => {
  const value = snapshot();
  const required = ['data-engineer', 'data-scientist', 'data-analyst-bi'];
  assert.ok(required.every((id) => value.roles.some((role) => role.id === id)));
  const collapsed = JSON.parse(RAW);
  collapsed.roles = collapsed.roles.filter((role: { id: string }) => role.id !== 'data-analyst-bi');
  assert.equal(parseCareerResilienceSnapshot(collapsed), null);
});

test('PRO-B2-06 current source is not silently relabeled or refreshed', () => {
  const today = resolveCareerResilienceText(RAW, new Date('2026-10-10'));
  assert.equal(today.status, 'ready');
  assert.equal(today.stale, false);
  const future = resolveCareerResilienceText(RAW, new Date('2027-01-10'));
  assert.equal(future.status, 'ready');
  assert.equal(future.stale, true);
  assert.ok(future.notice);
  const changedSource = JSON.parse(RAW);
  changedSource.source.commit = 'not-a-commit';
  assert.equal(parseCareerResilienceSnapshot(changedSource), null);
  assert.equal(resolveCareerResilienceText('broken').status, 'invalid');
  assert.equal(resolveCareerResilienceText(null).status, 'missing');
});
