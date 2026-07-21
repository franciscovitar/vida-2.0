import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { resolveAuthProxyDecision, isPublicAuthPath } from '@/lib/auth/authorize';
import { unauthorizedSessionFailure, verifySessionCore } from '@/lib/auth/session-core';
import { isCalendarOAuthAllowed } from '@/lib/calendar/oauth-flow';
import {
  resolveCalendarConfig,
  resolveCalendarOAuthSetupConfig,
} from '@/lib/calendar/config-resolve';

function walk(dir: string, ext: RegExp): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((entry) => ext.test(entry))
    .map((entry) => join(dir, entry));
}

test('P1. build sin .env.local: Auth y Calendar degradan de forma segura', async () => {
  const emptyEnv = {};
  const session = await verifySessionCore({
    getSession: async () => null,
    env: emptyEnv,
  });
  assert.equal(session.ok, false);
  if (!session.ok) assert.equal(session.reason, 'not-configured');

  const calendar = resolveCalendarConfig(emptyEnv);
  assert.equal(calendar.ok, false);
});

test('P2. rutas privadas de app marcan force-dynamic', () => {
  const files = [
    'app/(app)/page.tsx',
    'app/(app)/agenda/page.tsx',
    'app/(app)/tareas/page.tsx',
    'app/(app)/proyectos/page.tsx',
    'app/(app)/habitos/page.tsx',
  ];
  for (const rel of files) {
    const content = readFileSync(join(process.cwd(), rel), 'utf8');
    assert.match(content, /export const dynamic = 'force-dynamic'/);
  }
});

test('P3–P4. Proxy protege rutas futuras; pública sigue abierta', () => {
  assert.equal(isPublicAuthPath('/ruta-futura-desconocida'), false);
  assert.deepEqual(
    resolveAuthProxyDecision({
      pathname: '/ruta-futura-desconocida',
      hasUser: false,
      email: null,
      allowedEmails: ['a@example.com'],
    }),
    { action: 'redirect', pathname: '/login' },
  );
  assert.deepEqual(
    resolveAuthProxyDecision({
      pathname: '/login',
      hasUser: false,
      email: null,
      allowedEmails: ['a@example.com'],
    }),
    { action: 'next' },
  );
});

test('P5–P6. DAL y Server Action exigen sesión', async () => {
  const denied = await verifySessionCore({
    getSession: async () => null,
    env: {
      AUTH_SECRET: 'x',
      AUTH_GOOGLE_ID: 'y',
      AUTH_GOOGLE_SECRET: 'z',
      AUTH_ALLOWED_EMAILS: 'a@example.com',
    },
  });
  assert.equal(denied.ok, false);

  const failure = unauthorizedSessionFailure('op');
  assert.equal(failure.code, 'unauthorized-session');

  const action = readFileSync(join(process.cwd(), 'app/actions/habits.ts'), 'utf8');
  assert.match(action, /verifySession/);
});

test('P7–P8. OAuth Calendar bloqueado en Vercel y fuera de localhost', () => {
  assert.equal(isCalendarOAuthAllowed({ vercel: '1', host: 'vida-2-0.vercel.app' }).ok, false);
  assert.equal(
    isCalendarOAuthAllowed({ nodeEnv: 'production', host: 'vida-2-0.vercel.app' }).ok,
    false,
  );
  assert.equal(
    isCalendarOAuthAllowed({ nodeEnv: 'development', host: 'vida-2-0.vercel.app' }).ok,
    false,
  );
  assert.equal(isCalendarOAuthAllowed({ nodeEnv: 'development', host: 'localhost:3000' }).ok, true);
});

