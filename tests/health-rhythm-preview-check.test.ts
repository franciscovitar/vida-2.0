import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  buildRhythmPreviewDates,
  summarizeRhythmPreviewCheck,
} from '@/lib/health/rhythm-preview-check';
import type { RhythmDriveWindowRead } from '@/lib/health/rhythm-drive-source-core';
import type { RhythmStabilityResult } from '@/lib/health/rhythm';

function score(scoreValue: number | null): RhythmStabilityResult {
  return {
    label: 'Rhythm Stability',
    question: 'synthetic',
    score: scoreValue,
    band: scoreValue === null ? 'insufficient' : 'stable',
    confidence: scoreValue === null ? 20 : 80,
    confidenceBand: scoreValue === null ? 'low' : 'high',
    evidenceStrength: 'moderate',
    evidenceSummary: 'synthetic',
    personalPosition: 'synthetic',
    validSleepNights: 0,
    validActivityDays: 0,
    contributors: [],
    uncertainties: [],
    calculationVersion: 'rhythm-stability-v1.0.0',
  };
}

test('RP1. construye una ventana local de siete días sin depender del reloj del servidor', () => {
  assert.deepEqual(buildRhythmPreviewDates('2026-09-19'), [
    '2026-09-13',
    '2026-09-14',
    '2026-09-15',
    '2026-09-16',
    '2026-09-17',
    '2026-09-18',
    '2026-09-19',
  ]);
});

test('RP2. fecha imposible o ventana fuera de límite falla cerrado', () => {
  assert.equal(buildRhythmPreviewDates('2026-02-31'), null);
  assert.equal(buildRhythmPreviewDates('2026-09-19', 0), null);
  assert.equal(buildRhythmPreviewDates('2026-09-19', 15), null);
});

test('RP3. resumen sanitizado expone cobertura y estado, no payloads biométricos', () => {
  const read: RhythmDriveWindowRead = {
    status: 'partial',
    code: null,
    days: [],
    input: { sleep: [], activity: [] },
    reads: [
      {
        date: '2026-09-18',
        status: 'ready',
        normalized: null,
        code: null,
        files: { sleep: 'ready', rhythm: 'ready' },
      },
      {
        date: '2026-09-19',
        status: 'missing',
        normalized: null,
        code: null,
        files: { sleep: 'missing', rhythm: 'missing' },
      },
    ],
  };

  const summary = summarizeRhythmPreviewCheck(read, score(null), 2);
  assert.deepEqual(summary, {
    ok: true,
    sourceStatus: 'partial',
    sourceCode: null,
    daysRequested: 2,
    normalizedDays: 0,
    sleepUsableDays: 0,
    activityUsableDays: 0,
    readyDays: 1,
    partialDays: 0,
    preservedDays: 0,
    missingDays: 1,
    unavailableDays: 0,
    invalidDays: 0,
    scoreState: 'insufficient',
    calculationVersion: 'rhythm-stability-v1.0.0',
  });
  assert.doesNotMatch(
    JSON.stringify(summary),
    /sleepStart|sleepEnd|steps|sourceRegime|fileName|folder/i,
  );
});

test('RP4. endpoint de diagnóstico queda autenticado y exclusivo de Preview', () => {
  const route = readFileSync(
    join(process.cwd(), 'app/api/health/rhythm-preview-check/route.ts'),
    'utf8',
  );
  assert.match(route, /verifySession/);
  assert.match(route, /process\.env\.VERCEL_ENV\s*!==\s*['"]preview['"]/);
  assert.match(route, /readRhythmWindowFromDrive/);
  assert.match(route, /summarizeRhythmPreviewCheck/);
  assert.doesNotMatch(route, /GOOGLE_PRIVATE_KEY|GOOGLE_HEALTH_.*FOLDER_ID|payload|sourceRegime/);
});
