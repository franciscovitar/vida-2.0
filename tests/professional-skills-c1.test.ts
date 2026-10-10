import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  parseProfessionalSkillsMatrix,
  resolveProfessionalSkillsText,
} from '@/lib/professional/skills-contract';
import { parseProfessionalHorizonSnapshot } from '@/lib/professional/horizon-contract';

const SKILLS_RAW = readFileSync(
  join(process.cwd(), 'data/generated/professional-skills-matrix.json'),
  'utf8',
);
const FORECAST_RAW = readFileSync(
  join(process.cwd(), 'data/generated/professional-forecast-horizons.json'),
  'utf8',
);

function snapshot() {
  const parsed = parseProfessionalSkillsMatrix(JSON.parse(SKILLS_RAW));
  assert.ok(parsed, 'PAS-derived skill matrix must validate');
  return parsed;
}

test('PRO-C1-01 five real growth items, nine role archetypes and ten distinct skill references', () => {
  const data = snapshot();
  assert.equal(data.roles.length, 9);
  assert.equal(data.items.length, 5);
  assert.equal(data.source.commit, '08ae01c509111438cb77f0f9582b9966013ae4a2');
  assert.equal(data.source.observedAt, '2026-10-02');
  assert.equal(data.source.personalEvidenceObservedAt, '2026-09-22');
  assert.equal(
    data.items.reduce((count, item) => count + item.skillRefs.length, 0),
    12,
  );
  assert.equal(
    new Set(data.items.flatMap((item) => item.skillRefs.map((skill) => skill.id))).size,
    10,
  );
});

test('PRO-C1-02 shared references show ontology membership, not market demand', () => {
  const data = snapshot();
  const software = data.roles.find((role) => role.id === 'software-engineer');
  const dataRole = data.roles.find((role) => role.id === 'data-analytics-engineer');
  const sql = data.items.find((item) => item.id === 'GROWTH-002');
  assert.ok(software && dataRole && sql);
  assert.ok(software.coreSkillRefs.includes('sql-relational-data-modeling'));
  assert.ok(dataRole.coreSkillRefs.includes('postgresql-transactional-persistence'));
  assert.equal(
    sql.skillRefs.find((skill) => skill.id === 'sql-relational-data-modeling')?.evidenceState,
    'PRACTICED',
  );
  assert.equal(
    sql.skillRefs.find((skill) => skill.id === 'postgresql-transactional-persistence')
      ?.evidenceState,
    'DEMONSTRATED',
  );
  assert.equal(
    sql.skillRefs.every((skill) => skill.personalVerificationStatus === 'UNVERIFIED'),
    true,
  );
});

test('PRO-C1-03 unsupported skill demand frequencies and job probabilities fail closed', () => {
  const invalid = JSON.parse(SKILLS_RAW);
  invalid.items[0].skillDemandPercent = 72;
  assert.equal(parseProfessionalSkillsMatrix(invalid), null);
  const invalidRole = JSON.parse(SKILLS_RAW);
  invalidRole.roles[0].estimatedHiringProbability = 0.8;
  assert.equal(parseProfessionalSkillsMatrix(invalidRole), null);
  const invalidClaim = JSON.parse(SKILLS_RAW);
  invalidClaim.items[0].skillRefs[0].personalVerificationStatus = 'VERIFIED';
  assert.equal(parseProfessionalSkillsMatrix(invalidClaim), null);
});

test('PRO-C1-04 unrecognized source, horizon projections and incomplete coverage reject', () => {
  const alteredSource = JSON.parse(SKILLS_RAW);
  alteredSource.source.commit = '0'.repeat(40);
  assert.equal(parseProfessionalSkillsMatrix(alteredSource), null);
  const fabricatedFuture = JSON.parse(SKILLS_RAW);
  fabricatedFuture.horizons.mid = 'SQL_DEMAND_PLUS_37_PERCENT';
  assert.equal(parseProfessionalSkillsMatrix(fabricatedFuture), null);
  const incomplete = JSON.parse(SKILLS_RAW);
  incomplete.roles.pop();
  assert.equal(parseProfessionalSkillsMatrix(incomplete), null);
  const badDate = JSON.parse(SKILLS_RAW);
  badDate.source.personalEvidenceObservedAt = '2026-02-30';
  assert.equal(parseProfessionalSkillsMatrix(badDate), null);
});

test('PRO-C1-05 no unsupported freshness claims', () => {
  assert.equal(resolveProfessionalSkillsText(SKILLS_RAW, new Date('2026-10-10')).stale, false);
  const later = resolveProfessionalSkillsText(SKILLS_RAW, new Date('2027-04-01'));
  assert.equal(later.stale, true);
  assert.ok(later.notice);
  assert.equal(resolveProfessionalSkillsText(null).status, 'missing');
  assert.equal(resolveProfessionalSkillsText('broken').status, 'invalid');
});

test('PRO-C1-06 sector forecasts stay separate from skill frequencies', () => {
  const skills = snapshot();
  const forecast = parseProfessionalHorizonSnapshot(JSON.parse(FORECAST_RAW));
  assert.ok(forecast);
  assert.equal(skills.marketSkillFrequencyStatus, 'INSUFFICIENT_COMPARABLE_REPEATED_JOB_SAMPLES');
  assert.equal(forecast.profiles.length, 6);
  for (const profile of forecast.profiles) {
    for (const key of ['NEAR_12_24M', 'MID_3_5Y', 'LONG_5_10Y'] as const) {
      assert.equal(typeof profile.horizons[key].aiInteractionEs, 'string');
      assert.equal('skillDemandGrowthPercent' in profile.horizons[key], false);
    }
  }
});
