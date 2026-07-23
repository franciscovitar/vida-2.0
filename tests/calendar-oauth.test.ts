import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  resolveCalendarDataSource,
  resolveCalendarOAuthSetupConfig,
} from '@/lib/calendar/config-resolve';
import { CALENDAR_READONLY_SCOPE } from '@/lib/calendar/constants';
import { buildMockCalendarEvents } from '@/lib/mock-data/google-calendar';
import {
  buildCalendarConsentUrl,
  buildOAuthErrorHtml,
  buildOAuthSuccessHtml,
  calendarOAuthStateCookieOptions,
  CALENDAR_OAUTH_STATE_COOKIE,
  generateOAuthState,
  isCalendarOAuthAllowed,
  noRefreshTokenMessage,
  oauthErrorPageMessage,
  resetConsumedAuthorizationCodes,
  timingSafeEqualString,
  validateOAuthCallback,
} from '@/lib/calendar/oauth-flow';
import { getDataSource } from '@/lib/data/config';
import { getNotionDataSource } from '@/lib/notion/config';
import { buildAgendaData } from '@/lib/calendar/summaries';

test('O1. start falla seguro sin configuración', () => {
  const keys = [
    'GOOGLE_CALENDAR_CLIENT_ID',
    'GOOGLE_CALENDAR_CLIENT_SECRET',
    'GOOGLE_CALENDAR_REDIRECT_URI',
  ] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    const setup = resolveCalendarOAuthSetupConfig(process.env);
    // Sin redirect env usa default; sin client id/secret → not-configured.
    assert.equal(setup.ok, false);
    if (!setup.ok) assert.equal(setup.reason, 'not-configured');
    assert.match(oauthErrorPageMessage('not-configured'), /CLIENT_ID|CLIENT_SECRET|REDIRECT/i);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test('O2. start usa únicamente el scope readonly', () => {
  const url = buildCalendarConsentUrl({
    clientId: 'client.apps.googleusercontent.com',
    redirectUri: 'http://localhost:3000/api/calendar/oauth/callback',
    state: 'abc',
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('scope'), CALENDAR_READONLY_SCOPE);
  assert.equal(parsed.searchParams.has('include_granted_scopes'), false);
  assert.doesNotMatch(url, /calendar\.readonly(?!\.)|calendar\.events(?!\.readonly)/);
});

test('O3. access_type es offline', () => {
  const url = buildCalendarConsentUrl({
    clientId: 'client',
    redirectUri: 'http://localhost:3000/api/calendar/oauth/callback',
    state: 's',
  });
  assert.equal(new URL(url).searchParams.get('access_type'), 'offline');
});

test('O4. prompt es consent', () => {
  const url = buildCalendarConsentUrl({
    clientId: 'client',
    redirectUri: 'http://localhost:3000/api/calendar/oauth/callback',
    state: 's',
  });
  assert.equal(new URL(url).searchParams.get('prompt'), 'consent');
  assert.equal(new URL(url).searchParams.get('response_type'), 'code');
});

test('O5. state se genera y guarda (opciones de cookie)', () => {
  const state = generateOAuthState();
  assert.ok(state.length >= 32);
  assert.notEqual(state, generateOAuthState());
  const options = calendarOAuthStateCookieOptions();
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.secure, false);
  assert.ok((options.maxAge ?? 0) > 0);
  assert.equal(options.path, '/api/calendar/oauth');
  assert.equal(CALENDAR_OAUTH_STATE_COOKIE, 'vida_cal_oauth_state');
});

test('O6. callback rechaza state incorrecto', () => {
  resetConsumedAuthorizationCodes();
  const result = validateOAuthCallback({
    code: 'code-1',
    state: 'state-a',
    cookieState: 'state-b',
    googleError: null,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'state-mismatch');
  assert.equal(timingSafeEqualString('same', 'same'), true);
  assert.equal(timingSafeEqualString('same', 'diff'), false);
});

test('O7. callback rechaza code ausente', () => {
  resetConsumedAuthorizationCodes();
  const result = validateOAuthCallback({
    code: null,
    state: 's',
    cookieState: 's',
    googleError: null,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'missing-code');
});

test('O8. callback no registra tokens', () => {
  const files = [
    join(process.cwd(), 'app', 'api', 'calendar', 'oauth', 'start', 'route.ts'),
    join(process.cwd(), 'app', 'api', 'calendar', 'oauth', 'callback', 'route.ts'),
    join(process.cwd(), 'lib', 'calendar', 'oauth-exchange.ts'),
    join(process.cwd(), 'lib', 'calendar', 'oauth-flow.ts'),
  ];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    assert.doesNotMatch(content, /console\.(log|info|debug|error|warn)\([^)]*token/i);
    assert.doesNotMatch(content, /console\.(log|info|debug|error|warn)\([^)]*secret/i);
    assert.doesNotMatch(content, /fs\.writeFile|writeFileSync|appendFile/);
  }
});

test('O9. callback exige refresh_token', () => {
  const exchange = readFileSync(
    join(process.cwd(), 'lib', 'calendar', 'oauth-exchange.ts'),
    'utf8',
  );
  assert.match(exchange, /no-refresh-token/);
  assert.match(exchange, /refresh_token/);
  assert.doesNotMatch(exchange, /return \{ ok: true[^}]*access_token/);
  assert.doesNotMatch(exchange, /from ['"]googleapis['"]/);
  assert.match(noRefreshTokenMessage(), /prompt=consent/);
  const callback = readFileSync(
    join(process.cwd(), 'app', 'api', 'calendar', 'oauth', 'callback', 'route.ts'),
    'utf8',
  );
  assert.match(callback, /no-refresh-token/);
  assert.match(callback, /buildOAuthSuccessHtml\(exchanged\.refreshToken\)/);
});

test('O10. rutas rechazadas en producción', () => {
  assert.equal(isCalendarOAuthAllowed({ nodeEnv: 'production', host: 'localhost' }).ok, false);
  assert.equal(isCalendarOAuthAllowed({ vercel: '1', host: 'localhost' }).ok, false);
  assert.equal(isCalendarOAuthAllowed({ nodeEnv: 'development', host: 'example.com' }).ok, false);
  assert.equal(isCalendarOAuthAllowed({ nodeEnv: 'development', host: 'localhost:3000' }).ok, true);
  assert.equal(isCalendarOAuthAllowed({ nodeEnv: 'development', host: '127.0.0.1:3000' }).ok, true);

  for (const name of ['start', 'callback'] as const) {
    const content = readFileSync(
      join(process.cwd(), 'app', 'api', 'calendar', 'oauth', name, 'route.ts'),
      'utf8',
    );
    assert.match(content, /isCalendarOAuthAllowed/);
    assert.match(content, /runtime = 'nodejs'/);
    assert.match(content, /no-store|NO_STORE_HEADERS/);
  }
});

test('O11. ningún secreto llega a errores', () => {
  const html = buildOAuthErrorHtml('Error', oauthErrorPageMessage('state-mismatch'));
  assert.doesNotMatch(html, /client_secret|ya29\.|refresh_token=|BEGIN PRIVATE/i);
  const success = buildOAuthSuccessHtml('solo-para-test-local');
  assert.match(success, /no-referrer/);
  assert.match(success, /no-store/);
  assert.match(success, /GOOGLE_CALENDAR_REFRESH_TOKEN/);
  assert.match(success, /No lo pegues/);
  assert.doesNotMatch(success, /localStorage|sessionStorage/);
});

test('O12. no existe escritura Calendar', () => {
  const root = join(process.cwd(), 'lib', 'calendar');
  const files = (readdirSync(root, { recursive: true }) as string[])
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => join(root, entry));
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    assert.doesNotMatch(
      content,
      /events\.(insert|update|patch|delete|move|quickAdd|import|watch)\b/,
    );
  }
});

test('O13. la integración mock sigue funcionando', () => {
  const prev = process.env.GOOGLE_CALENDAR_DATA_SOURCE;
  process.env.GOOGLE_CALENDAR_DATA_SOURCE = 'mock';
  assert.equal(resolveCalendarDataSource(process.env.GOOGLE_CALENDAR_DATA_SOURCE), 'mock');
  assert.equal(resolveCalendarDataSource(undefined), 'mock');
  assert.equal(resolveCalendarDataSource('google'), 'google');
  const events = buildMockCalendarEvents('2026-07-20');
  const agenda = buildAgendaData({
    events,
    view: 'today',
    today: '2026-07-20',
    source: 'mock',
    status: 'mock',
    notice: null,
    calendarCount: 1,
  });
  assert.ok(agenda.timelineToday.length > 0);
  process.env.GOOGLE_CALENDAR_DATA_SOURCE = prev;
});

test('O14. Sheets y Notion siguen funcionando', () => {
  assert.ok(getDataSource() === 'mock' || getDataSource() === 'google');
  assert.ok(getNotionDataSource() === 'mock' || getNotionDataSource() === 'notion');
});

test('O15. callback rechaza code reutilizado y error de Google', () => {
  resetConsumedAuthorizationCodes();
  const first = validateOAuthCallback({
    code: 'once',
    state: 'st',
    cookieState: 'st',
    googleError: null,
  });
  assert.equal(first.ok, true);
  const second = validateOAuthCallback({
    code: 'once',
    state: 'st',
    cookieState: 'st',
    googleError: null,
  });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, 'code-reused');

  resetConsumedAuthorizationCodes();
  const googleErr = validateOAuthCallback({
    code: 'c',
    state: 'st',
    cookieState: 'st',
    googleError: 'access_denied',
  });
  assert.equal(googleErr.ok, false);
  if (!googleErr.ok) assert.equal(googleErr.reason, 'google-error');
});

test('O16. .env.example documenta redirect URI', () => {
  const example = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
  assert.match(example, /GOOGLE_CALENDAR_REDIRECT_URI/);
  assert.match(example, /localhost:3000\/api\/calendar\/oauth\/callback/);
});
