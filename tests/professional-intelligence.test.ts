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

test('PRO-01. snapshot V4 válido, sanitizado y con provenance de PAS main', () => {
  const raw = snapshotText();
  const parsed = parseProfessionalSnapshot(JSON.parse(raw));

  assert.ok(parsed);
  assert.equal(parsed.source.repository, 'franciscovitar/personal-ai-system');
  assert.equal(parsed.source.ref, 'main');
  assert.match(parsed.source.commit, /^[a-f0-9]{40}$/);
  assert.equal(parsed.schemaVersion, 4);

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
  const raw = snapshotText();
  const source = (
    JSON.parse(raw) as {
      source: { observedAt: string; staleAfterDays: number };
    }
  ).source;
  const observedAt = new Date(`${source.observedAt}T00:00:00Z`);
  const dayMs = 24 * 60 * 60 * 1000;

  const fresh = resolveProfessionalSnapshotText(
    raw,
    new Date(observedAt.getTime() + source.staleAfterDays * dayMs),
  );
  assert.equal(fresh.status, 'ready');
  assert.equal(fresh.stale, false);
  assert.equal(fresh.notice, null);

  const stale = resolveProfessionalSnapshotText(
    raw,
    new Date(observedAt.getTime() + (source.staleAfterDays + 1) * dayMs),
  );
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

test('PRO-12. biblioteca tecnológica expone las 193 referencias sin confundirlas con adopción', () => {
  const libraryRaw = readFileSync(
    join(process.cwd(), 'data', 'generated', 'technology-library.json'),
    'utf8',
  );
  const library = JSON.parse(libraryRaw) as {
    totalEntries: number;
    spotlightIds: string[];
    categories: Array<{ entries: Array<{ id: string; name: string }> }>;
  };
  const entries = library.categories.flatMap((category) => category.entries);

  assert.equal(library.totalEntries, 193);
  assert.equal(entries.length, 193);
  assert.equal(library.spotlightIds.length, 20);
  assert.equal(
    entries.some((item) => item.name === 'n8n'),
    true,
  );
  assert.equal(
    entries.some((item) => item.name === 'OpenClaw'),
    true,
  );
});

test('PRO-13. UI separa radar actual de biblioteca y usa progressive disclosure', () => {
  const dashboard = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalDashboard.tsx'),
    'utf8',
  );
  const library = readFileSync(
    join(process.cwd(), 'components/professional/TechnologyLibrary.tsx'),
    'utf8',
  );

  assert.match(dashboard, /Radar actual de herramientas/);
  assert.match(library, /Biblioteca de herramientas, repos y tecnología/);
  assert.match(library, /Destacadas ahora/);
  assert.match(library, /Ver biblioteca completa/);
  assert.match(library, /Cómo podría aplicarse a lo que ya usás/);
  assert.match(library, /Beneficio posible/);
  assert.match(library, /A tener en cuenta/);
  assert.match(library, /Guardado no significa instalado/);
});

test('PRO-14. biblioteca falla cerrada si faltan datos o se rompe el contrato', async () => {
  const { resolveTechnologyLibraryText } =
    await import('@/lib/professional/technology-library-contract');

  const missing = resolveTechnologyLibraryText(null);
  assert.equal(missing.status, 'missing');
  assert.equal(missing.snapshot, null);

  const invalid = resolveTechnologyLibraryText(JSON.stringify({ schemaVersion: 1 }));
  assert.equal(invalid.status, 'invalid');
  assert.equal(invalid.snapshot, null);
});
test('PRO-15. estados extendidos de tecnología tienen etiquetas simples en español', () => {
  const dashboard = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalDashboard.tsx'),
    'utf8',
  );

  assert.match(dashboard, /ASSESS_CONDITIONALLY: 'Evaluar si aparece el caso'/);
  assert.match(
    dashboard,
    /ASSESS_ONLY_IF_IT_REDUCES_FRICTION_OR_COST: 'Evaluar sólo si mejora tiempo o costo'/,
  );
});

