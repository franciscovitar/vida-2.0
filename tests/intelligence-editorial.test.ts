import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  parseIntelligenceEditorialSnapshot,
  resolveIntelligenceEditorialSnapshotText,
} from '@/lib/intelligence/contract';

const snapshotPath = join(
  process.cwd(),
  'data',
  'generated',
  'intelligence-editorial-snapshot.json',
);

function snapshotText(): string {
  return readFileSync(snapshotPath, 'utf8');
}

test('INT-01. snapshot editorial válido, sanitizado y sin deuda de lectura', () => {
  const raw = snapshotText();
  const parsed = parseIntelligenceEditorialSnapshot(JSON.parse(raw));

  assert.ok(parsed);
  assert.equal(parsed.source.repository, 'franciscovitar/personal-ai-system');
  assert.equal(parsed.source.ref, 'main');
  assert.match(parsed.source.commit, /^[a-f0-9]{40}$/);
  assert.equal(parsed.readingDebt, false);
  assert.doesNotMatch(raw, /NOTION_API_TOKEN|GOOGLE_PRIVATE_KEY|AUTH_SECRET/);
  assert.doesNotMatch(raw, /drive\.google\.com/i);
});

test('INT-02. snapshot faltante o corrupto falla cerrado', () => {
  const missing = resolveIntelligenceEditorialSnapshotText(
    null,
    new Date('2026-09-21T12:00:00Z'),
  );
  assert.equal(missing.status, 'missing');
  assert.equal(missing.snapshot, null);

  const invalid = resolveIntelligenceEditorialSnapshotText(
    '{',
    new Date('2026-09-21T12:00:00Z'),
  );
  assert.equal(invalid.status, 'invalid');
  assert.equal(invalid.snapshot, null);
});

test('INT-03. frescura semanal se hace visible', () => {
  const fresh = resolveIntelligenceEditorialSnapshotText(
    snapshotText(),
    new Date('2026-09-21T12:00:00Z'),
  );
  assert.equal(fresh.status, 'ready');
  assert.equal(fresh.stale, false);

  const stale = resolveIntelligenceEditorialSnapshotText(
    snapshotText(),
    new Date('2026-10-05T12:00:00Z'),
  );
  assert.equal(stale.status, 'ready');
  assert.equal(stale.stale, true);
  assert.match(stale.notice ?? '', /refresh/i);
});

test('INT-04. brief soporta materialidad, acción y provenance', () => {
  const parsed = parseIntelligenceEditorialSnapshot(JSON.parse(snapshotText()));
  assert.ok(parsed);
  assert.ok(['MATERIAL', 'NO_MATERIAL_UPDATE'].includes(parsed.aiBrief.status));
  assert.ok(parsed.aiBrief.readingMinutes <= 10);
  assert.ok(parsed.aiBrief.sources.length > 0);
  assert.equal(parsed.aiBrief.action, 'NO_ACTION');
});

test('INT-05. UI conserva cuatro frentes y evita mecánicas de deuda', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/intelligence/IntelligenceDashboard.tsx'),
    'utf8',
  );

  assert.match(source, /IA en ~2 minutos/);
  assert.match(source, /Carrera & Skills/);
  assert.match(source, /Tech & Open Source Radar/);
  assert.match(source, /Tu PAS está mejorando/);
  assert.match(source, /Tu radar ahora/);
  assert.match(source, /sin pendientes/);
  assert.doesNotMatch(source, /streak|racha|unread count|\d+ sin leer/i);
  assert.doesNotMatch(source, /overall score|winner|best ai/i);
});

test('INT-06. Carrera/Tech siguen viniendo del snapshot profesional', () => {
  const route = readFileSync(join(process.cwd(), 'lib/data/intelligence-source.ts'), 'utf8');
  const dashboard = readFileSync(
    join(process.cwd(), 'components/intelligence/IntelligenceDashboard.tsx'),
    'utf8',
  );

  assert.match(route, /loadProfessionalSnapshot/);
  assert.match(dashboard, /professional\.snapshot/);
  assert.match(dashboard, /href="\/professional"/);
});

test('INT-07. ruta es autenticada, dinámica y visible en navegación', () => {
  const route = readFileSync(join(process.cwd(), 'app/(app)/inteligencia/page.tsx'), 'utf8');
  const source = readFileSync(join(process.cwd(), 'lib/data/intelligence-source.ts'), 'utf8');
  const nav = readFileSync(join(process.cwd(), 'lib/constants/navigation.ts'), 'utf8');

  assert.match(route, /export const dynamic = 'force-dynamic'/);
  assert.match(source, /requireAuthorizedSession/);
  assert.match(nav, /href: '\/inteligencia'/);
  assert.match(nav, /label: 'Inteligencia'/);
});
