import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { adaptCalendarEvent, toPlainGoogleEvent } from '@/lib/calendar/adapters';
import { mapCalendarFailure } from '@/lib/calendar/errors';
import { CALENDAR_READONLY_SCOPE } from '@/lib/calendar/constants';
import { buildAgendaData } from '@/lib/calendar/summaries';
import { buildMockCalendarEvents } from '@/lib/mock-data/google-calendar';
import { calendarNoticeFor } from '@/lib/calendar/errors';

const TODAY = '2026-07-20';

test('S1. error con Buffer en cause no cruza la capa Calendar', () => {
  const err = new Error('boom') as Error & { cause: { buffer: Buffer }; status: number };
  err.cause = { buffer: Buffer.from('secret-bytes') };
  err.status = 401;
  const code = mapCalendarFailure(err);
  assert.equal(code, 'auth-error');
  assert.equal(typeof code, 'string');
  assert.doesNotMatch(JSON.stringify({ code }), /secret-bytes/);
});

test('S2. error con ArrayBuffer en response no cruza la capa Calendar', () => {
  const err = {
    status: 403,
    response: { status: 403, data: new ArrayBuffer(32) },
    config: { headers: { Authorization: 'Bearer x' } },
  };
  const code = mapCalendarFailure(err);
  assert.equal(code, 'permission-error');
  const payload = { code, notice: calendarNoticeFor(code) };
  assert.doesNotThrow(() => JSON.stringify(payload));
  assert.doesNotThrow(() => structuredClone(payload));
});

test('S3. ningún objeto de googleapis llega a buildAgendaData', () => {
  const client = readFileSync(join(process.cwd(), 'lib', 'calendar', 'client.ts'), 'utf8');
  const auth = readFileSync(join(process.cwd(), 'lib', 'calendar', 'auth.ts'), 'utf8');
  const queries = readFileSync(join(process.cwd(), 'lib', 'calendar', 'queries.ts'), 'utf8');
  const token = readFileSync(join(process.cwd(), 'lib', 'calendar', 'token.ts'), 'utf8');
  assert.doesNotMatch(client, /from ['"]googleapis['"]/);
  assert.doesNotMatch(auth, /from ['"]googleapis['"]/);
  assert.doesNotMatch(queries, /from ['"]googleapis['"]/);
  assert.doesNotMatch(token, /from ['"]googleapis['"]/);
  assert.match(client, /www\.googleapis\.com\/calendar\/v3/);
  assert.match(client, /events/);
});

test('S4. el resultado final soporta JSON.stringify', () => {
  const events = buildMockCalendarEvents(TODAY);
  const agenda = buildAgendaData({
    events,
    view: 'today',
    today: TODAY,
    source: 'google',
    status: 'ready',
    notice: null,
    calendarIds: ['primary'],
  });
  assert.doesNotThrow(() => JSON.stringify(agenda));
});

test('S5. el resultado final soporta structuredClone', () => {
  const events = buildMockCalendarEvents(TODAY);
  const agenda = buildAgendaData({
    events,
    view: '7',
    today: TODAY,
    source: 'google',
    status: 'ready',
    notice: null,
    calendarIds: ['primary'],
  });
  const cloned = structuredClone(agenda);
  assert.equal(cloned.summary.totalEvents, agenda.summary.totalEvents);
  assert.equal(cloned.timelineToday.length, agenda.timelineToday.length);
});

test('S6. error de autenticación usa fallback plano y no provoca 500', () => {
  const code = mapCalendarFailure({ status: 401 });
  assert.equal(code, 'auth-error');
  const events = buildMockCalendarEvents(TODAY);
  const fallback = buildAgendaData({
    events,
    view: 'today',
    today: TODAY,
    source: 'google',
    status: 'auth-error',
    notice: calendarNoticeFor('auth-error'),
    calendarIds: ['primary'],
  });
  assert.equal(fallback.status, 'auth-error');
  assert.ok(fallback.notice);
  assert.doesNotThrow(() => JSON.stringify(fallback));
  assert.doesNotThrow(() => structuredClone(fallback));
});

test('S7. webpack soportado vía serverExternalPackages', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');
  assert.match(config, /serverExternalPackages/);
  assert.match(config, /googleapis/);
});

test('S8. Turbopack: lectura Calendar no importa googleapis', () => {
  const client = readFileSync(join(process.cwd(), 'lib', 'calendar', 'client.ts'), 'utf8');
  assert.match(client, /\bfetch\b/);
  assert.doesNotMatch(client, /from ['"]googleapis['"]/);
  assert.doesNotMatch(client, /google\.calendar\(/);
  assert.doesNotMatch(client, /new google\.auth\.OAuth2/);
});

test('S9. Calendar real continúa usando solo events.list (REST)', () => {
  const client = readFileSync(join(process.cwd(), 'lib', 'calendar', 'client.ts'), 'utf8');
  assert.match(client, /\/calendars\/.+\/events/);
  assert.match(client, /singleEvents/);
  assert.match(client, /orderBy/);
  assert.doesNotMatch(client, /events\.(insert|update|patch|delete)/);
});

test('S10. scope continúa siendo calendar.events.readonly', () => {
  assert.equal(CALENDAR_READONLY_SCOPE, 'https://www.googleapis.com/auth/calendar.events.readonly');
});

test('S11. ninguna escritura Calendar existe en client/token', () => {
  for (const name of ['client.ts', 'token.ts', 'queries.ts'] as const) {
    const content = readFileSync(join(process.cwd(), 'lib', 'calendar', name), 'utf8');
    assert.doesNotMatch(content, /events\.(insert|update|patch|delete|move|quickAdd)/);
  }
});

test('S12. toPlainGoogleEvent no retiene objetos anidados del SDK', () => {
  const poisoned = {
    id: 'ev-1',
    summary: 'Daily',
    status: 'confirmed',
    transparency: 'opaque',
    location: null,
    recurringEventId: null,
    start: {
      dateTime: `${TODAY}T09:30:00-03:00`,
      date: null,
      timeZone: 'America/Argentina/Cordoba',
    },
    end: { dateTime: `${TODAY}T09:45:00-03:00`, date: null, timeZone: 'America/Argentina/Cordoba' },
    __protoPollution: new ArrayBuffer(8),
    response: { data: new ArrayBuffer(4) },
  };
  const plain = toPlainGoogleEvent(poisoned);
  assert.ok(plain);
  const json = JSON.stringify(plain);
  assert.doesNotMatch(json, /__protoPollution|response/);
  const adapted = adaptCalendarEvent(plain!, 'primary');
  assert.ok(adapted);
  assert.doesNotThrow(() => structuredClone(adapted));
});
