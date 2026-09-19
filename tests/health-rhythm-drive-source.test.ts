import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DRIVE_READONLY_SCOPE,
  readRhythmDayFromDriveCore,
  readRhythmWindowFromDriveCore,
  resolveRhythmDriveConfig,
  type RhythmDriveDeps,
  type RhythmDriveEnv,
} from '@/lib/health/rhythm-drive-source-core';
import {
  adaptHaeRhythmSources,
  type HaeRhythmRawFile,
  type NormalizedRhythmDay,
} from '@/lib/health/rhythm-source-adapter';
import { buildRhythmStability } from '@/lib/health/rhythm';

const SLEEP_FOLDER = 'sleep-folder-test-12345';
const RHYTHM_FOLDER = 'rhythm-folder-test-12345';

const PREVIEW_ENV: RhythmDriveEnv = {
  HEALTH_RHYTHM_SOURCE: 'drive',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'reader@example.test',
  GOOGLE_PRIVATE_KEY: 'line1\\nline2',
  GOOGLE_HEALTH_SLEEP_FOLDER_ID: SLEEP_FOLDER,
  GOOGLE_HEALTH_RHYTHM_FOLDER_ID: RHYTHM_FOLDER,
  VERCEL_ENV: 'preview',
};

interface DriveFixture {
  folderId: string;
  fileName: string;
  id: string;
  modifiedTime?: string;
  payload?: unknown;
  rawBody?: string;
  declaredSize?: string;
}

function sleepPayload(day: string): unknown {
  return {
    data: {
      metrics: [
        {
          name: 'sleep_analysis',
          units: 'hr',
          data: [
            {
              date: `${day} 00:00:00 -0300`,
              sleepStart: `${day} 00:10:00 -0300`,
              sleepEnd: `${day} 08:10:00 -0300`,
              source: 'Wearable Test',
            },
          ],
        },
      ],
    },
  };
}

function rhythmPayload(day: string): unknown {
  return {
    data: {
      metrics: [
        {
          name: 'heart_rate',
          units: 'count/min',
          data: [{ date: `${day} 09:00:00 -0300`, Avg: 60, source: 'Wearable Test' }],
        },
        {
          name: 'resting_heart_rate',
          units: 'count/min',
          data: [{ date: `${day} 07:00:00 -0300`, qty: 50, source: 'Wearable Test' }],
        },
        {
          name: 'step_count',
          units: 'count',
          data: [
            { date: `${day} 08:00:00 -0300`, qty: 100, source: 'Phone Test' },
            { date: `${day} 12:00:00 -0300`, qty: 400, source: 'Phone Test' },
            { date: `${day} 18:00:00 -0300`, qty: 500, source: 'Phone Test' },
          ],
        },
      ],
    },
  };
}

function fixturesForDay(day: string, suffix = day): DriveFixture[] {
  return [
    {
      folderId: SLEEP_FOLDER,
      fileName: `HealthSleep-${day}.json`,
      id: `sleep-${suffix}`,
      modifiedTime: '2026-09-19T12:00:00Z',
      payload: sleepPayload(day),
    },
    {
      folderId: RHYTHM_FOLDER,
      fileName: `HealthRhythm-${day}.json`,
      id: `rhythm-${suffix}`,
      modifiedTime: '2026-09-19T12:00:00Z',
      payload: rhythmPayload(day),
    },
  ];
}

