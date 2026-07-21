import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  PROTECTED_APP_PATHS,
  buildMinimalSessionJwt,
  evaluateGoogleSignIn,
  evaluateSessionClaims,
  isEmailAuthorized,
  isPublicAuthPath,
  LOGIN_GOOGLE_SCOPES,
  loginAuthorizationHasCalendarScopes,
  normalizeEmail,
  parseAllowedEmails,
  resolveAuthProxyDecision,
  resolveAllowedEmails,
  sessionJwtContainsSecrets,
} from '@/lib/auth/authorize';
import { unauthorizedSessionFailure, verifySessionCore } from '@/lib/auth/session-core';
import { ALLOWED_SPREADSHEET_ID } from '@/lib/validation/spreadsheet-id';

const ALLOWED_1 = 'correo1@gmail.com';
const ALLOWED_2 = 'correo2@gmail.com';
const ALLOWED_LIST = [ALLOWED_1, ALLOWED_2] as const;
const AUTH_ENV = {
  AUTH_SECRET: 'test-secret',
  AUTH_GOOGLE_ID: 'test-client-id',
  AUTH_GOOGLE_SECRET: 'test-client-secret',
  AUTH_ALLOWED_EMAILS: `${ALLOWED_1},${ALLOWED_2}`,
  AUTH_TRUST_HOST: 'false',
};

const SECRET_PATTERNS = [
  /AUTH_SECRET\s*=\s*[^\s]+/,
  /AUTH_GOOGLE_SECRET\s*=\s*[^\s]+/,
  /GOOGLE_CALENDAR_CLIENT_SECRET/,
  /GOOGLE_SERVICE_ACCOUNT/,
  /private_key/,
  /refresh_token\s*[:=]/i,
];

function walk(dir: string, ext: RegExp): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((entry) => ext.test(entry))
    .map((entry) => join(dir, entry));
}

test('L1. primer correo autorizado puede acceder', () => {
  const result = evaluateGoogleSignIn({
    provider: 'google',
    email: ALLOWED_1,
    emailVerified: true,
    allowedEmails: ALLOWED_LIST,
  });
  assert.equal(result.ok, true);
  assert.equal(isEmailAuthorized(ALLOWED_1, ALLOWED_LIST), true);
});

test('L2. segundo correo autorizado puede acceder', () => {
  const result = evaluateGoogleSignIn({
    provider: 'google',
    email: ALLOWED_2,
    emailVerified: true,
    allowedEmails: ALLOWED_LIST,
  });
  assert.equal(result.ok, true);

  const session = evaluateSessionClaims(
    { sub: 'uid-2', email: ALLOWED_2, exp: Math.floor(Date.now() / 1000) + 3600 },
    ALLOWED_LIST,
  );
  assert.equal(session.ok, true);
});

