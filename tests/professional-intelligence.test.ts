import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  parseProfessionalSnapshot,
  resolveProfessionalSnapshotText,
} from '@/lib/professional/contract';

const snapshotPath = join(process.cwd(), 'data', 'generated', 'professional-snapshot.json');

function snapshotText(): string {
  return readFileSync(snapshotPath, 'utf8');
}

test('PRO-01. snapshot V2 válido, sanitizado y con provenance de PAS main', () => {
  const raw = snapshotText();
  const parsed = parseProfessionalSnapshot(JSON.parse(raw));

  assert.ok(parsed);
  assert.equal(parsed.source.repository, 'franciscovitar/personal-ai-system');
  assert.equal(parsed.source.ref, 'main');
  assert.match(parsed.source.commit, /^[a-f0-9]{40}$/);
  assert.equal(parsed.schemaVersion, 2);

  assert.doesNotMatch(raw, /drive\.google\.com/i);
  assert.doesNotMatch(raw, /NOTION_API_TOKEN|GOOGLE_PRIVATE_KEY|AUTH_SECRET/);
  assert.doesNotMatch(raw, /@[a-z0-9.-]+\.[a-z]{2,}/i);
});

test('PRO-02. snapshot faltante falla cerrado', () => {
  const result = resolveProfessionalSnapshotText(null, new Date('2026-09-21T12:00:00Z'));

  assert.equal(result.status, 'missing');
  assert.equal(result.snapshot, null);
  assert.equal(result.stale, false);
  assert.match(result.notice ?? '', /falta el snapshot/i);
});

test('PRO-03. snapshot corrupto o fuera de contrato falla cerrado', () => {
  const malformed = resolveProfessionalSnapshotText('{', new Date('2026-09-21T12:00:00Z'));
  assert.equal(malformed.status, 'invalid');
  assert.equal(malformed.snapshot, null);

  const wrongSchema = resolveProfessionalSnapshotText(
    JSON.stringify({ schemaVersion: 999 }),
    new Date('2026-09-21T12:00:00Z'),
  );
  assert.equal(wrongSchema.status, 'invalid');
  assert.equal(wrongSchema.snapshot, null);
});

test('PRO-04. frescura se deriva del snapshot y se hace visible', () => {
  const fresh = resolveProfessionalSnapshotText(snapshotText(), new Date('2026-09-21T12:00:00Z'));
  assert.equal(fresh.status, 'ready');
  assert.equal(fresh.stale, false);
  assert.equal(fresh.notice, null);

  const stale = resolveProfessionalSnapshotText(snapshotText(), new Date('2026-11-10T12:00:00Z'));
  assert.equal(stale.status, 'ready');
  assert.equal(stale.stale, true);
  assert.match(stale.notice ?? '', /necesita refresh/i);
});

test('PRO-05. tecnología conserva ownership de adopción en system-maintenance', () => {
  const parsed = parseProfessionalSnapshot(JSON.parse(snapshotText()));
  assert.ok(parsed);
  assert.ok(parsed.technologies.length > 0);
  assert.equal(
    parsed.technologies.every((item) => item.decisionOwner === 'system-maintenance'),
    true,
  );
});

test('PRO-06. learning permite no recomendar curso ni credencial', () => {
  const parsed = parseProfessionalSnapshot(JSON.parse(snapshotText()));
  assert.ok(parsed);
  assert.ok(parsed.learning.length > 0);
  assert.equal(
    parsed.learning.some((item) => !item.courseNeededNow),
    true,
  );
  assert.equal(
    parsed.learning.some((item) => !item.credentialNeededNow),
    true,
  );
});

test('PRO-07. mercado muestra crecimiento, salarios y límites sin mezclar geografías', () => {
  const parsed = parseProfessionalSnapshot(JSON.parse(snapshotText()));
  assert.ok(parsed);

  const cyber = parsed.market.internationalBenchmarks.find((item) => item.id === 'US-CYBER');
  assert.ok(cyber);
  assert.equal(cyber.employmentGrowthPercent, 21);
  assert.equal(cyber.annualOpenings, 14100);
  assert.equal(cyber.medianAnnualUsd, 129180);

  const argentinaSecurity = parsed.market.argentinaSalaryRoles.find(
    (item) => item.id === 'AR-INFOSEC',
  );
  assert.ok(argentinaSecurity);
  assert.equal(
    argentinaSecurity.points.some(
      (point) => point.label === 'Senior' && point.medianArsGrossMonthly === 4300000,
    ),
    true,
  );

  assert.match(parsed.market.limitations.join(' '), /no existe un sueldo promedio mundial/i);
});

test('PRO-08. reparto de trabajo con IA mantiene tres carriles explícitos', () => {
  const parsed = parseProfessionalSnapshot(JSON.parse(snapshotText()));
  assert.ok(parsed);

  assert.ok(parsed.workSplit.own.length > 0);
  assert.ok(parsed.workSplit.withAi.length > 0);
  assert.ok(parsed.workSplit.delegateToAi.length > 0);
  assert.match(parsed.workSplit.principle, /qué pedir|qué aceptar|qué rechazar|verificar/i);
});

test('PRO-09. UI usa lenguaje simple y desplegables progresivos', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalDashboard.tsx'),
    'utf8',
  );

  assert.match(source, /Ver más/);
  assert.match(source, /Lo tenés que saber vos sí o sí/);
  assert.match(source, /Conviene hacerlo con IA/);
  assert.match(source, /Conviene delegarlo a la IA/);
  assert.match(source, /Mercado y sueldos/);
  assert.match(source, /No existe un “sueldo mundial” comparable/);
  assert.doesNotMatch(source, />missing from profile</i);
  assert.doesNotMatch(source, />strong positive</i);
  assert.doesNotMatch(source, />current stack</i);
});

test('PRO-10. UI no introduce ranking universal y conserva incertidumbre', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalDashboard.tsx'),
    'utf8',
  );

  assert.doesNotMatch(source, /role leaderboard|overall score|winner/i);
  assert.match(source, /La decisión de adoptarlo o no la toma el PAS/);
  assert.match(source, /¿Curso ahora\?/);
  assert.match(source, /¿Credencial ahora\?/);
  assert.match(source, /Snapshot generado/);
  assert.match(source, /necesita actualización/);
});

test('PRO-11. ruta autenticada es dinámica y está en navegación primaria', () => {
  const route = readFileSync(join(process.cwd(), 'app/(app)/professional/page.tsx'), 'utf8');
  const nav = readFileSync(join(process.cwd(), 'lib/constants/navigation.ts'), 'utf8');

  assert.match(route, /export const dynamic = 'force-dynamic'/);
  assert.match(route, /getProfessionalIntelligencePageData/);
  assert.match(nav, /href: '\/professional'/);
  assert.match(nav, /label: 'Profesional'/);
});
