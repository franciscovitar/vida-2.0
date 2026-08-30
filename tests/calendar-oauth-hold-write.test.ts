/**
 * Modo OAuth local opt-in para Calendar Hold.
 * `readonly` sigue siendo el default; `hold-write` solo existe mediante el
 * literal exacto en GOOGLE_CALENDAR_OAUTH_MODE, resuelto server-side.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  CALENDAR_CALENDARS_READONLY_SCOPE,
  CALENDAR_EVENTS_OWNED_SCOPE,
  CALENDAR_HOLD_WRITE_SCOPES,
  CALENDAR_OAUTH_HOLD_WRITE_MODE,
  CALENDAR_READONLY_SCOPE,
} from '@/lib/calendar/constants';
import {
  buildCalendarConsentUrl,
  calendarScopesForMode,
  resolveCalendarOAuthMode,
} from '@/lib/calendar/oauth-flow';
import { LOGIN_GOOGLE_SCOPES } from '@/lib/auth/authorize';

const FORBIDDEN_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.acls',
  'https://www.googleapis.com/auth/calendar.acls.readonly',
  'https://www.googleapis.com/auth/calendar.calendars',
  'https://www.googleapis.com/auth/calendar.calendarlist',
  'https://www.googleapis.com/auth/calendar.settings.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/contacts',
] as const;

function scopeSet(url: string): Set<string> {
  const raw = new URL(url).searchParams.get('scope') ?? '';
  return new Set(raw.split(' ').filter(Boolean));
}

const BASE = {
  clientId: 'client.apps.googleusercontent.com',
  redirectUri: 'http://localhost:3000/api/calendar/oauth/callback',
  state: 'state-value',
} as const;

test('HW1. modo ausente/undefined => solo calendar.events.readonly', () => {
  assert.equal(resolveCalendarOAuthMode(undefined), 'readonly');
  assert.equal(resolveCalendarOAuthMode(null), 'readonly');
  assert.equal(resolveCalendarOAuthMode(''), 'readonly');
  assert.deepEqual(calendarScopesForMode('readonly'), [CALENDAR_READONLY_SCOPE]);

  const url = buildCalendarConsentUrl(BASE);
  assert.deepEqual([...scopeSet(url)], [CALENDAR_READONLY_SCOPE]);

  const undefinedModeUrl = buildCalendarConsentUrl({ ...BASE, mode: undefined });
  assert.deepEqual([...scopeSet(undefinedModeUrl)], [CALENDAR_READONLY_SCOPE]);
});

test('HW2. valor inválido o typo => solo readonly', () => {
  for (const value of [
    'write',
    'hold_write',
    'holdwrite',
    'HOLD-WRITE',
    'hold-write ',
    ' hold-write',
    'true',
    'calendar',
  ]) {
    assert.equal(resolveCalendarOAuthMode(value), 'readonly', value);
    const url = buildCalendarConsentUrl({ ...BASE, mode: resolveCalendarOAuthMode(value) });
    assert.deepEqual([...scopeSet(url)], [CALENDAR_READONLY_SCOPE], value);
  }
});

test('HW3. hold-write => exactamente los tres scopes autorizados', () => {
  assert.equal(resolveCalendarOAuthMode(CALENDAR_OAUTH_HOLD_WRITE_MODE), 'hold-write');
  assert.equal(CALENDAR_OAUTH_HOLD_WRITE_MODE, 'hold-write');

  const expected = [
    CALENDAR_READONLY_SCOPE,
    CALENDAR_EVENTS_OWNED_SCOPE,
    CALENDAR_CALENDARS_READONLY_SCOPE,
  ];
  assert.deepEqual([...CALENDAR_HOLD_WRITE_SCOPES], expected);
  assert.deepEqual(calendarScopesForMode('hold-write'), CALENDAR_HOLD_WRITE_SCOPES);

  assert.equal(
    CALENDAR_EVENTS_OWNED_SCOPE,
    'https://www.googleapis.com/auth/calendar.events.owned',
  );
  assert.equal(
    CALENDAR_CALENDARS_READONLY_SCOPE,
    'https://www.googleapis.com/auth/calendar.calendars.readonly',
  );

  const url = buildCalendarConsentUrl({ ...BASE, mode: 'hold-write' });
  assert.deepEqual([...scopeSet(url)].sort(), [...expected].sort());
  assert.equal(scopeSet(url).size, 3);
});

test('HW4. hold-write no contiene ningún scope prohibido', () => {
  const url = buildCalendarConsentUrl({ ...BASE, mode: 'hold-write' });
  const scopes = scopeSet(url);
  for (const forbidden of FORBIDDEN_SCOPES) {
    assert.equal(scopes.has(forbidden), false, forbidden);
  }
  // El scope general y el amplio de eventos nunca aparecen como token exacto.
  assert.equal(scopes.has('https://www.googleapis.com/auth/calendar'), false);
  assert.equal(scopes.has('https://www.googleapis.com/auth/calendar.events'), false);
  assert.doesNotMatch(url, /calendar\.acls/);
  assert.doesNotMatch(url, /calendarlist/);
  assert.doesNotMatch(url, /gmail|drive|contacts/i);
});

test('HW5-8. hold-write conserva los parámetros OAuth seguros', () => {
  const url = buildCalendarConsentUrl({ ...BASE, mode: 'hold-write' });
  const params = new URL(url).searchParams;
  assert.equal(params.get('access_type'), 'offline');
  assert.equal(params.get('prompt'), 'consent');
  assert.equal(params.get('response_type'), 'code');
  assert.equal(params.has('include_granted_scopes'), false);
  assert.equal(params.get('state'), BASE.state);
});

test('HW9. el modo no puede venir de query params en la ruta start', () => {
  const startSrc = readFileSync(
    join(process.cwd(), 'app/api/calendar/oauth/start/route.ts'),
    'utf8',
  );
  assert.match(startSrc, /resolveCalendarOAuthMode\(process\.env\.GOOGLE_CALENDAR_OAUTH_MODE\)/);
  assert.doesNotMatch(startSrc, /searchParams\.get\(\s*['"]mode['"]/);
  assert.doesNotMatch(startSrc, /nextUrl[\s\S]*?mode/);
  assert.doesNotMatch(startSrc, /request[\s\S]*?['"]mode['"]/);
  // El helper no acepta un array arbitrario de scopes.
  const flowSrc = readFileSync(join(process.cwd(), 'lib/calendar/oauth-flow.ts'), 'utf8');
  assert.doesNotMatch(flowSrc, /scopes\??:\s*(readonly\s*)?string\[\]/);
});

test('HW10. start conserva verifySession + guard localhost y no-store', () => {
  const startSrc = readFileSync(
    join(process.cwd(), 'app/api/calendar/oauth/start/route.ts'),
    'utf8',
  );
  assert.match(startSrc, /verifySession/);
  assert.match(startSrc, /isCalendarOAuthAllowed/);
  assert.match(startSrc, /vercel: process\.env\.VERCEL/);
  assert.match(startSrc, /runtime = 'nodejs'/);
  assert.match(startSrc, /NO_STORE_HEADERS/);
  assert.match(startSrc, /CALENDAR_OAUTH_STATE_COOKIE/);
});

test('HW11. el login principal sigue sin scopes de Calendar', () => {
  assert.equal(LOGIN_GOOGLE_SCOPES, 'openid email profile');
  assert.doesNotMatch(LOGIN_GOOGLE_SCOPES, /calendar/i);
  const authTs = readFileSync(join(process.cwd(), 'auth.ts'), 'utf8');
  assert.doesNotMatch(authTs, /calendar\.events|calendar\.calendars|GOOGLE_CALENDAR_/);
  assert.doesNotMatch(authTs, /GOOGLE_CALENDAR_OAUTH_MODE/);
  assert.doesNotMatch(authTs, /access_type\s*[:=]\s*['"]offline['"]/);
});

test('HW12. callback sin cambios de persistencia/log del refresh token', () => {
  const callbackSrc = readFileSync(
    join(process.cwd(), 'app/api/calendar/oauth/callback/route.ts'),
    'utf8',
  );
  assert.doesNotMatch(callbackSrc, /console\.(log|info|debug|error|warn)\([^)]*token/i);
  assert.doesNotMatch(callbackSrc, /writeFile|writeFileSync|appendFile/);
  assert.doesNotMatch(callbackSrc, /GOOGLE_CALENDAR_OAUTH_MODE/);
  assert.doesNotMatch(callbackSrc, /calendarScopesForMode|CALENDAR_HOLD_WRITE_SCOPES/);
  assert.match(callbackSrc, /buildOAuthSuccessHtml\(exchanged\.refreshToken\)/);
});

test('HW13. el modo no amplía la superficie de secretos hacia el cliente', () => {
  // constants.ts no es server-only: solo debe contener URLs de scope y literales inertes.
  const constantsSrc = readFileSync(join(process.cwd(), 'lib/calendar/constants.ts'), 'utf8');
  assert.doesNotMatch(constantsSrc, /import ['"]server-only['"]/);
  assert.doesNotMatch(constantsSrc, /client_secret|GOCSPX-|ya29\.|process\.env/i);
  for (const scope of CALENDAR_HOLD_WRITE_SCOPES) {
    assert.match(scope, /^https:\/\/www\.googleapis\.com\/auth\/calendar\.[a-z.]+$/);
  }
  // El intercambio de código nunca envía el scope y no cambia por este trabajo.
  const exchangeSrc = readFileSync(join(process.cwd(), 'lib/calendar/oauth-exchange.ts'), 'utf8');
  assert.doesNotMatch(exchangeSrc, /scope/i);
  assert.doesNotMatch(exchangeSrc, /GOOGLE_CALENDAR_OAUTH_MODE/);
});

test('HW14. el runtime de Calendar Hold no cambia', () => {
  for (const rel of ['lib/actions/calendar-hold.ts', 'lib/actions/calendar-hold-google.ts']) {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    assert.doesNotMatch(src, /calendar\.events\.owned|calendar\.calendars\.readonly/);
    assert.doesNotMatch(src, /GOOGLE_CALENDAR_OAUTH_MODE|hold-write/);
    assert.doesNotMatch(src, /oauth-flow|calendarScopesForMode|resolveCalendarOAuthMode/);
  }
});

test('HW15. WRITE_ACTIONS_ENABLED no habilita por sí mismo el OAuth write', () => {
  const flowSrc = readFileSync(join(process.cwd(), 'lib/calendar/oauth-flow.ts'), 'utf8');
  const startSrc = readFileSync(
    join(process.cwd(), 'app/api/calendar/oauth/start/route.ts'),
    'utf8',
  );
  for (const src of [flowSrc, startSrc]) {
    assert.doesNotMatch(src, /WRITE_ACTIONS_ENABLED/);
    assert.doesNotMatch(src, /GOOGLE_CALENDAR_WRITE_ID/);
    assert.doesNotMatch(src, /VERCEL_ENV|process\.env\.NODE_ENV[\s\S]*?hold-write/);
  }
  // Aunque otras flags estén activas, la resolución del modo solo mira su literal.
  assert.equal(resolveCalendarOAuthMode('true'), 'readonly');
  assert.equal(resolveCalendarOAuthMode('1'), 'readonly');
  assert.equal(resolveCalendarOAuthMode('enabled'), 'readonly');
});

test('HW16. .env.example documenta el modo sin activarlo', () => {
  const example = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
  assert.match(example, /^GOOGLE_CALENDAR_OAUTH_MODE=$/m);
  assert.match(example, /hold-write/);
  assert.match(example, /readonly \(default seguro\)/);
});