test('PRO-16. Career Resilience V1 conserva provenance, 11 perfiles y Data separado', async () => {
  const { parseCareerResilienceSnapshot } =
    await import('@/lib/professional/career-resilience-contract');
  const raw = readFileSync(
    join(process.cwd(), 'data', 'generated', 'ai-career-resilience.json'),
    'utf8',
  );
  const parsed = parseCareerResilienceSnapshot(JSON.parse(raw));

  assert.ok(parsed);
  assert.equal(parsed.source.repository, 'franciscovitar/personal-ai-system');
  assert.equal(parsed.source.ref, 'main');
  assert.equal(parsed.source.commit, 'aa5d930c43c39401a5cfed1a30556e8c72780f4f');
  assert.equal(parsed.roles.length, 11);
  assert.equal(
    parsed.roles.some((item) => item.id === 'data-engineer'),
    true,
  );
  assert.equal(
    parsed.roles.some((item) => item.id === 'data-scientist'),
    true,
  );
  assert.equal(
    parsed.roles.some((item) => item.id === 'data-analyst-bi'),
    true,
  );
});

test('PRO-17. Career Resilience separa presión IA, resiliencia AI-native y compresión en 1/5/10/20 años', async () => {
  const { parseCareerResilienceSnapshot } =
    await import('@/lib/professional/career-resilience-contract');
  const parsed = parseCareerResilienceSnapshot(
    JSON.parse(
      readFileSync(join(process.cwd(), 'data', 'generated', 'ai-career-resilience.json'), 'utf8'),
    ),
  );

  assert.ok(parsed);
  for (const role of parsed.roles) {
    assert.deepEqual(Object.keys(role.horizons), ['Y1', 'Y5', 'Y10', 'Y20']);
    for (const horizon of Object.values(role.horizons)) {
      assert.equal(horizon.pressureSemantics, 'UNCALIBRATED_SCENARIO_ESTIMATE');
      assert.equal(horizon.resilienceSemantics, 'HEURISTIC_INDEX_NOT_PROBABILITY');
      assert.equal(horizon.compressionSemantics, 'HEURISTIC_INDEX_NOT_PROBABILITY');
    }
    assert.ok(role.protectionPlaybook.length > 0);
    assert.ok(role.loadBearingHumanWork.length > 0);
  }
});

test('PRO-18. UI explica que los porcentajes no son probabilidad personal de desempleo', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/professional/CareerResilience.tsx'),
    'utf8',
  );

  assert.match(source, /Resiliencia profesional ante IA/);
  assert.match(source, /1 año/);
  assert.match(source, /5 años/);
  assert.match(source, /10 años/);
  assert.match(source, /20 años/);
  assert.match(source, /escenarios no calibrados/);
  assert.match(source, /no son la\s+probabilidad de que vos pierdas tu trabajo/);
  assert.match(source, /Cómo protegerte/);
  assert.match(source, /Compresión de equipo/);
});

test('PRO-19. growth queue queda acotada y sólo contiene aprendizaje activo humano o humano+IA', () => {
  const parsed = parseProfessionalSnapshot(JSON.parse(snapshotText()));
  assert.ok(parsed);

  assert.ok(parsed.growth.items.length > 0);
  assert.ok(parsed.growth.items.length <= 5);
  assert.equal(parsed.growth.cycleProgress.total, parsed.growth.items.length);
  assert.equal(
    parsed.growth.items.every(
      (item) => item.ownershipLane !== 'AI_DELEGATED' && item.status !== 'DEFERRED',
    ),
    true,
  );
});

test('PRO-20. Delegation Frontier conserva ownership por faceta, frescura y retiro explícito', () => {
  const parsed = parseProfessionalSnapshot(JSON.parse(snapshotText()));
  assert.ok(parsed);

  assert.deepEqual(parsed.delegationFrontier.publicLanes, [
    'HUMAN_CORE',
    'HUMAN_PLUS_AI',
    'AI_DELEGATED',
  ]);
  assert.equal(parsed.delegationFrontier.lastReviewed, '2026-10-02');
  assert.ok(parsed.delegationFrontier.examples.length > 0);

  const retired = parsed.delegationFrontier.examples.filter(
    (item) => item.learningDisposition === 'RETIRED_FROM_ACTIVE_LEARNING',
  );
  assert.ok(retired.length > 0);
  assert.equal(
    retired.every((item) => item.currentLane === 'AI_DELEGATED'),
    true,
  );
});

