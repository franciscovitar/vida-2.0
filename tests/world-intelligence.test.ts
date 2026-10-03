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
  assert.equal(parsed.now.items.length, 1);
  assert.equal(parsed.learn.items.length, 1);
  assert.ok(
    [...parsed.now.items, ...parsed.learn.items].every(
      (item) => item.publicationState === 'HUMAN_APPROVED',
    ),
  );
  assert.doesNotMatch(raw, /NOTION_API_TOKEN|GOOGLE_PRIVATE_KEY|AUTH_SECRET/);
});

test('WORLD-02. superficie faltante o corrupta falla cerrado', () => {
  assert.equal(resolveWorldSurfaceText(null).status, 'missing');
  assert.equal(resolveWorldSurfaceText('{').status, 'invalid');
});

test('WORLD-03. frescura se hace visible sin fabricar edición nueva', () => {
  const fresh = resolveWorldSurfaceText(
    surfaceText(),
    new Date('2026-10-03T18:00:00-03:00'),
  );
  assert.equal(fresh.status, 'ready');
  assert.equal(fresh.stale, false);

  const stale = resolveWorldSurfaceText(
    surfaceText(),
    new Date('2026-10-06T18:00:00-03:00'),
  );
  assert.equal(stale.status, 'ready');
  assert.equal(stale.stale, true);
  assert.match(stale.notice ?? '', /desactualizada/i);
});

test('WORLD-04. cada card resuelve exactamente a su pieza y provenance', () => {
  const surface = parseWorldSurfaceSnapshot(JSON.parse(surfaceText()));
  assert.ok(surface);

  for (const summary of [...surface.now.items, ...surface.learn.items]) {
    const raw = readFileSync(join(root, 'pieces', `${summary.slug}.json`), 'utf8');
    const piece = parseWorldPublishedPiece(JSON.parse(raw));
    assert.ok(piece);
    assert.equal(piece.source.commit, surface.source.commit);
    assert.equal(piece.source.ref, surface.source.ref);
    assert.equal(piece.source.canonicalRef, summary.pieceRef);
    assert.equal(piece.editorialDraftSha256, summary.editorialDraftSha256);
    assert.equal(
      resolveWorldPieceText(
        raw,
        summary,
        surface,
        new Date('2026-10-03T18:00:00-03:00'),
      ).status,
      'ready',
    );
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

test('WORLD-06. seis rutas y loader autenticado', () => {
  const paths = [
    'app/(app)/world/page.tsx',
    'app/(app)/world/ahora/page.tsx',
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

test('WORLD-09. feedback no finge persistencia antes de Phase 10', () => {
  const article = readFileSync(join(process.cwd(), 'components/world/WorldPiece.tsx'), 'utf8');
  assert.match(article, /Feedback explícito: Phase 10/);
  assert.doesNotMatch(article, /saveWorldFeedback|upsertWorldFeedback/);
});

test('WORLD-10. navegación general expone World', () => {
  const nav = readFileSync(join(process.cwd(), 'lib/constants/navigation.ts'), 'utf8');
  assert.match(nav, /label: 'World'/);
  assert.match(nav, /href: '\/world'/);
  assert.match(nav, /icon: 'world'/);
});
