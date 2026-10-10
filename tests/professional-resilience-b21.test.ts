import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { parseCareerResilienceSnapshot } from '@/lib/professional/career-resilience-contract';
import { resilienceSpanishLists } from '@/lib/professional/resilience-copy-es';

const RAW = readFileSync(join(process.cwd(), 'data/generated/ai-career-resilience.json'), 'utf8');

function snapshot() {
  const value = parseCareerResilienceSnapshot(JSON.parse(RAW));
  assert.ok(value);
  return value;
}

test('PRO-B21-01: full Spanish translation coverage for all 11 canonical profiles', () => {
  const source = snapshot();
  assert.equal(source.roles.length, 11);
  for (const role of source.roles) {
    const translated = resilienceSpanishLists(role, source.source.commit);
    assert.ok(translated, 'Missing or outdated Spanish UI copy for ' + role.id);
    assert.equal(translated.human.length, role.loadBearingHumanWork.length);
    assert.equal(translated.playbook.length, role.protectionPlaybook.length);
    assert.equal(translated.up.length, role.riskUpSignposts.length);
    assert.equal(translated.down.length, role.riskDownSignposts.length);
    assert.ok(
      [...translated.human, ...translated.playbook, ...translated.up, ...translated.down].every(
        (line) => typeof line === 'string' && line.trim().length > 8,
      ),
    );
  }
});

test('PRO-B21-02: provenance changes or reordering do not silently misalign translations', () => {
  const source = snapshot();
  const role = source.roles.find((entry) => entry.id === 'platform-production-engineer');
  assert.ok(role);
  assert.ok(resilienceSpanishLists(role, source.source.commit));
  assert.equal(resilienceSpanishLists(role, '0'.repeat(40)), null);
  const edited = { ...role, protectionPlaybook: [...role.protectionPlaybook].reverse() };
  assert.equal(resilienceSpanishLists(edited, source.source.commit), null);
  const changed = { ...role, riskUpSignposts: role.riskUpSignposts.slice(1) };
  assert.equal(resilienceSpanishLists(changed, source.source.commit), null);
});

test('PRO-B21-03: all 11 roles offer distinct 1/5/10/20-year ranges', () => {
  const source = snapshot();
  for (const role of source.roles) {
    assert.deepEqual(Object.keys(role.horizons), ['Y1', 'Y5', 'Y10', 'Y20']);
    for (const key of ['Y1', 'Y5', 'Y10', 'Y20'] as const) {
      const h = role.horizons[key];
      for (const bounds of [
        h.aiAloneSubstitutionPressurePctRange,
        h.aiNativeResilienceIndexRange,
        h.headcountCompressionIndexRange,
      ]) {
        assert.ok(bounds[0] >= 0 && bounds[0] <= bounds[1] && bounds[1] <= 100);
      }
    }
  }
});

test('PRO-B21-04: values in software trajectory match PAS-derived evidence, no interpolation', () => {
  const software = snapshot().roles.find((role) => role.id === 'software-engineer');
  assert.ok(software);
  assert.deepEqual(
    (['Y1', 'Y5', 'Y10', 'Y20'] as const).map(
      (key) => software.horizons[key].aiAloneSubstitutionPressurePctRange,
    ),
    [
      [5, 15],
      [25, 50],
      [45, 75],
      [60, 95],
    ],
  );
  assert.deepEqual(
    (['Y1', 'Y5', 'Y10', 'Y20'] as const).map(
      (key) => software.horizons[key].aiNativeResilienceIndexRange,
    ),
    [
      [84, 94],
      [65, 84],
      [45, 72],
      [20, 55],
    ],
  );
  assert.equal(software.horizons.Y20.confidence, 'LOW');
});
