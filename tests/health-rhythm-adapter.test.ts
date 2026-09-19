import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  adaptHaeRhythmSources,
  toRhythmStabilityInput,
  type HaeRhythmRawFile,
  type NormalizedRhythmDay,
} from '@/lib/health/rhythm-source-adapter';
import { buildRhythmStability } from '@/lib/health/rhythm';

function sleepFile(
  day: string,
  options: {
    fileDay?: string;
    payloadDate?: string;
    start?: string | null;
    end?: string | null;
    source?: string;
    units?: string;
    includeMetric?: boolean;
    modifiedAt?: string;
  } = {},
): HaeRhythmRawFile {
  const fileDay = options.fileDay ?? day;
  const payloadDate = options.payloadDate ?? `${day} 00:00:00 -0300`;
  const start = options.start === undefined ? `${day} 00:10:00 -0300` : options.start;
  const end = options.end === undefined ? `${day} 08:10:00 -0300` : options.end;
  return {
    fileName: `HealthSleep-${fileDay}.json`,
    modifiedAt: options.modifiedAt ?? '2026-01-20T10:00:00Z',
    payload: {
      data: {
        metrics:
          options.includeMetric === false
            ? []
            : [
                {
                  name: 'sleep_analysis',
                  units: options.units ?? 'hr',
                  data: [
                    {
                      date: payloadDate,
                      sleepStart: start,
                      sleepEnd: end,
                      source: options.source ?? 'Wearable A',
                    },
                  ],
                },
              ],
      },
    },
  };
}

function rhythmFile(
  day: string,
  options: {
    fileDay?: string;
    stepUnits?: string;
    stepRows?: Array<{ date: string; qty: number; source?: string }>;
    includeSteps?: boolean;
    includeHeartRate?: boolean;
    includeRestingHeartRate?: boolean;
    includeHrv?: boolean;
    modifiedAt?: string;
  } = {},
): HaeRhythmRawFile {
  const metrics: unknown[] = [];
  if (options.includeHeartRate !== false) {
    metrics.push({
      name: 'heart_rate',
      units: 'count/min',
      data: [{ date: `${day} 09:00:00 -0300`, Avg: 60, source: 'Wearable A' }],
    });
  }
  if (options.includeRestingHeartRate !== false) {
    metrics.push({
      name: 'resting_heart_rate',
      units: 'count/min',
      data: [{ date: `${day} 07:00:00 -0300`, qty: 50, source: 'Wearable A' }],
    });
  }
  if (options.includeSteps !== false) {
    metrics.push({
      name: 'step_count',
      units: options.stepUnits ?? 'count',
      data: options.stepRows ?? [
        { date: `${day} 08:00:00 -0300`, qty: 100, source: 'Phone A|Wearable A' },
        { date: `${day} 11:00:00 -0300`, qty: 400, source: 'Phone A|Wearable A' },
        { date: `${day} 15:00:00 -0300`, qty: 300, source: 'Phone A|Wearable A' },
        { date: `${day} 19:00:00 -0300`, qty: 200, source: 'Phone A|Wearable A' },
      ],
    });
  }
  if (options.includeHrv) {
    metrics.push({
      name: 'heart_rate_variability',
      units: 'ms',
      data: [{ date: `${day} 07:00:00 -0300`, qty: 40, source: 'Wearable A' }],
    });
  }
  return {
    fileName: `HealthRhythm-${options.fileDay ?? day}.json`,
    modifiedAt: options.modifiedAt ?? '2026-01-20T10:00:00Z',
    payload: { data: { metrics } },
  };
}

function adapted(day: string, modifiedAt = '2026-01-20T10:00:00Z'): NormalizedRhythmDay {
  return adaptHaeRhythmSources({
    sleepFile: sleepFile(day, { modifiedAt }),
    rhythmFile: rhythmFile(day, { modifiedAt }),
  });
}

