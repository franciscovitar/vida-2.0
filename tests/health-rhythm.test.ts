import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildRhythmStability,
  type RhythmActivityObservation,
  type RhythmSleepObservation,
} from '@/lib/health/rhythm';

function nights(
  starts: readonly string[],
  durationHours = 8,
  startDate = '2026-09-13',
): RhythmSleepObservation[] {
  const base = Date.parse(`${startDate}T12:00:00Z`);
  return starts.map((start, index) => {
    const date = new Date(base + index * 86_400_000).toISOString().slice(0, 10);
    const startEpoch = Date.parse(`${date}T${start}:00-03:00`);
    const endEpoch = startEpoch + durationHours * 3_600_000;
    const localEnd = new Date(endEpoch - 3 * 3_600_000);
    const endDate = localEnd.toISOString().slice(0, 10);
    const endHour = String(localEnd.getUTCHours()).padStart(2, '0');
    const endMinute = String(localEnd.getUTCMinutes()).padStart(2, '0');

    return {
      date,
      sleepStart: `${date}T${start}:00-03:00`,
      sleepEnd: `${endDate}T${endHour}:${endMinute}:00-03:00`,
    };
  });
}

function activity(date: string, shift = 0): RhythmActivityObservation {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, steps: 0 }));
  for (const [hour, steps] of [
    [8 + shift, 500],
    [10 + shift, 1200],
    [13 + shift, 1800],
    [17 + shift, 1000],
  ] as const) {
    if (hour >= 0 && hour <= 23) hours[hour] = { hour, steps };
  }
  return { date, hours };
}

test('RS1. siete noches estables producen score alto y confianza útil', () => {
  const input = nights(['00:10', '00:20', '00:05', '00:15', '00:25', '00:10', '00:20']);
  const result = buildRhythmStability({ sleep: input });

  assert.ok((result.score ?? 0) >= 85);
  assert.equal(result.validSleepNights, 7);
  assert.equal(result.contributors[0].observedPairs, 6);
  assert.ok(result.confidence >= 70);
  assert.equal(result.calculationVersion, 'rhythm-stability-v1.0.0');
});

test('RS2. menos de cinco noches consecutivas no fabrican un score', () => {
  const result = buildRhythmStability({
    sleep: nights(['00:10', '00:15', '00:20', '00:25']),
  });

  assert.equal(result.score, null);
  assert.equal(result.band, 'insufficient');
  assert.ok(result.confidence < 50);
});

test('RS3. el cambio circular alrededor de medianoche no se interpreta como 24 horas', () => {
  const result = buildRhythmStability({
    sleep: nights(['23:50', '00:10', '23:55', '00:05', '23:50', '00:10']),
  });
  const midpoint = result.contributors.find((item) => item.id === 'sleep-midpoint');

  assert.ok(midpoint?.medianDayToDayShiftMinutes !== null);
  assert.ok((midpoint?.medianDayToDayShiftMinutes ?? 999) <= 20);
  assert.ok((result.score ?? 0) >= 80);
});

test('RS4. un outlier aislado no domina la mediana de cambios', () => {
  const result = buildRhythmStability({
    sleep: nights(['00:10', '00:15', '00:20', '04:00', '00:15', '00:20', '00:10', '00:15']),
  });
  const midpoint = result.contributors[0];

  assert.ok((midpoint.medianDayToDayShiftMinutes ?? 999) <= 15);
  assert.ok((midpoint.score ?? 0) >= 90);
});

test('RS5. actividad ausente queda null y no se convierte en cero', () => {
  const result = buildRhythmStability({
    sleep: nights(['00:10', '00:15', '00:20', '00:25', '00:20', '00:15', '00:10']),
  });
  const activityContributor = result.contributors.find(
    (item) => item.id === 'activity-midpoint',
  );

  assert.equal(activityContributor?.score, null);
  assert.equal(result.validActivityDays, 0);
  assert.ok(result.score !== null);
});

test('RS6. ritmo de actividad consistente puede aportar sin dominar el score', () => {
  const sleepRows = nights(['00:10', '00:15', '00:20', '00:25', '00:20', '00:15', '00:10']);
  const activityRows = sleepRows.map((item) => activity(item.date));
  const result = buildRhythmStability({ sleep: sleepRows, activity: activityRows });
  const activityContributor = result.contributors.find(
    (item) => item.id === 'activity-midpoint',
  );

  assert.ok((activityContributor?.score ?? 0) >= 90);
  assert.equal(result.validActivityDays, 7);
  assert.ok(result.confidence >= 80);
});

test('RS7. cambios horarios grandes reducen estabilidad sin etiquetar una causa clínica', () => {
  const result = buildRhythmStability({
    sleep: nights(['22:00', '01:30', '22:30', '02:00', '23:00', '02:30', '22:00']),
  });

  assert.ok((result.score ?? 100) < 70);
  assert.ok(result.uncertainties.some((item) => /no se interpreta/i.test(item)));
});

test('RS8. timestamps sin offset explícito fallan cerrado', () => {
  const rows = nights(['00:10', '00:15', '00:20', '00:25', '00:20']);
  rows[0] = { ...rows[0], sleepStart: '2026-09-13T00:10:00' };
  const result = buildRhythmStability({ sleep: rows });

  assert.equal(result.score, null);
  assert.equal(result.validSleepNights, 4);
});