function driveFetch(
  fixtures: readonly DriveFixture[],
  calls: Array<{ url: string; method: string }>,
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    calls.push({ url: url.href, method });
    assert.equal(method, 'GET');

    if (url.pathname === '/drive/v3/files') {
      const query = url.searchParams.get('q') ?? '';
      const folder = /'([^']+)' in parents/.exec(query)?.[1] ?? '';
      const fileName = /name = '([^']+)'/.exec(query)?.[1] ?? '';
      const matches = fixtures.filter(
        (fixture) => fixture.folderId === folder && fixture.fileName === fileName,
      );
      return new Response(
        JSON.stringify({
          files: matches.map((fixture) => ({
            id: fixture.id,
            name: fixture.fileName,
            modifiedTime: fixture.modifiedTime ?? '2026-09-19T12:00:00Z',
            size: fixture.declaredSize ?? '512',
          })),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    const mediaMatch = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (mediaMatch && url.searchParams.get('alt') === 'media') {
      const id = decodeURIComponent(mediaMatch[1]);
      const fixture = fixtures.find((item) => item.id === id);
      if (!fixture) return new Response('missing', { status: 404 });
      const body = fixture.rawBody ?? JSON.stringify(fixture.payload);
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': String(new TextEncoder().encode(body).byteLength),
        },
      });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

function depsFor(
  fixtures: readonly DriveFixture[],
  calls: Array<{ url: string; method: string }>,
  tokenCalls: string[],
): RhythmDriveDeps {
  return {
    fetchFn: driveFetch(fixtures, calls),
    getToken: async (_email, _key, scope) => {
      tokenCalls.push(scope);
      return { ok: true, token: 'synthetic-token' };
    },
  };
}

function previousDay(day: string): NormalizedRhythmDay {
  const sleepFile: HaeRhythmRawFile = {
    fileName: `HealthSleep-${day}.json`,
    modifiedAt: '2026-09-19T11:00:00Z',
    payload: sleepPayload(day),
  };
  const rhythmFile: HaeRhythmRawFile = {
    fileName: `HealthRhythm-${day}.json`,
    modifiedAt: '2026-09-19T11:00:00Z',
    payload: rhythmPayload(day),
  };
  return adaptHaeRhythmSources({ sleepFile, rhythmFile });
}

test('RD1. source Drive queda apagada por default y no toca red', async () => {
  let tokenCalls = 0;
  let fetchCalls = 0;
  const result = await readRhythmDayFromDriveCore(
    { date: '2026-09-19', env: {} },
    {
      fetchFn: (async () => {
        fetchCalls += 1;
        return new Response('{}');
      }) as typeof fetch,
      getToken: async () => {
        tokenCalls += 1;
        return { ok: true, token: 'unused' };
      },
    },
  );

  assert.equal(result.status, 'unavailable');
  assert.equal(result.code, 'disabled');
  assert.equal(tokenCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('RD2. Production permanece bloqueado aunque la configuración Drive exista', async () => {
  const config = resolveRhythmDriveConfig({ ...PREVIEW_ENV, VERCEL_ENV: 'production' });
  assert.deepEqual(config, { ok: false, code: 'production-disabled' });

  const result = await readRhythmDayFromDriveCore(
    { date: '2026-09-19', env: { ...PREVIEW_ENV, VERCEL_ENV: 'production' } },
    {
      fetchFn: (async () => {
        throw new Error('network must remain untouched');
      }) as typeof fetch,
      getToken: async () => {
        throw new Error('token must remain untouched');
      },
    },
  );
  assert.equal(result.code, 'production-disabled');
});

test('RD3. Preview usa scope Drive readonly y normaliza ambos archivos sin writes', async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const tokenCalls: string[] = [];
  const result = await readRhythmDayFromDriveCore(
    { date: '2026-09-19', env: PREVIEW_ENV },
    depsFor(fixturesForDay('2026-09-19'), calls, tokenCalls),
  );

  assert.equal(result.status, 'ready');
  assert.equal(result.code, null);
  assert.equal(result.normalized?.sleep?.date, '2026-09-19');
  assert.deepEqual(
    result.normalized?.activity?.hours.map((hour) => hour.hour),
    [8, 12, 18],
  );
  assert.deepEqual(tokenCalls, [DRIVE_READONLY_SCOPE]);
  assert.ok(calls.length >= 4);
  assert.ok(calls.every((call) => call.method === 'GET'));
  assert.ok(
    calls.some((call) => call.url.includes(encodeURIComponent('HealthSleep-2026-09-19.json'))),
  );
});

test('RD4. si falta un canal, el día queda parcial y el faltante no se convierte en cero', async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const tokenCalls: string[] = [];
  const fixtures = fixturesForDay('2026-09-19').filter((item) => item.folderId === SLEEP_FOLDER);
  const result = await readRhythmDayFromDriveCore(
    { date: '2026-09-19', env: PREVIEW_ENV },
    depsFor(fixtures, calls, tokenCalls),
  );

  assert.equal(result.status, 'partial');
  assert.equal(result.files.sleep, 'ready');
  assert.equal(result.files.rhythm, 'missing');
  assert.ok(result.normalized?.sleep);
  assert.equal(result.normalized?.activity, null);
  assert.equal(result.normalized?.availability.activity, 'missing');
});

test('RD5. archivo duplicado en el mismo folder falla cerrado y puede preservar evidencia previa', async () => {
  const day = '2026-09-19';
  const calls: Array<{ url: string; method: string }> = [];
  const tokenCalls: string[] = [];
  const base = fixturesForDay(day);
  const duplicate: DriveFixture = {
    ...base[0],
    id: 'sleep-duplicate-test',
  };
  const previous = previousDay(day);
  const result = await readRhythmDayFromDriveCore(
    { date: day, env: PREVIEW_ENV, previous },
    depsFor([...base, duplicate], calls, tokenCalls),
  );

  assert.equal(result.status, 'preserved');
  assert.equal(result.code, 'ambiguous-file');
  assert.deepEqual(result.normalized, previous);
});

test('RD6. JSON inválido no llega al adapter', async () => {
  const day = '2026-09-19';
  const calls: Array<{ url: string; method: string }> = [];
  const tokenCalls: string[] = [];
  const fixtures = fixturesForDay(day).map((fixture) =>
    fixture.folderId === SLEEP_FOLDER ? { ...fixture, rawBody: '{broken' } : fixture,
  );
  const result = await readRhythmDayFromDriveCore(
    { date: day, env: PREVIEW_ENV },
    depsFor(fixtures, calls, tokenCalls),
  );

  assert.equal(result.status, 'unavailable');
  assert.equal(result.code, 'invalid-json');
  assert.equal(result.normalized, null);
});

test('RD7. payload declarado demasiado grande falla antes de descargarlo', async () => {
  const day = '2026-09-19';
  const calls: Array<{ url: string; method: string }> = [];
  const tokenCalls: string[] = [];
  const fixtures = fixturesForDay(day).map((fixture) =>
    fixture.folderId === SLEEP_FOLDER ? { ...fixture, declaredSize: '9999999' } : fixture,
  );
  const result = await readRhythmDayFromDriveCore(
    { date: day, env: PREVIEW_ENV },
    depsFor(fixtures, calls, tokenCalls),
  );

  assert.equal(result.status, 'unavailable');
  assert.equal(result.code, 'too-large');
  assert.equal(
    calls.some((call) => call.url.includes('/sleep-2026-09-19?')),
    false,
  );
});

test('RD8. si ambos archivos faltan, una feature previa válida puede quedar preservada', async () => {
  const day = '2026-09-19';
  const calls: Array<{ url: string; method: string }> = [];
  const tokenCalls: string[] = [];
  const previous = previousDay(day);
  const result = await readRhythmDayFromDriveCore(
    { date: day, env: PREVIEW_ENV, previous },
    depsFor([], calls, tokenCalls),
  );

  assert.equal(result.status, 'preserved');
  assert.deepEqual(result.normalized, previous);
  assert.equal(result.files.sleep, 'missing');
  assert.equal(result.files.rhythm, 'missing');
});

test('RD9. una ventana de cinco días alimenta al calculador puro sin UI ni persistencia', async () => {
  const dates = ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'];
  const fixtures = dates.flatMap((day, index) => fixturesForDay(day, String(index)));
  const calls: Array<{ url: string; method: string }> = [];
  const tokenCalls: string[] = [];
  const result = await readRhythmWindowFromDriveCore(
    { dates, env: PREVIEW_ENV },
    depsFor(fixtures, calls, tokenCalls),
  );
  const score = buildRhythmStability(result.input);

  assert.equal(result.status, 'ready');
  assert.equal(result.days.length, 5);
  assert.equal(result.input.sleep.length, 5);
  assert.equal(result.input.activity?.length, 5);
  assert.ok(score.score !== null);
  assert.deepEqual(tokenCalls, [DRIVE_READONLY_SCOPE]);
});

test('RD10. fecha inválida y configuración incompleta fallan antes de tocar Google', async () => {
  let networkCalls = 0;
  const deps: RhythmDriveDeps = {
    fetchFn: (async () => {
      networkCalls += 1;
      return new Response('{}');
    }) as typeof fetch,
    getToken: async () => {
      networkCalls += 1;
      return { ok: true, token: 'unused' };
    },
  };

  const invalidDate = await readRhythmDayFromDriveCore(
    { date: '2026-02-31', env: PREVIEW_ENV },
    deps,
  );
  assert.equal(invalidDate.code, 'invalid-date');

  const missingConfig = await readRhythmDayFromDriveCore(
    {
      date: '2026-09-19',
      env: { ...PREVIEW_ENV, GOOGLE_HEALTH_RHYTHM_FOLDER_ID: undefined },
    },
    deps,
  );
  assert.equal(missingConfig.code, 'not-configured');
  assert.equal(networkCalls, 0);
});