test('PRO-21. contrato rechaza que una faceta delegada consuma un slot del top-5 activo', () => {
  const value = JSON.parse(snapshotText()) as {
    growth: { items: Array<{ ownershipLane: string }> };
  };
  value.growth.items[0].ownershipLane = 'AI_DELEGATED';

  assert.equal(parseProfessionalSnapshot(value), null);
});

test('PRO-22. UI muestra el Growth Loop actual con ownership, estado y evidencia objetivo', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalDashboard.tsx'),
    'utf8',
  );

  assert.match(source, /Crecimiento \/ Huecos a llenar/);
  assert.match(source, /prioridades\s+cerradas en este ciclo/);
  assert.match(source, /Vos sí o sí/);
  assert.match(source, /Vos \+ IA/);
  assert.match(source, /Por empezar/);
  assert.match(source, /Próximo paso/);
  assert.match(source, /Evidencia objetivo/);
  assert.match(source, /Última revisión de delegación/);
});

test('PRO-23. UI retira la lista legacy duplicada y explica qué salió del estudio activo', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalDashboard.tsx'),
    'utf8',
  );

  assert.doesNotMatch(source, /snapshot\.priorities\.map/);
  assert.doesNotMatch(source, /Tus prioridades profesionales/);
  assert.match(source, /RETIRED_FROM_ACTIVE_LEARNING/);
  assert.match(source, /Salió del estudio activo/);
  assert.match(source, /no cuentan como dominio personal/);
});

test('PRO-24. UI profesional sigue siendo read-only para ownership y evita score universal', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalDashboard.tsx'),
    'utf8',
  );

  assert.doesNotMatch(source, /setOwnership|updateOwnership|cambiar ownership/i);
  assert.match(source, /No es un porcentaje de empleabilidad ni de dominio profesional total/);
});


test('PRO-25. cada Growth item lleva un Verification Blueprint canónico', () => {
  const parsed = parseProfessionalSnapshot(JSON.parse(snapshotText()));
  assert.ok(parsed);

  assert.equal(
    parsed.growth.items.every(
      (item) =>
        item.learningHandoff.sessionMode === 'ONE_PRACTICAL_SCENARIO_AT_A_TIME' &&
        item.learningHandoff.mustDemonstrate.length > 0 &&
        item.learningHandoff.freshEvidenceRule.length > 0,
    ),
    true,
  );
});

test('PRO-26. contrato rechaza un learning handoff incompleto o con modo de IA inválido', () => {
  const missing = JSON.parse(snapshotText()) as {
    growth: { items: Array<{ learningHandoff?: unknown }> };
  };
  delete missing.growth.items[0].learningHandoff;
  assert.equal(parseProfessionalSnapshot(missing), null);

  const invalid = JSON.parse(snapshotText()) as {
    growth: { items: Array<{ learningHandoff: { aiAssistanceMode: string } }> };
  };
  invalid.growth.items[0].learningHandoff.aiAssistanceMode = 'BLIND_AI';
  assert.equal(parseProfessionalSnapshot(invalid), null);
});

test('PRO-27. UI sólo transporta el handoff y ofrece copiar la práctica adaptativa', () => {
  const dashboardSource = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalDashboard.tsx'),
    'utf8',
  );
  const handoffSource = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalLearningHandoff.tsx'),
    'utf8',
  );

  assert.match(dashboardSource, /buildProfessionalLearningHandoffPrompt/);
  assert.match(dashboardSource, /ProfessionalLearningHandoff/);
  assert.match(handoffSource, /Copiar práctica para ChatGPT/);
  assert.match(handoffSource, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(handoffSource, /ownershipLane\s*=|mastery\s*=|fetch\(/i);
});