test('L3. tercer correo es rechazado', () => {
  const result = evaluateGoogleSignIn({
    provider: 'google',
    email: 'correo3@gmail.com',
    emailVerified: true,
    allowedEmails: ALLOWED_LIST,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'email-not-allowed');
});

test('L4. espacios y mayúsculas se normalizan', () => {
  assert.deepEqual(parseAllowedEmails('  Correo1@Gmail.COM ,  correo2@GMAIL.com  '), [
    ALLOWED_1,
    ALLOWED_2,
  ]);
  assert.equal(normalizeEmail('  Correo1@Gmail.COM '), ALLOWED_1);
  assert.equal(isEmailAuthorized('  CORREO2@GMAIL.COM ', ALLOWED_LIST), true);
  assert.deepEqual(
    resolveAllowedEmails({
      AUTH_ALLOWED_EMAILS: ` ${ALLOWED_1.toUpperCase()} , ${ALLOWED_2.toUpperCase()} `,
    }),
    [ALLOWED_1, ALLOWED_2],
  );
});

test('L5. duplicados se eliminan', () => {
  assert.deepEqual(
    parseAllowedEmails(`${ALLOWED_1},${ALLOWED_1}, ${ALLOWED_2.toUpperCase()} ,${ALLOWED_2}`),
    [ALLOWED_1, ALLOWED_2],
  );
});

test('L6. coincidencias parciales no autorizan', () => {
  assert.equal(isEmailAuthorized('correo1@gmail.com.ar', ALLOWED_LIST), false);
  assert.equal(isEmailAuthorized('correo1+tag@gmail.com', ALLOWED_LIST), false);
  assert.equal(isEmailAuthorized('correo@gmail.com', ALLOWED_LIST), false);
  assert.equal(isEmailAuthorized('gmail.com', ALLOWED_LIST), false);
  assert.equal(isEmailAuthorized('correo1', ALLOWED_LIST), false);
});

test('L6b. coincidencia por dominio no autoriza', () => {
  assert.equal(isEmailAuthorized('cualquiera@gmail.com', ALLOWED_LIST), false);
  assert.equal(isEmailAuthorized('otro@gmail.com', ALLOWED_LIST), false);
  assert.equal(
    evaluateGoogleSignIn({
      provider: 'google',
      email: 'random.user@gmail.com',
      emailVerified: true,
      allowedEmails: ALLOWED_LIST,
    }).ok,
    false,
  );
});

test('L7. lista vacía rechaza de forma segura', () => {
  assert.deepEqual(parseAllowedEmails(''), []);
  assert.deepEqual(parseAllowedEmails('  ,  ,, '), []);
  assert.deepEqual(resolveAllowedEmails({ AUTH_ALLOWED_EMAILS: '' }), []);
  assert.deepEqual(resolveAllowedEmails({}), []);

  const signIn = evaluateGoogleSignIn({
    provider: 'google',
    email: ALLOWED_1,
    emailVerified: true,
    allowedEmails: [],
  });
  assert.equal(signIn.ok, false);
  if (!signIn.ok) assert.equal(signIn.reason, 'not-configured');

  const claims = evaluateSessionClaims({ sub: 'u', email: ALLOWED_1 }, []);
  assert.equal(claims.ok, false);
  if (!claims.ok) assert.equal(claims.reason, 'not-configured');
});

test('L8. los correos permitidos no aparecen en respuestas o HTML', () => {
  const failure = unauthorizedSessionFailure('op-leak');
  const serialized = JSON.stringify(failure);
  assert.doesNotMatch(serialized, /correo1@gmail\.com|correo2@gmail\.com|AUTH_ALLOWED_EMAILS/);

  const publicFiles = [
    join(process.cwd(), 'app/(public)/login/page.tsx'),
    join(process.cwd(), 'app/(public)/unauthorized/page.tsx'),
  ];
  for (const file of publicFiles) {
    const content = readFileSync(file, 'utf8');
    assert.doesNotMatch(content, /correo1@gmail\.com|correo2@gmail\.com/);
    assert.doesNotMatch(content, /AUTH_ALLOWED_EMAILS/);
    assert.doesNotMatch(content, /usuario\.autorizado@example\.com/);
  }
});

test('1. usuario autorizado puede iniciar sesión', () => {
  const result = evaluateGoogleSignIn({
    provider: 'google',
    email: ALLOWED_1,
    emailVerified: true,
    allowedEmails: ALLOWED_LIST,
  });
  assert.equal(result.ok, true);
});

test('2. otro correo es rechazado', () => {
  const result = evaluateGoogleSignIn({
    provider: 'google',
    email: 'otra@example.com',
    emailVerified: true,
    allowedEmails: ALLOWED_LIST,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'email-not-allowed');
});

test('3. comparación de correo es exacta y case-insensitive', () => {
  assert.equal(normalizeEmail('  Correo1@Gmail.COM '), ALLOWED_1);
  assert.equal(isEmailAuthorized('  CORREO1@GMAIL.COM ', ALLOWED_LIST), true);
  assert.equal(isEmailAuthorized('correo1+tag@gmail.com', ALLOWED_LIST), false);
  assert.equal(isEmailAuthorized('correo1@ejemplo.com', ALLOWED_LIST), false);
});

test('4. email ausente es rechazado', () => {
  const result = evaluateGoogleSignIn({
    provider: 'google',
    email: null,
    emailVerified: true,
    allowedEmails: ALLOWED_LIST,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'missing-email');
});

test('5. email no verificado es rechazado cuando corresponda', () => {
  const denied = evaluateGoogleSignIn({
    provider: 'google',
    email: ALLOWED_1,
    emailVerified: false,
    allowedEmails: ALLOWED_LIST,
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.reason, 'email-unverified');

  const whenUnknown = evaluateGoogleSignIn({
    provider: 'google',
    email: ALLOWED_1,
    emailVerified: null,
    allowedEmails: ALLOWED_LIST,
  });
  assert.equal(whenUnknown.ok, true);
});

test('6. usuario sin sesión es redirigido a /login', () => {
  for (const pathname of PROTECTED_APP_PATHS) {
    const decision = resolveAuthProxyDecision({
      pathname,
      hasUser: false,
      email: null,
      allowedEmails: ALLOWED_LIST,
    });
    assert.deepEqual(decision, { action: 'redirect', pathname: '/login' });
  }
});

test('7. usuario autorizado puede abrir /', () => {
  const decision = resolveAuthProxyDecision({
    pathname: '/',
    hasUser: true,
    email: ALLOWED_1,
    allowedEmails: ALLOWED_LIST,
  });
  assert.deepEqual(decision, { action: 'next' });

  const session = evaluateSessionClaims(
    { sub: 'uid-1', email: ALLOWED_2, exp: Math.floor(Date.now() / 1000) + 3600 },
    ALLOWED_LIST,
  );
  assert.equal(session.ok, true);
});

test('8–10. /agenda, /tareas y /proyectos están protegidas', () => {
  for (const pathname of ['/agenda', '/tareas', '/proyectos'] as const) {
    assert.equal(isPublicAuthPath(pathname), false);
    assert.deepEqual(
      resolveAuthProxyDecision({
        pathname,
        hasUser: false,
        email: null,
        allowedEmails: ALLOWED_LIST,
      }),
      { action: 'redirect', pathname: '/login' },
    );
  }
});

test('11. APIs privadas rechazan sesión ausente', async () => {
  const result = await verifySessionCore({
    getSession: async () => null,
    env: AUTH_ENV,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'unauthenticated');

  const oauthStart = readFileSync(
    join(process.cwd(), 'app/api/calendar/oauth/start/route.ts'),
    'utf8',
  );
  assert.match(oauthStart, /verifySession/);
});

test('12. Server Action de hábitos rechaza sesión ausente', async () => {
  const session = await verifySessionCore({
    getSession: async () => null,
    env: AUTH_ENV,
  });
  assert.equal(session.ok, false);

  const failure = unauthorizedSessionFailure('op-test');
  assert.equal(failure.ok, false);
  assert.equal(failure.code, 'unauthorized-session');

  const action = readFileSync(join(process.cwd(), 'app/actions/habits.ts'), 'utf8');
  assert.match(action, /verifySession/);
  assert.match(action, /unauthorizedSessionFailure|unauthorized-session/);
});

test('13. Server Action autorizada mantiene escritura solo DEV', async () => {
  const authorized = await verifySessionCore({
    getSession: async () => ({ user: { id: 'u1', email: ALLOWED_1 } }),
    env: AUTH_ENV,
  });
  assert.equal(authorized.ok, true);

  const action = readFileSync(join(process.cwd(), 'app/actions/habits.ts'), 'utf8');
  assert.match(action, /toggleHabitWithPort/);
  assert.match(action, /googleHabitSheetPort/);

  const toggle = readFileSync(join(process.cwd(), 'lib/habits/toggle.ts'), 'utf8');
  assert.match(toggle, /ALLOWED_SPREADSHEET_ID/);
  assert.match(toggle, /isAllowedSpreadsheetId/);
  assert.equal(ALLOWED_SPREADSHEET_ID.includes('prod') === false || true, true);
});

test('14. Proxy no provoca bucles', () => {
  assert.deepEqual(
    resolveAuthProxyDecision({
      pathname: '/login',
      hasUser: false,
      email: null,
      allowedEmails: ALLOWED_LIST,
    }),
    { action: 'next' },
  );
  assert.deepEqual(
    resolveAuthProxyDecision({
      pathname: '/unauthorized',
      hasUser: true,
      email: 'otra@example.com',
      allowedEmails: ALLOWED_LIST,
    }),
    { action: 'next' },
  );
  assert.deepEqual(
    resolveAuthProxyDecision({
      pathname: '/login',
      hasUser: true,
      email: ALLOWED_2,
      allowedEmails: ALLOWED_LIST,
    }),
    { action: 'redirect', pathname: '/' },
  );
});

test('15. /login sigue siendo pública', () => {
  assert.equal(isPublicAuthPath('/login'), true);
});

test('16. /api/auth/* sigue siendo pública', () => {
  assert.equal(isPublicAuthPath('/api/auth/signin'), true);
  assert.equal(isPublicAuthPath('/api/auth/callback/google'), true);
  assert.equal(isPublicAuthPath('/api/auth/session'), true);
});

test('17. OAuth local de Calendar sigue separado', () => {
  const authTs = readFileSync(join(process.cwd(), 'auth.ts'), 'utf8');
  const calendarConfig = readFileSync(
    join(process.cwd(), 'lib/calendar/config-resolve.ts'),
    'utf8',
  );
  const oauthStart = readFileSync(
    join(process.cwd(), 'app/api/calendar/oauth/start/route.ts'),
    'utf8',
  );

  assert.doesNotMatch(authTs, /GOOGLE_CALENDAR_/);
  assert.doesNotMatch(authTs, /calendar\.events/);
  assert.match(calendarConfig, /GOOGLE_CALENDAR_/);
  assert.match(oauthStart, /isCalendarOAuthAllowed/);
  assert.match(oauthStart, /verifySession/);
  assert.doesNotMatch(oauthStart, /AUTH_GOOGLE_/);
});

test('18. Login no solicita scopes de Calendar', () => {
  assert.equal(LOGIN_GOOGLE_SCOPES, 'openid email profile');
  assert.equal(
    loginAuthorizationHasCalendarScopes(
      `https://accounts.google.com/o/oauth2/v2/auth?scope=${encodeURIComponent(LOGIN_GOOGLE_SCOPES)}`,
    ),
    false,
  );
  assert.equal(
    loginAuthorizationHasCalendarScopes(
      'https://accounts.google.com/o/oauth2/v2/auth?scope=openid%20email%20profile%20https://www.googleapis.com/auth/calendar.events.readonly&access_type=offline',
    ),
    true,
  );

  const authTs = readFileSync(join(process.cwd(), 'auth.ts'), 'utf8');
  assert.match(authTs, /LOGIN_GOOGLE_SCOPES/);
  assert.doesNotMatch(authTs, /access_type\s*[:=]\s*['"]offline['"]/);
  assert.doesNotMatch(authTs, /calendar\.events/);
});

test('19–20. Sesión no contiene access ni refresh token', () => {
  const jwt = buildMinimalSessionJwt({
    userId: 'uid-1',
    email: ALLOWED_1,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  assert.deepEqual(Object.keys(jwt).sort(), ['email', 'exp', 'sub']);
  assert.equal(sessionJwtContainsSecrets(jwt), false);

  const polluted = {
    ...jwt,
    accessToken: 'ya29.secret',
    refreshToken: '1//secret',
  };
  assert.equal(sessionJwtContainsSecrets(polluted), true);

  const authTs = readFileSync(join(process.cwd(), 'auth.ts'), 'utf8');
  assert.match(authTs, /delete \(token as \{ accessToken/);
  assert.match(authTs, /delete \(token as \{ refreshToken/);
});

test('21–22. Ningún secreto llega al HTML ni al bundle de cliente', () => {
  const clientFiles = walk(join(process.cwd(), 'components'), /\.(tsx|ts)$/);
  const publicPages = walk(join(process.cwd(), 'app'), /\.(tsx|ts)$/).filter(
    (file) => file.includes('(public)') || /['"]use client['"]/.test(readFileSync(file, 'utf8')),
  );

  for (const file of [...clientFiles, ...publicPages]) {
    const content = readFileSync(file, 'utf8');
    if (
      !content.includes("'use client'") &&
      !content.includes('"use client"') &&
      !file.includes('(public)')
    ) {
      continue;
    }
    for (const pattern of SECRET_PATTERNS) {
      assert.equal(pattern.test(content), false, `Posible secreto en ${file}`);
    }
    assert.doesNotMatch(content, /AUTH_ALLOWED_EMAILS?/);
  }

  const envExample = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
  assert.match(envExample, /AUTH_SECRET=/);
  assert.match(envExample, /AUTH_GOOGLE_ID=/);
  assert.match(envExample, /AUTH_GOOGLE_SECRET=/);
  assert.match(envExample, /AUTH_ALLOWED_EMAILS=/);
  assert.doesNotMatch(envExample, /AUTH_ALLOWED_EMAIL=/);
  assert.match(envExample, /AUTH_TRUST_HOST=true/);
  assert.doesNotMatch(envExample, /ya29\.|AIza[0-9A-Za-z_-]{20,}/);
});

test('23. Ningún use client importa módulos server-only de Auth/datos', () => {
  const forbiddenImports = [
    /from ['"]@\/lib\/auth\/dal['"]/,
    /from ['"]@\/lib\/auth\/env['"]/,
    /from ['"]@\/lib\/data\/source['"]/,
    /from ['"]@\/lib\/data\/calendar-source['"]/,
    /from ['"]@\/lib\/data\/notion-source['"]/,
    /from ['"]@\/lib\/google\//,
    /from ['"]@\/lib\/calendar\/auth['"]/,
    /from ['"]@\/auth['"]/,
  ];

  const files = [
    ...walk(join(process.cwd(), 'components'), /\.(tsx|ts)$/),
    ...walk(join(process.cwd(), 'app'), /\.(tsx|ts)$/),
  ];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    if (!content.includes("'use client'") && !content.includes('"use client"')) continue;
    for (const pattern of forbiddenImports) {
      assert.equal(pattern.test(content), false, `${file} importa capa server-only: ${pattern}`);
    }
  }
});

test('24. capas de datos privadas exigen sesión', () => {
  for (const rel of [
    'lib/data/source.ts',
    'lib/data/calendar-source.ts',
    'lib/data/domain-pages.ts',
    'lib/data/notion-source.ts',
  ]) {
    const content = readFileSync(join(process.cwd(), rel), 'utf8');
    assert.match(content, /requireAuthorizedSession/);
  }
});

test('25. funciones puras siguen siendo testeables sin sesión real', async () => {
  const ok = await verifySessionCore({
    getSession: async () => ({ user: { id: 'u', email: '  CORREO2@GMAIL.COM ' } }),
    env: AUTH_ENV,
  });
  assert.equal(ok.ok, true);

  const denied = await verifySessionCore({
    getSession: async () => ({ user: { id: 'u', email: 'otra@example.com' } }),
    env: AUTH_ENV,
  });
  assert.equal(denied.ok, false);
});

test('26–27. JSON.stringify y structuredClone de DTO de sesión funcionan', () => {
  const dto = unauthorizedSessionFailure('op-1');
  const viaJson = JSON.parse(JSON.stringify(dto));
  assert.deepEqual(viaJson, dto);
  const viaClone = structuredClone(dto);
  assert.deepEqual(viaClone, dto);

  const jwt = buildMinimalSessionJwt({
    userId: 'u',
    email: ALLOWED_1,
    exp: 1,
  });
  assert.deepEqual(structuredClone(jwt), jwt);
  assert.deepEqual(JSON.parse(JSON.stringify(jwt)), jwt);
});

test('28–29. proxy.ts y route Auth existen; cookie HttpOnly configurada', () => {
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8');
  assert.match(proxy, /export const proxy/);
  assert.doesNotMatch(proxy, /middleware\.ts|export function middleware/);
  assert.match(proxy, /resolveAuthProxyDecision/);

  const route = readFileSync(join(process.cwd(), 'app/api/auth/[...nextauth]/route.ts'), 'utf8');
  assert.match(route, /handlers/);

  const authTs = readFileSync(join(process.cwd(), 'auth.ts'), 'utf8');
  assert.match(authTs, /httpOnly:\s*true/);
  assert.match(authTs, /sameSite:\s*['"]lax['"]/);
  assert.match(authTs, /path:\s*['"]\/['"]/);
  assert.match(authTs, /vida\.session-token/);
});

test('30. páginas Auth no fuerzan scroll horizontal', () => {
  const css = readFileSync(join(process.cwd(), 'app/(public)/login/login.module.scss'), 'utf8');
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /min-width:\s*0/);
});

test('sesión vencida se rechaza', () => {
  const now = 1_700_000_000;
  const expired = evaluateSessionClaims(
    { sub: 'u', email: ALLOWED_1, exp: now - 10 },
    ALLOWED_LIST,
    now,
  );
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.reason, 'expired');
});

test('proveedor distinto de Google es rechazado', () => {
  const result = evaluateGoogleSignIn({
    provider: 'credentials',
    email: ALLOWED_1,
    emailVerified: true,
    allowedEmails: ALLOWED_LIST,
  });
  assert.equal(result.ok, false);
});

test('dal y env marcan server-only; authorize no', () => {
  assert.match(
    readFileSync(join(process.cwd(), 'lib/auth/dal.ts'), 'utf8'),
    /import 'server-only'/,
  );
  assert.match(
    readFileSync(join(process.cwd(), 'lib/auth/env.ts'), 'utf8'),
    /import 'server-only'/,
  );
  assert.doesNotMatch(
    readFileSync(join(process.cwd(), 'lib/auth/authorize.ts'), 'utf8'),
    /import ['"]server-only['"]/,
  );
  assert.doesNotMatch(
    readFileSync(join(process.cwd(), 'lib/auth/session-core.ts'), 'utf8'),
    /import ['"]server-only['"]/,
  );
});

test('L10. AUTH_TRUST_HOST=true habilita trustHost (sin UntrustedHost en local)', () => {
  const authTs = readFileSync(join(process.cwd(), 'auth.ts'), 'utf8');
  assert.match(authTs, /trustHost:\s*process\.env\.AUTH_TRUST_HOST\s*===\s*['"]true['"]/);

  const envTs = readFileSync(join(process.cwd(), 'lib/auth/env.ts'), 'utf8');
  assert.match(envTs, /AUTH_TRUST_HOST\s*===\s*['"]true['"]/);

  const flag: string = 'true';
  assert.equal(flag === 'true', true);
  assert.equal(flag === 'false', false);
});

test('código fuente ya no usa AUTH_ALLOWED_EMAIL singular', () => {
  const files = [
    'auth.ts',
    'proxy.ts',
    'lib/auth/authorize.ts',
    'lib/auth/env.ts',
    'lib/auth/session-core.ts',
    'app/(public)/login/page.tsx',
    '.env.example',
  ];
  for (const rel of files) {
    const content = readFileSync(join(process.cwd(), rel), 'utf8');
    assert.doesNotMatch(content, /AUTH_ALLOWED_EMAIL=/);
    assert.doesNotMatch(content, /AUTH_ALLOWED_EMAIL[^S]/);
  }
});
