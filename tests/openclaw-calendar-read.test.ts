import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { parseAgendaView, buildAgendaData } from '@/lib/calendar/summaries';
import { buildMockCalendarEvents } from '@/lib/mock-data/google-calendar';

const calendarSourcePath = path.join(process.cwd(), 'lib/data/calendar-source.ts');
const readsPath = path.join(process.cwd(), 'lib/openclaw/reads.ts');

test('openclaw calendar: separa contratos web y server-to-server', () => {
  const source = readFileSync(calendarSourcePath, 'utf8');

  assert.match(source, /export const getCalendarAgenda = cache/);
  assert.match(
    source,
    /export const getCalendarAgenda = cache\(async[\s\S]*?requireAuthorizedSession/,
  );
  assert.match(source, /export const getCalendarAgendaForTrustedService = cache/);
  assert.equal(source.includes('export async function loadAgendaUncached'), false);
  assert.equal(source.includes('export { loadAgendaUncached'), false);

  const trustedStart = source.indexOf('getCalendarAgendaForTrustedService');
  const trustedBlock = source.slice(trustedStart, trustedStart + 500);
  assert.equal(trustedBlock.includes('requireAuthorizedSession'), false);
  assert.match(trustedBlock, /parseAgendaView/);
  assert.match(trustedBlock, /loadAgendaUncached/);
  assert.match(source, /No usar desde páginas web/);
});

test('openclaw calendar: reads usa el lector trusted en las tres operaciones', () => {
  const source = readFileSync(readsPath, 'utf8');

  assert.match(source, /getCalendarAgendaForTrustedService/);
  assert.equal(/getCalendarAgenda(?!ForTrustedService)/.test(source), false);
  assert.equal(source.includes('requireAuthorizedSession'), false);
  assert.equal(source.includes('@/lib/auth/dal'), false);
  assert.equal(/@\/lib\/auth\//.test(source), false);

  assert.ok((source.match(/getCalendarAgendaForTrustedService/g) ?? []).length >= 4);
  assert.match(
    source,
    /operation === 'system\.overview'[\s\S]*?getCalendarAgendaForTrustedService/,
  );
  assert.match(source, /operation === 'areas\.get'[\s\S]*?getCalendarAgendaForTrustedService/);
  assert.match(
    source,
    /operation === 'calendar\.upcoming'[\s\S]*?getCalendarAgendaForTrustedService/,
  );
});

test('openclaw calendar: vista inválida se normaliza; mock agenda sin sesión es viable', () => {
  assert.equal(parseAgendaView('nope'), 'today');
  assert.equal(parseAgendaView('7'), '7');
  assert.equal(parseAgendaView(null), 'today');

  // Misma ruta mock que loadAgendaUncached (sin cookies ni sesión).
  const today = '2026-07-26';
  const events = buildMockCalendarEvents(today, 'primary');
  const agenda = buildAgendaData({
    events,
    view: parseAgendaView('7'),
    today,
    source: 'mock',
    status: 'mock',
    notice: null,
    calendarCount: 1,
    timezone: 'America/Argentina/Buenos_Aires',
  });

  assert.equal(agenda.source, 'mock');
  assert.equal(agenda.view, '7');
  assert.ok(Array.isArray(agenda.days));

  const json = JSON.stringify(agenda);
  for (const forbidden of [
    'attendees',
    'organizer',
    'conferenceData',
    'hangoutLink',
    'htmlLink',
    'accessToken',
    'refreshToken',
  ]) {
    assert.equal(json.includes(forbidden), false, forbidden);
  }
});

test('openclaw calendar: DTO de reads no proyecta campos sensibles', () => {
  const source = readFileSync(readsPath, 'utf8');
  const calendarMap = source.slice(
    source.indexOf("operation === 'calendar.upcoming'"),
    source.indexOf("operation === 'gym.summary'"),
  );

  for (const forbidden of [
    'attendees',
    'organizer',
    'conferenceData',
    'hangoutLink',
    'htmlLink',
    'description',
    'email',
  ]) {
    assert.equal(calendarMap.includes(forbidden), false, forbidden);
  }
  assert.match(calendarMap, /opaqueKey\('cal'/);
});

test('openclaw calendar: /agenda sigue usando el wrapper con sesión', () => {
  const agendaPage = readFileSync(path.join(process.cwd(), 'app/(app)/agenda/page.tsx'), 'utf8');
  assert.match(agendaPage, /getCalendarAgenda/);
  assert.equal(agendaPage.includes('getCalendarAgendaForTrustedService'), false);

  const webWrapper = readFileSync(calendarSourcePath, 'utf8');
  const webStart = webWrapper.indexOf('export const getCalendarAgenda = cache');
  const trustedStart = webWrapper.indexOf('export const getCalendarAgendaForTrustedService');
  const webBlock = webWrapper.slice(webStart, trustedStart);
  assert.match(webBlock, /requireAuthorizedSession/);
});