test('P9. cookie Secure solo en producción (configuración Auth)', () => {
  const authTs = readFileSync(join(process.cwd(), 'auth.ts'), 'utf8');
  assert.match(authTs, /secure:\s*process\.env\.NODE_ENV\s*===\s*['"]production['"]/);
  assert.match(authTs, /httpOnly:\s*true/);
  assert.match(authTs, /sameSite:\s*['"]lax['"]/);
});

test('P10. AUTH_TRUST_HOST activa trustHost (Preview/local)', () => {
  const authTs = readFileSync(join(process.cwd(), 'auth.ts'), 'utf8');
  assert.match(authTs, /trustHost:\s*process\.env\.AUTH_TRUST_HOST\s*===\s*['"]true['"]/);
  assert.doesNotMatch(authTs, /AUTH_URL|NEXTAUTH_URL/);
});

test('P11–P12. sin callbacks localhost hardcodeados en auth de login', () => {
  const authTs = readFileSync(join(process.cwd(), 'auth.ts'), 'utf8');
  assert.doesNotMatch(authTs, /localhost:3000/);
  assert.doesNotMatch(authTs, /127\.0\.0\.1/);
});

test('P13. sin rutas absolutas de Windows en código de app/lib', () => {
  const roots = [
    join(process.cwd(), 'app'),
    join(process.cwd(), 'lib'),
    join(process.cwd(), 'auth.ts'),
  ];
  const files = [...walk(roots[0], /\.(ts|tsx)$/), ...walk(roots[1], /\.(ts|tsx)$/), roots[2]];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    assert.doesNotMatch(content, /C:\\\\Users|C:\/Users|OneDrive\\\\Desktop/i);
  }
});

test('P14. .env.example documenta Preview y no incluye AUTH_URL inventada', () => {
  const example = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
  assert.match(example, /AUTH_ALLOWED_EMAILS=/);
  assert.match(example, /AUTH_TRUST_HOST=true/);
  assert.match(example, /NO configurar en Vercel|no configurar en Vercel/i);
  assert.match(example, /GOOGLE_CALENDAR_REDIRECT_URI=/);
  assert.doesNotMatch(example, /^AUTH_URL=/m);
  assert.doesNotMatch(example, /^NEXTAUTH_URL=/m);
  assert.match(example, /openid email profile/i);
});

test('P15. googleapis externalizado y server-only en capas Google/Calendar', () => {
  const nextConfig = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');
  assert.match(nextConfig, /serverExternalPackages/);
  assert.match(nextConfig, /googleapis/);

  for (const rel of ['lib/google/client.ts', 'lib/calendar/auth.ts', 'lib/calendar/client.ts']) {
    assert.match(readFileSync(join(process.cwd(), rel), 'utf8'), /import 'server-only'/);
  }
});

test('P16–P17. DTO de fallo de sesión serializable', () => {
  const dto = unauthorizedSessionFailure('preview');
  assert.deepEqual(JSON.parse(JSON.stringify(dto)), dto);
  assert.deepEqual(structuredClone(dto), dto);
});

test('P18–P20. fallos parciales: capas de Hoy aíslan fuentes', () => {
  const compose = readFileSync(join(process.cwd(), 'lib/data/compose-today.ts'), 'utf8');
  const combine = readFileSync(join(process.cwd(), 'lib/data/combine-hoy.ts'), 'utf8');
  assert.match(compose + combine, /compose|combine|notion|calendar|sheet/i);
});

test('P21–P23. sin escrituras Notion/Calendar; hábitos solo target resuelto', () => {
  const notionClient = readFileSync(join(process.cwd(), 'lib/notion/client.ts'), 'utf8');
  assert.match(notionClient, /dataSources\.query/);
  assert.doesNotMatch(
    notionClient,
    /pages\.create|pages\.update|blocks\.children\.append|databases\.create/,
  );

  const calendarClient = readFileSync(join(process.cwd(), 'lib/calendar/client.ts'), 'utf8');
  assert.match(calendarClient, /\/events/);
  assert.doesNotMatch(calendarClient, /events\.insert|events\.update|events\.delete|quickAdd/);

  const toggle = readFileSync(join(process.cwd(), 'lib/habits/toggle.ts'), 'utf8');
  assert.match(toggle, /writesAllowed/);
  assert.doesNotMatch(toggle, /ALLOWED_SPREADSHEET_ID/);
});

test('P24. login no fuerza suppressHydrationWarning en el markup de la página', () => {
  const login = readFileSync(join(process.cwd(), 'app/(public)/login/page.tsx'), 'utf8');
  assert.doesNotMatch(login, /suppressHydrationWarning/);
  // Solo el <html> del layout raíz lo usa (tema FOUC), causa legítima.
  const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
  assert.match(layout, /suppressHydrationWarning/);
});

test('P25. login CSS evita scroll horizontal', () => {
  const css = readFileSync(join(process.cwd(), 'app/(public)/login/login.module.scss'), 'utf8');
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /min-width:\s*0/);
});

test('P26. next-auth fijado exactamente en 5.0.0-beta.32', () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  assert.equal(pkg.dependencies['next-auth'], '5.0.0-beta.32');
});

test('P27. runtime Calendar no exige GOOGLE_CALENDAR_REDIRECT_URI', () => {
  const runtime = resolveCalendarConfig({
    GOOGLE_CALENDAR_CLIENT_ID: 'id',
    GOOGLE_CALENDAR_CLIENT_SECRET: 'secret',
    GOOGLE_CALENDAR_REFRESH_TOKEN: 'refresh',
    GOOGLE_CALENDAR_IDS: 'primary',
  });
  assert.equal(runtime.ok, true);

  const setup = resolveCalendarOAuthSetupConfig({
    GOOGLE_CALENDAR_CLIENT_ID: 'id',
    GOOGLE_CALENDAR_CLIENT_SECRET: 'secret',
  });
  assert.equal(setup.ok, true);
  if (setup.ok) {
    assert.match(setup.config.redirectUri, /localhost:3000\/api\/calendar\/oauth\/callback/);
  }
});

test('P28. engines Node 24.x declarado', () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
    engines: { node: string };
  };
  assert.match(pkg.engines.node, /24/);
  assert.match(pkg.engines.node, /<25/);
});
