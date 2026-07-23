import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { NOTION_DATABASES } from '@/lib/notion/constants';
import {
  buildPreviewPreflight,
  buildRuntimeReadiness,
  resolveRuntimeEnvironment,
} from '@/lib/runtime/readiness';
import {
  isWebCatalogHiddenFailure,
  isWebCatalogVisibleFailure,
} from '@/lib/web-catalog/errors';

const root = process.cwd();

function previewEnv(): Record<string, string> {
  return {
    VERCEL_ENV: 'preview',
    AUTH_TRUST_HOST: 'true',
    AUTH_SECRET: 'auth-secret-fixture',
    AUTH_GOOGLE_ID: 'google-login-id-fixture',
    AUTH_GOOGLE_SECRET: 'google-login-secret-fixture',
    AUTH_ALLOWED_EMAILS: 'authorized@example.test',
    DATA_SOURCE: 'google',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'service@example.test',
    GOOGLE_PRIVATE_KEY: 'private-key-fixture',
    GOOGLE_SHEETS_TARGET: 'dev',
    GOOGLE_SHEETS_DEV_ID: 'sheet-dev-fixture',
    GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'false',
    NOTION_DATA_SOURCE: 'notion',
    NOTION_API_TOKEN: 'notion-token-fixture',
    NOTION_TASKS_DATA_SOURCE_ID: NOTION_DATABASES.tasks.dataSourceId,
    NOTION_PROJECTS_DATA_SOURCE_ID: NOTION_DATABASES.projects.dataSourceId,
    NOTION_AREAS_DATA_SOURCE_ID: NOTION_DATABASES.areas.dataSourceId,
    GOOGLE_CALENDAR_DATA_SOURCE: 'google',
    GOOGLE_CALENDAR_CLIENT_ID: 'calendar-client-fixture',
    GOOGLE_CALENDAR_CLIENT_SECRET: 'calendar-secret-fixture',
    GOOGLE_CALENDAR_REFRESH_TOKEN: 'calendar-refresh-fixture',
    GOOGLE_CALENDAR_IDS: 'primary',
    GOOGLE_CALENDAR_TIMEZONE: 'America/Argentina/Cordoba',
    WEB_CATALOG_ENABLED: 'true',
    NOTION_WEB_CATALOG_DATA_SOURCE_ID: 'catalog-data-source-fixture',
    WRITE_ACTIONS_ENABLED: 'false',
    OPENCLAW_API_ENABLED: 'false',
  };
}

function issueCodes(env: Record<string, string>): string[] {
  return buildPreviewPreflight(env).issues.map((item) => item.code);
}

test('11A-1. Preview completo y seguro supera el preflight', () => {
  const result = buildPreviewPreflight(previewEnv());
  assert.equal(result.environment, 'preview');
  assert.equal(result.ready, true);
  assert.deepEqual(result.issues, []);
});

test('11A-2. el preflight exige confirmar entorno Preview', () => {
  const env = previewEnv();
  delete env.VERCEL_ENV;
  const result = buildPreviewPreflight(env);
  assert.equal(result.ready, false);
  assert.ok(issueCodes(env).includes('environment-not-preview'));
  assert.equal(resolveRuntimeEnvironment(env), 'local');
});

test('11A-3. fuentes mock no certifican el Preview final', () => {
  const env = previewEnv();
  env.DATA_SOURCE = 'mock';
  env.NOTION_DATA_SOURCE = 'mock';
  env.GOOGLE_CALENDAR_DATA_SOURCE = 'mock';
  const codes = issueCodes(env);
  assert.ok(codes.includes('sheets-not-live'));
  assert.ok(codes.includes('notion-not-live'));
  assert.ok(codes.includes('calendar-not-live'));
});

test('11A-4. Preview nunca admite target PROD de Sheets', () => {
  const env = previewEnv();
  env.GOOGLE_SHEETS_TARGET = 'prod';
  env.GOOGLE_SHEETS_PROD_ID = 'sheet-prod-fixture';
  const result = buildPreviewPreflight(env);
  assert.equal(result.ready, false);
  assert.ok(result.issues.some((item) => item.code === 'sheets-misconfigured'));
});

test('11A-5. escrituras avanzadas y OpenClaw permanecen apagados', () => {
  const env = previewEnv();
  env.WRITE_ACTIONS_ENABLED = 'true';
  env.OPENCLAW_API_ENABLED = 'true';
  const codes = issueCodes(env);
  assert.ok(codes.includes('writes-enabled'));
  assert.ok(codes.includes('openclaw-enabled'));
});

