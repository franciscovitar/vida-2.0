import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  parseWorldPublishedPiece,
  parseWorldSurfaceSnapshot,
  resolveWorldPieceText,
  resolveWorldSurfaceText,
  worldDomainFromSlug,
} from '@/lib/world/contract';
import {
  parseWorldTemporalIndex,
  parseWorldTemporalPeriod,
  selectWorldTemporalEntry,
} from '@/lib/world/temporal-contract';

const root = join(process.cwd(), 'data', 'generated', 'world');
const surfacePath = join(root, 'surface.json');
const surfaceText = () => readFileSync(surfacePath, 'utf8');

test('WORLD-01. superficie válida, finita y human-approved', () => {
  const raw = surfaceText();
  const parsed = parseWorldSurfaceSnapshot(JSON.parse(raw));
  assert.ok(parsed);
  assert.equal(parsed.source.repository, 'franciscovitar/personal-ai-system');
  assert.match(parsed.source.commit, /^[a-f0-9]{40}$/);
  assert.equal(parsed.readingDebt, false);
  assert.equal(parsed.now.items.length, 3);
  assert.equal(parsed.learn.items.length, 0);
  assert.equal(parsed.library.items.length, 5);
  assert.ok(parsed.library.items.every((item) => item.publicationState === 'HUMAN_APPROVED'));
  assert.doesNotMatch(raw, /NOTION_API_TOKEN|GOOGLE_PRIVATE_KEY|AUTH_SECRET/);
});

test('WORLD-02. superficie faltante o corrupta falla cerrado', () => {
  assert.equal(resolveWorldSurfaceText(null).status, 'missing');
  assert.equal(resolveWorldSurfaceText('{').status, 'invalid');
});

test('WORLD-03. frescura se hace visible sin fabricar edición nueva', () => {
  const fresh = resolveWorldSurfaceText(surfaceText(), new Date('2026-10-05T11:00:00-03:00'));
  assert.equal(fresh.status, 'ready');
  assert.equal(fresh.stale, false);

  const stale = resolveWorldSurfaceText(surfaceText(), new Date('2026-10-07T22:00:00-03:00'));
  assert.equal(stale.status, 'ready');
  assert.equal(stale.stale, true);
  assert.match(stale.notice ?? '', /desactualizada/i);
});

test('WORLD-04. cada card resuelve exactamente a su pieza y provenance', () => {
  const surface = parseWorldSurfaceSnapshot(JSON.parse(surfaceText()));
  assert.ok(surface);

  for (const summary of surface.library.items) {
    const raw = readFileSync(join(root, 'pieces', `${summary.slug}.json`), 'utf8');
    const piece = parseWorldPublishedPiece(JSON.parse(raw));
    assert.ok(piece);
    assert.equal(piece.source.commit, summary.sourceCommit ?? surface.source.commit);
    assert.equal(piece.source.ref, surface.source.ref);
    assert.equal(piece.source.canonicalRef, summary.pieceRef);
    assert.equal(piece.editorialDraftSha256, summary.editorialDraftSha256);

    const resolved = resolveWorldPieceText(
      raw,
      summary,
      surface,
      new Date('2026-10-05T11:00:00-03:00'),
    );
    assert.equal(resolved.status, 'ready');

    if (
      summary.mode === 'NOW' &&
      summary.sourceCommit &&
      summary.sourceCommit !== surface.source.commit
    ) {
      assert.equal(resolved.stale, true);
      assert.match(resolved.notice ?? '', /edición anterior/i);
    }
  }
});

test('WORLD-05. piezas conservan el estándar zero-knowledge aprobado', () => {
  const crispr = readFileSync(
    join(root, 'pieces', 'crispr-localized-control-2026-10-03.json'),
    'utf8',
  );
  const entanglement = readFileSync(
    join(root, 'pieces', 'que-es-entrelazamiento-cuantico.json'),
    'utf8',
  );

  assert.match(crispr, /Empecemos desde cero/);
  assert.match(crispr, /ARN guía/);
  assert.match(crispr, /Mecanoluminiscente/);
  assert.match(entanglement, /No hace falta saber física cuántica/);
  assert.match(entanglement, /armonía musical/);
  assert.match(entanglement, /WhatsApp más rápido que la luz/);
});