test('RA1. sleep JSON válido produce una observación normalizada', () => {
  const result = adaptHaeRhythmSources({ sleepFile: sleepFile('2026-01-10') });
  assert.equal(result.date, '2026-01-10');
  assert.deepEqual(result.sleep, {
    date: '2026-01-10',
    sleepStart: '2026-01-10 00:10:00 -0300',
    sleepEnd: '2026-01-10 08:10:00 -0300',
  });
  assert.equal(result.availability.sleepTiming, 'available');
});

test('RA2. acepta date como día simple además de timestamp con offset', () => {
  const simple = adaptHaeRhythmSources({
    sleepFile: sleepFile('2026-01-10', { payloadDate: '2026-01-10' }),
  });
  const timestamp = adaptHaeRhythmSources({ sleepFile: sleepFile('2026-01-10') });
  assert.equal(simple.sleep?.date, '2026-01-10');
  assert.equal(timestamp.sleep?.date, '2026-01-10');
});

test('RA3. mismatch filename/payload date falla cerrado', () => {
  const result = adaptHaeRhythmSources({
    sleepFile: sleepFile('2026-01-10', { payloadDate: '2026-01-11 00:00:00 -0300' }),
  });
  assert.equal(result.sleep, null);
  assert.equal(result.availability.sleepTiming, 'invalid');
  assert.ok(result.diagnostics.some((item) => item.code === 'payload-date-mismatch'));
});

test('RA4. sleepStart/sleepEnd sin offset no generan timing utilizable', () => {
  const result = adaptHaeRhythmSources({
    sleepFile: sleepFile('2026-01-10', {
      start: '2026-01-10 00:10:00',
      end: '2026-01-10 08:10:00',
    }),
  });
  assert.equal(result.sleep, null);
  assert.equal(result.availability.sleepTiming, 'invalid');
  assert.ok(result.diagnostics.some((item) => item.code === 'invalid-timestamp'));
});

test('RA5. falta de sleep_analysis permanece missing y nunca cero', () => {
  const result = adaptHaeRhythmSources({
    sleepFile: sleepFile('2026-01-10', { includeMetric: false }),
  });
  assert.equal(result.sleep, null);
  assert.equal(result.availability.sleepTiming, 'missing');
});

test('RA6. step_count horario válido produce activity sin inventar horas', () => {
  const result = adaptHaeRhythmSources({ rhythmFile: rhythmFile('2026-01-10') });
  assert.deepEqual(
    result.activity?.hours.map((item) => item.hour),
    [8, 11, 15, 19],
  );
  assert.equal(result.activity?.hours.length, 4);
  assert.equal(result.availability.activity, 'available');
});

test('RA7. horas ausentes permanecen ausentes', () => {
  const result = adaptHaeRhythmSources({
    rhythmFile: rhythmFile('2026-01-10', {
      stepRows: [
        { date: '2026-01-10 09:00:00 -0300', qty: 10 },
        { date: '2026-01-10 18:00:00 -0300', qty: 20 },
      ],
    }),
  });
  assert.deepEqual(
    result.activity?.hours.map((item) => item.hour),
    [9, 18],
  );
});

test('RA8. duplicado ambiguo de una hora no se suma silenciosamente', () => {
  const result = adaptHaeRhythmSources({
    rhythmFile: rhythmFile('2026-01-10', {
      stepRows: [
        { date: '2026-01-10 09:00:00 -0300', qty: 100, source: 'Phone A' },
        { date: '2026-01-10 09:00:00 -0300', qty: 200, source: 'Wearable A' },
        { date: '2026-01-10 12:00:00 -0300', qty: 50, source: 'Phone A' },
      ],
    }),
  });
  assert.deepEqual(
    result.activity?.hours.map((item) => item.hour),
    [12],
  );
  assert.ok(result.diagnostics.some((item) => item.code === 'ambiguous-activity-hour'));
});

test('RA9. unidad inválida de steps no se acepta', () => {
  const result = adaptHaeRhythmSources({
    rhythmFile: rhythmFile('2026-01-10', { stepUnits: 'km' }),
  });
  assert.equal(result.activity, null);
  assert.equal(result.availability.activity, 'invalid');
  assert.ok(result.diagnostics.some((item) => item.code === 'invalid-units'));
});

