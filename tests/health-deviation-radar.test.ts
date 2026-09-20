import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PERSONAL_DEVIATION_RADAR_VERSION,
  buildPersonalDeviationRadar,
} from '@/lib/health/deviation-radar';
import type { HealthBaselineSignal, HealthPageData, HealthSignalId } from '@/types/domain-pages';

const SIGNAL_IDS: readonly HealthSignalId[] = [
  'sleep',
  'sleepInBed',
  'awakeSleep',
  'deepSleep',
  'remSleep',
  'restingHr',
  'meanHr',
  'minHr',
  'hrv',
  'steps',
  'walkRunKm',
  'floorsClimbed',
  'walkingSpeed',
  'stepLengthCm',
  'walkingAsymmetry',
  'activeCalories',
  'spo2',
];

function stat(value: number | null, mad: number | null, days = 30): HealthBaselineSignal {
  return {
    average: value,
    median: value,
    mad,
    days: value === null ? 0 : days,
  };
}

function signalRecord(
  overrides: Partial<Record<HealthSignalId, HealthBaselineSignal>> = {},
): Record<HealthSignalId, HealthBaselineSignal> {
  return Object.fromEntries(
    SIGNAL_IDS.map((id) => [id, overrides[id] ?? stat(null, null, 0)]),
  ) as Record<HealthSignalId, HealthBaselineSignal>;
}

function values(
  overrides: Partial<Record<HealthSignalId, number | null>> = {},
): Record<HealthSignalId, number | null> {
  return Object.fromEntries(SIGNAL_IDS.map((id) => [id, overrides[id] ?? null])) as Record<
    HealthSignalId,
    number | null
  >;
}

function fakeHealth(options?: {
  sourceAvailable?: boolean;
  baselineDays?: number;
  today?: Partial<Record<HealthSignalId, number | null>>;
  baseline?: Partial<Record<HealthSignalId, HealthBaselineSignal>>;
  recent?: Partial<Record<HealthSignalId, HealthBaselineSignal>>;
}): HealthPageData {
  const baselineDays = options?.baselineDays ?? 30;
  const baseline = signalRecord({
    sleep: stat(7.5, 0.3, baselineDays),
    restingHr: stat(55, 2, baselineDays),
    steps: stat(8000, 800, baselineDays),
    walkingSpeed: stat(5, 0.2, baselineDays),
    stepLengthCm: stat(72, 2, baselineDays),
    walkingAsymmetry: stat(2.5, 0.5, baselineDays),
    ...options?.baseline,
  });
  const recent = signalRecord({
    sleep: stat(7.5, 0.3, 7),
    restingHr: stat(55, 2, 7),
    steps: stat(8000, 800, 7),
    walkingSpeed: stat(5, 0.2, 7),
    stepLengthCm: stat(72, 2, 7),
    walkingAsymmetry: stat(2.5, 0.5, 7),
    ...options?.recent,
  });

  return {
    sourceAvailable: options?.sourceAvailable ?? true,
    signals: {
      today: {
        date: '2026-09-20',
        label: '20 sep',
        importKind: 'complete',
        missingCore: null,
        workout: null,
        values: values({
          sleep: 7.5,
          restingHr: 55,
          ...options?.today,
        }),
      },
      lastInterpretable: null,
      baseline,
      baselineWindowDays: 30,
      baselineCoverageDays: baselineDays,
      recent,
      recentWindowDays: 7,
      recentCoverageDays: 7,
    },
  } as HealthPageData;
}

test('DR1. sin cambios materiales el radar queda usual', () => {
  const radar = buildPersonalDeviationRadar(fakeHealth());

  assert.equal(radar.state, 'ready');
  assert.equal(radar.level, 'usual');
  assert.equal(radar.shiftedClusters, 0);
  assert.equal(radar.comparableClusters, 4);
  assert.equal(radar.calculationVersion, PERSONAL_DEVIATION_RADAR_VERSION);
});

test('DR2. tres dimensiones desviadas producen un cambio multiseñal marcado', () => {
  const radar = buildPersonalDeviationRadar(
    fakeHealth({
      today: { sleep: 5.5, restingHr: 63 },
      recent: {
        sleep: stat(6.2, 0.3, 7),
        restingHr: stat(61, 2, 7),
        steps: stat(4000, 700, 7),
      },
    }),
  );

  assert.equal(radar.level, 'marked');
  assert.ok(radar.shiftedClusters >= 3);
  assert.match(radar.headline, /multiseñal marcado/i);
  assert.ok(
    radar.clusters.flatMap((cluster) => cluster.signals).some((signal) => signal.persistent),
  );
});

test('DR3. HRV ausente no participa ni bloquea el radar', () => {
  const radar = buildPersonalDeviationRadar(
    fakeHealth({
      today: { hrv: null },
      baseline: { hrv: stat(null, null, 0) },
      recent: { hrv: stat(null, null, 0) },
    }),
  );

  const ids: string[] = radar.clusters.flatMap((cluster) =>
    cluster.signals.map((signal) => signal.id),
  );
  assert.equal(ids.includes('hrv'), false);
  assert.equal(radar.state, 'ready');
});

test('DR4. una base menor a 14 días no se presenta como radar personal suficiente', () => {
  const radar = buildPersonalDeviationRadar(fakeHealth({ baselineDays: 6 }));

  assert.equal(radar.state, 'insufficient');
  assert.equal(radar.level, 'insufficient');
  assert.equal(radar.comparableClusters, 0);
  assert.match(radar.detail, /al menos 2/i);
});

test('DR5. un faltante de hoy sigue siendo desconocido y nunca cero', () => {
  const radar = buildPersonalDeviationRadar(fakeHealth({ today: { sleep: null } }));
  const sleep = radar.clusters
    .find((cluster) => cluster.id === 'sleep')
    ?.signals.find((signal) => signal.id === 'sleep');

  assert.ok(sleep);
  assert.equal(sleep.state, 'insufficient');
  assert.equal(sleep.robustDistance, null);
  assert.doesNotMatch(sleep.detail, /0(?:[,.]0)? MAD/i);
});

test('DR6. movilidad evita contar una sola métrica aislada como cambio material del cluster', () => {
  const radar = buildPersonalDeviationRadar(
    fakeHealth({
      recent: {
        walkingSpeed: stat(4, 0.2, 7),
        stepLengthCm: stat(72, 2, 7),
        walkingAsymmetry: stat(2.5, 0.5, 7),
      },
    }),
  );
  const mobility = radar.clusters.find((cluster) => cluster.id === 'mobility');

  assert.ok(mobility);
  assert.equal(mobility.state, 'mild');
});

test('DR7. fuente no disponible falla cerrado', () => {
  const radar = buildPersonalDeviationRadar(fakeHealth({ sourceAvailable: false }));

  assert.equal(radar.state, 'unavailable');
  assert.equal(radar.level, 'insufficient');
  assert.equal(radar.clusters.length, 0);
});