test('WORLD-06. rutas principales y temporales usan loader autenticado', () => {
  const paths = [
    'app/(app)/world/page.tsx',
    'app/(app)/world/ahora/page.tsx',
    'app/(app)/world/ahora/semana/page.tsx',
    'app/(app)/world/ahora/mes/page.tsx',
    'app/(app)/world/ahora/ano/page.tsx',
    'app/(app)/world/aprender/page.tsx',
    'app/(app)/world/biblioteca/page.tsx',
    'app/(app)/world/tema/[domain]/page.tsx',
    'app/(app)/world/pieza/[slug]/page.tsx',
  ];

  for (const path of paths) {
    assert.match(readFileSync(join(process.cwd(), path), 'utf8'), /force-dynamic/);
  }

  const source = readFileSync(join(process.cwd(), 'lib/data/world-source.ts'), 'utf8');
  assert.match(source, /requireAuthorizedSession/);
  assert.doesNotMatch(source, /fetch\(|axios|openai|anthropic/i);
});

test('WORLD-07. sin feed infinito ni deuda de lectura', () => {
  const ui = readFileSync(join(process.cwd(), 'components/world/WorldSurface.tsx'), 'utf8');
  const article = readFileSync(join(process.cwd(), 'components/world/WorldPiece.tsx'), 'utf8');
  assert.doesNotMatch(ui + article, /streak|racha|unread count|infinite scroll/i);
  assert.match(ui, /cola de pendientes|historia actual/i);
});

test('WORLD-08. dominios usan slugs estables', () => {
  assert.equal(worldDomainFromSlug('ciencia'), 'SCIENCE');
  assert.equal(worldDomainFromSlug('politica-geopolitica'), 'POLITICS_GEOPOLITICS');
  assert.equal(worldDomainFromSlug('cualquier-cosa'), null);
});

test('WORLD-09. Phase 10 usa feedback explícito y PostgreSQL lazy/fail-closed', () => {
  const article = readFileSync(join(process.cwd(), 'components/world/WorldPiece.tsx'), 'utf8');
  const feedback = readFileSync(join(process.cwd(), 'components/world/WorldFeedback.tsx'), 'utf8');
  const store = readFileSync(join(process.cwd(), 'lib/world/feedback-store.ts'), 'utf8');
  const postgres = readFileSync(join(process.cwd(), 'lib/world/feedback-postgres.ts'), 'utf8');

  assert.match(article, /<WorldFeedback/);
  assert.match(feedback, /saveWorldFeedbackAction/);
  assert.match(store, /createWorldFeedbackPostgresPort/);
  assert.match(postgres, /@neondatabase\/serverless/);
  assert.match(postgres, /WORLD_DATABASE_URL/);
  assert.doesNotMatch(postgres, /process\.env\.DATABASE_URL/);
  assert.match(postgres, /not-configured/);
  assert.match(postgres, /ON CONFLICT \(brief_id\)/);
  assert.doesNotMatch(store + postgres, /google|sheet|localStorage/i);
});

test('WORLD-10. navegación general expone World', () => {
  const nav = readFileSync(join(process.cwd(), 'lib/constants/navigation.ts'), 'utf8');
  assert.match(nav, /label: 'World'/);
  assert.match(nav, /href: '\/world'/);
  assert.match(nav, /icon: 'world'/);
});

test('WORLD-11. Biblioteca preserva historia sin mezclarla con la edición actual', () => {
  const surface = parseWorldSurfaceSnapshot(JSON.parse(surfaceText()));
  assert.ok(surface);

  const currentIds = new Set(
    [...surface.now.items, ...surface.learn.items].map((item) => item.briefId),
  );
  const libraryIds = new Set(surface.library.items.map((item) => item.briefId));

  assert.equal(currentIds.size, 3);
  assert.equal(libraryIds.size, 5);
  for (const id of currentIds) assert.ok(libraryIds.has(id));

  assert.ok(
    surface.library.items.some(
      (item) =>
        item.briefId === 'WORLD-PILOT-CRISPR-2026-10-03' &&
        item.sourceCommit === '4ef65a46b3da9bcd2af11fc64091114ec53b29be',
    ),
  );

  const ui = readFileSync(join(process.cwd(), 'components/world/WorldSurface.tsx'), 'utf8');
  const article = readFileSync(join(process.cwd(), 'components/world/WorldPiece.tsx'), 'utf8');
  assert.match(ui, /snapshot\.library\.items/);
  assert.match(article, /section\.title \?/);
});

test('WORLD-12. Pirámide Temporal falla cerrado y conserva cobertura explícita', () => {
  const indexRaw = readFileSync(join(root, 'temporal', 'index.json'), 'utf8');
  const periodRaw = readFileSync(
    join(root, 'temporal', 'periods', 'day', '2026-10-05.json'),
    'utf8',
  );

  const index = parseWorldTemporalIndex(JSON.parse(indexRaw));
  const period = parseWorldTemporalPeriod(JSON.parse(periodRaw));
  assert.ok(index);
  assert.ok(period);

  assert.equal(index.latest.day?.periodKey, '2026-10-05');
  assert.equal(index.weeks.length, 4);
  assert.equal(index.months.length, 9);
  assert.equal(index.years.length, 1);
  assert.equal(selectWorldTemporalEntry(index, 'DAY'), null);
  assert.equal(selectWorldTemporalEntry(index, 'WEEK')?.periodKey, '2026-W40');
  assert.equal(selectWorldTemporalEntry(index, 'WEEK', '2026-W39')?.periodKey, '2026-W39');
  assert.equal(selectWorldTemporalEntry(index, 'MONTH', '2026-09')?.periodKey, '2026-09');
  assert.equal(selectWorldTemporalEntry(index, 'YEAR', '2025')?.periodKey, '2025');

  assert.equal(period.granularity, 'DAY');
  assert.equal(period.state, 'IN_PROGRESS');
  assert.equal(period.domains.length, 8);
  assert.ok(period.domains.every((domain) => domain.coverageState === 'COVERAGE_PARTIAL'));
  assert.ok(period.domains.every((domain) => domain.outcome === 'COVERAGE_PARTIAL'));
  assert.equal(period.topStoryBriefIds.length, 3);
  assert.match(period.transitionNote ?? '', /coverage pass completo/i);

  assert.equal(parseWorldTemporalIndex({}), null);
  assert.equal(
    parseWorldTemporalPeriod({
      ...JSON.parse(periodRaw),
      domains: JSON.parse(periodRaw).domains.map((domain: Record<string, unknown>) => ({
        ...domain,
        coverageState: 'COVERAGE_PARTIAL',
        outcome: 'NO_MATERIAL_CHANGE',
      })),
    }),
    null,
  );
});

test('WORLD-13. navegación temporal expone Día, Semana, Mes y Año sin crear backlog', () => {
  const nav = readFileSync(join(process.cwd(), 'components/world/WorldNavigation.tsx'), 'utf8');
  const temporal = readFileSync(join(process.cwd(), 'components/world/WorldTemporal.tsx'), 'utf8');
  const weekPage = readFileSync(
    join(process.cwd(), 'app/(app)/world/ahora/semana/page.tsx'),
    'utf8',
  );

  assert.match(nav, /Día/);
  assert.match(nav, /Semana/);
  assert.match(nav, /Mes/);
  assert.match(nav, /Año/);
  assert.match(nav, /\/world\/ahora\/semana/);
  assert.match(nav, /\/world\/ahora\/mes/);
  assert.match(nav, /\/world\/ahora\/ano/);
  assert.match(temporal, /Archivo retrospectivo/);
  assert.match(temporal, /Sobre esta edición/);
  assert.match(temporal, /Lo que importa de este período/);
  assert.match(temporal, /materialDomains/);
  assert.match(temporal, /En seguimiento/);
  assert.doesNotMatch(temporal, /coverage-summary/);
  assert.match(temporal, /data\.index\.weeks/);
  assert.match(weekPage, /searchParams/);
  assert.match(weekPage, /getWorldTemporalPageData\('WEEK', period\)/);
  assert.doesNotMatch(temporal, /unread count|infinite scroll|streak/i);
});