test('RA10. source strings se preservan como provenance sin preferred source', () => {
  const result = adapted('2026-01-10');
  assert.deepEqual(result.sourceRegime.sleepSources, ['Wearable A']);
  assert.deepEqual(result.sourceRegime.activitySources, ['Phone A|Wearable A']);
});

test('RA11. HRV ausente queda unavailable/missing', () => {
  const result = adaptHaeRhythmSources({ rhythmFile: rhythmFile('2026-01-10') });
  assert.equal(result.availability.hrv, 'missing');
  assert.deepEqual(result.sourceRegime.hrvSources, []);
});

test('RA12. snapshot nuevo incompleto preserva features previas válidas', () => {
  const previous = adapted('2026-01-10', '2026-01-20T10:00:00Z');
  const current = adaptHaeRhythmSources({
    previous,
    sleepFile: sleepFile('2026-01-10', {
      includeMetric: false,
      modifiedAt: '2026-01-20T11:00:00Z',
    }),
    rhythmFile: rhythmFile('2026-01-10', {
      stepRows: [],
      modifiedAt: '2026-01-20T11:00:00Z',
    }),
  });
  assert.deepEqual(current.sleep, previous.sleep);
  assert.deepEqual(current.activity, previous.activity);
  assert.equal(current.preservedFromPrevious.sleep, true);
  assert.equal(current.preservedFromPrevious.activity, true);
  assert.ok(current.diagnostics.some((item) => item.code === 'previous-evidence-preserved'));
});

test('RA13. revisión más vieja no pisa una más nueva', () => {
  const previous = adapted('2026-01-10', '2026-01-20T11:00:00Z');
  const current = adaptHaeRhythmSources({
    previous,
    sleepFile: sleepFile('2026-01-10', {
      start: '2026-01-10 03:00:00 -0300',
      end: '2026-01-10 11:00:00 -0300',
      modifiedAt: '2026-01-20T10:00:00Z',
    }),
    rhythmFile: rhythmFile('2026-01-10', {
      stepRows: [{ date: '2026-01-10 22:00:00 -0300', qty: 900 }],
      modifiedAt: '2026-01-20T10:00:00Z',
    }),
  });
  assert.deepEqual(current.sleep, previous.sleep);
  assert.deepEqual(current.activity, previous.activity);
  assert.equal(current.sourceVersions.sleep?.modifiedAt, '2026-01-20T11:00:00Z');
  assert.equal(current.sourceVersions.rhythm?.modifiedAt, '2026-01-20T11:00:00Z');
  assert.ok(current.diagnostics.some((item) => item.code === 'older-source-skipped'));
});

test('RA14. archivos de días distintos fallan cerrado como conjunto', () => {
  const result = adaptHaeRhythmSources({
    sleepFile: sleepFile('2026-01-10'),
    rhythmFile: rhythmFile('2026-01-11'),
  });
  assert.equal(result.date, null);
  assert.equal(result.sleep, null);
  assert.equal(result.activity, null);
  assert.ok(result.diagnostics.some((item) => item.code === 'file-date-conflict'));
});

test('RA15. adapter alimenta al calculador puro con varios días sintéticos', () => {
  const days = ['2026-01-10', '2026-01-11', '2026-01-12', '2026-01-13', '2026-01-14'].map(
    (day, index) =>
      adaptHaeRhythmSources({
        sleepFile: sleepFile(day, {
          start: `${day} 00:${String(10 + index * 2).padStart(2, '0')}:00 -0300`,
          end: `${day} 08:${String(10 + index * 2).padStart(2, '0')}:00 -0300`,
        }),
        rhythmFile: rhythmFile(day),
      }),
  );
  const input = toRhythmStabilityInput(days);
  const result = buildRhythmStability(input);
  assert.equal(input.sleep.length, 5);
  assert.equal(input.activity?.length, 5);
  assert.ok((result.score ?? 0) >= 85);
});