test('11A-6. flags locales o de tests bloquean el Preview', () => {
  const env = previewEnv();
  env.GOOGLE_CALENDAR_REDIRECT_URI = 'http://localhost:3000/callback';
  env.SHEETS_ALLOW_PROD_TARGET_FOR_TESTS = '1';
  env.WRITE_ACTIONS_USE_MEMORY = 'true';
  const codes = issueCodes(env);
  assert.ok(codes.includes('calendar-local-redirect-present'));
  assert.ok(codes.includes('test-prod-target-override-present'));
  assert.ok(codes.includes('memory-writes-enabled'));
});

test('11A-7. readiness no filtra secretos, IDs ni correos', () => {
  const env = previewEnv();
  const serialized = JSON.stringify(buildRuntimeReadiness(env));
  for (const forbidden of [
    env.AUTH_SECRET,
    env.AUTH_ALLOWED_EMAILS,
    env.GOOGLE_PRIVATE_KEY,
    env.GOOGLE_SHEETS_DEV_ID,
    env.NOTION_API_TOKEN,
    env.NOTION_TASKS_DATA_SOURCE_ID,
    env.GOOGLE_CALENDAR_CLIENT_SECRET,
    env.GOOGLE_CALENDAR_REFRESH_TOKEN,
    env.NOTION_WEB_CATALOG_DATA_SOURCE_ID,
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('11A-8. readiness distingue fuentes configuradas y capacidades apagadas', () => {
  const snapshot = buildRuntimeReadiness(previewEnv());
  const byId = new Map(snapshot.integrations.map((item) => [item.id, item]));
  assert.equal(byId.get('sheets')?.status, 'configured');
  assert.equal(byId.get('notion')?.status, 'configured');
  assert.equal(byId.get('calendar')?.status, 'configured');
  assert.equal(byId.get('web-catalog')?.status, 'configured');
  assert.equal(byId.get('writes')?.status, 'safe-disabled');
  assert.equal(byId.get('openclaw')?.status, 'safe-disabled');
});

test('11A-9. runtime local sin configuración se declara mock o apagado', () => {
  const snapshot = buildRuntimeReadiness({});
  assert.equal(snapshot.environment, 'local');
  assert.equal(snapshot.integrations.find((item) => item.id === 'sheets')?.status, 'mock');
  assert.equal(snapshot.integrations.find((item) => item.id === 'notion')?.status, 'mock');
  assert.equal(snapshot.integrations.find((item) => item.id === 'calendar')?.status, 'mock');
  assert.equal(
    snapshot.integrations.find((item) => item.id === 'web-catalog')?.status,
    'safe-disabled',
  );
});

test('11B-1. catálogo distingue 404/privacidad de fallos visibles', () => {
  assert.equal(isWebCatalogHiddenFailure('not-found'), true);
  assert.equal(isWebCatalogHiddenFailure('forbidden-policy'), true);
  assert.equal(isWebCatalogHiddenFailure('flag-disabled'), true);
  assert.equal(isWebCatalogVisibleFailure('network-error'), true);
  assert.equal(isWebCatalogVisibleFailure('invalid-catalog'), true);
  assert.equal(isWebCatalogVisibleFailure('permission-error'), true);
});

test('11B-2. boundary global no expone mensajes ni digest técnicos', () => {
  const source = readFileSync(join(root, 'app/(app)/error.tsx'), 'utf8');
  assert.equal(source.includes('error.message'), false);
  assert.equal(source.includes('error.digest'), false);
  assert.match(source, /No se muestran detalles técnicos/);
});

test('11B-3. menú móvil controla foco, Escape, Tab y aria-controls', () => {
  const source = readFileSync(join(root, 'components/navigation/MobileNav.tsx'), 'utf8');
  assert.match(source, /aria-controls="mobile-navigation-drawer"/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/);
  assert.match(source, /closeRef\.current\?\.focus\(\)/);
});

test('11B-4. Ajustes consume un único snapshot sanitizado', () => {
  const source = readFileSync(join(root, 'app/(app)/ajustes/page.tsx'), 'utf8');
  assert.match(source, /getRuntimeReadiness/);
  assert.equal(source.includes('process.env'), false);
  assert.match(source, /npm run preview:check/);
});

test('11B-5. rutas documentales muestran estados de fuente sin mocks', () => {
  const dynamicRoute = readFileSync(join(root, 'app/(app)/p/[slug]/page.tsx'), 'utf8');
  const fixedRoute = readFileSync(
    join(root, 'components/web-catalog/DocumentaryStableKeyPage.tsx'),
    'utf8',
  );
  assert.match(dynamicRoute, /CatalogState/);
  assert.match(fixedRoute, /CatalogState/);
  assert.match(dynamicRoute, /isWebCatalogVisibleFailure/);
  assert.match(fixedRoute, /isWebCatalogVisibleFailure/);
});
