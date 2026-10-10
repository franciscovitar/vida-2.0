import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  FORECAST_HORIZONS,
  parseProfessionalHorizonSnapshot,
  resolveProfessionalHorizonText,
} from '@/lib/professional/horizon-contract';

const raw = readFileSync(
  join(process.cwd(), 'data', 'generated', 'professional-forecast-horizons.json'),
  'utf8',
);

test('PRO-HORIZON-01 six canonical families with three distinct horizons', () => {
  const data = parseProfessionalHorizonSnapshot(JSON.parse(raw));
  assert.ok(data);
  assert.equal(data.profiles.length, 6);
  assert.equal(data.source.commit, '08ae01c509111438cb77f0f9582b9966013ae4a2');
  assert.equal(
    data.source.canonicalRef,
    'AI/projects/professional-intelligence/FORECAST_CURRENT_V1.json',
  );
  assert.equal(data.forecastMode, 'BASE_DIRECTIONAL_ONLY');
  assert.ok(data.profiles.every((item) => FORECAST_HORIZONS.every((h) => item.horizons[h])));
});

test('PRO-HORIZON-02 differentiation between software, security and routine web', () => {
  const data = parseProfessionalHorizonSnapshot(JSON.parse(raw));
  assert.ok(data);
  const find = (id: string) => {
    const role = data.profiles.find((item) => item.id === id);
    assert.ok(role);
    return role;
  };
  assert.equal(
    find('ai-native-product-software-engineering').horizons.LONG_5_10Y.outlook,
    'UNCERTAIN',
  );
  assert.equal(find('security-privacy-engineering').horizons.LONG_5_10Y.outlook, 'POSITIVE');
  assert.equal(
    find('web-implementation-only').horizons.NEAR_12_24M.outlook,
    'PRESSURE_ON_ROUTINE_TASKS',
  );
});

test('PRO-HORIZON-03 no fabricated job-loss probabilities or numeric rankings', () => {
  const data = parseProfessionalHorizonSnapshot(JSON.parse(raw));
  assert.ok(data);
  assert.ok(
    data.profiles.every((item) =>
      FORECAST_HORIZONS.every((h) => typeof item.horizons[h].outlook === 'string'),
    ),
  );
  for (const role of data.profiles) {
    assert.equal('jobLossProbability' in role, false);
    assert.equal('careerScore' in role, false);
  }
});

test('PRO-HORIZON-04 rejects unknown roles, status, horizon and incomplete evidence', () => {
  const unknownRole = JSON.parse(raw);
  unknownRole.profiles[0].id = 'invented-career';
  assert.equal(parseProfessionalHorizonSnapshot(unknownRole), null);

  const unknownOutlook = JSON.parse(raw);
  unknownOutlook.profiles[0].horizons.MID_3_5Y.outlook = 'WINNER_98';
  assert.equal(parseProfessionalHorizonSnapshot(unknownOutlook), null);

  const missing = JSON.parse(raw);
  delete missing.profiles[2].horizons.LONG_5_10Y;
  assert.equal(parseProfessionalHorizonSnapshot(missing), null);

  const missingSource = JSON.parse(raw);
  missingSource.profiles[1].signpostsUp = [];
  assert.equal(parseProfessionalHorizonSnapshot(missingSource), null);
});

test('PRO-HORIZON-05 source and scenario integrity fail closed', () => {
  const broken = JSON.parse(raw);
  broken.source.repository = 'unknown';
  assert.equal(parseProfessionalHorizonSnapshot(broken), null);

  const wrongMode = JSON.parse(raw);
  wrongMode.forecastMode = 'PRECISE_AI_RANKING';
  assert.equal(parseProfessionalHorizonSnapshot(wrongMode), null);

  const invalidDate = JSON.parse(raw);
  invalidDate.source.observedAt = '2026-02-30';
  assert.equal(parseProfessionalHorizonSnapshot(invalidDate), null);
});

test('PRO-HORIZON-06 old source marked stale, not silently treated as current', () => {
  assert.equal(resolveProfessionalHorizonText(raw, new Date('2026-10-10')).stale, false);
  const old = resolveProfessionalHorizonText(raw, new Date('2027-08-01'));
  assert.equal(old.status, 'ready');
  assert.equal(old.stale, true);
  assert.ok(old.notice);
  assert.equal(resolveProfessionalHorizonText(null).status, 'missing');
  assert.equal(resolveProfessionalHorizonText('broken').status, 'invalid');
});
