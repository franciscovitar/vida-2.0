import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  parseIntelligenceArticle,
  parseIntelligenceEditorialSnapshot,
  resolveIntelligenceArticleText,
  resolveIntelligenceEditorialSnapshotText,
} from '@/lib/intelligence/contract';
import type { IntelligenceArticleSummary } from '@/types/intelligence-editorial';

const generatedRoot = join(process.cwd(), 'data', 'generated');
const snapshotPath = join(generatedRoot, 'intelligence-editorial-snapshot.json');

function snapshotText(): string {
  return readFileSync(snapshotPath, 'utf8');
}

test('INT-01. índice V2 válido, sanitizado y sin deuda de lectura', () => {
  const raw = snapshotText();
  const parsed = parseIntelligenceEditorialSnapshot(JSON.parse(raw));

  assert.ok(parsed);
  assert.equal(parsed.source.repository, 'franciscovitar/personal-ai-system');
  assert.match(parsed.source.commit, /^[a-f0-9]{40}$/);
  assert.equal(parsed.readingDebt, false);
  assert.deepEqual(Object.keys(parsed.current), ['ia', 'carrera', 'tecnologia', 'pas']);
  assert.doesNotMatch(raw, /NOTION_API_TOKEN|GOOGLE_PRIVATE_KEY|AUTH_SECRET/);
  assert.doesNotMatch(raw, /drive\.google\.com/i);
});

test('INT-02. índice faltante o corrupto falla cerrado', () => {
  const missing = resolveIntelligenceEditorialSnapshotText(null, new Date('2026-09-21T12:00:00Z'));
  assert.equal(missing.status, 'missing');
  assert.equal(missing.snapshot, null);

  const invalid = resolveIntelligenceEditorialSnapshotText('{', new Date('2026-09-21T12:00:00Z'));
  assert.equal(invalid.status, 'invalid');
  assert.equal(invalid.snapshot, null);
});

test('INT-03. frescura del índice se hace visible sin borrar el archivo', () => {
  const fresh = resolveIntelligenceEditorialSnapshotText(
    snapshotText(),
    new Date('2026-09-21T12:00:00Z'),
  );
  assert.equal(fresh.status, 'ready');
  assert.equal(fresh.stale, false);

  const stale = resolveIntelligenceEditorialSnapshotText(
    snapshotText(),
    new Date('2026-12-01T12:00:00Z'),
  );
  assert.equal(stale.status, 'ready');
  assert.equal(stale.stale, true);
  assert.match(stale.notice ?? '', /refresh/i);
  assert.equal(stale.snapshot?.archive.length, 4);
});

test('INT-04. current resuelve al archivo y cada artículo coincide con provenance', () => {
  const snapshot = parseIntelligenceEditorialSnapshot(JSON.parse(snapshotText()));
  assert.ok(snapshot);

  for (const [front, articleId] of Object.entries(snapshot.current)) {
    const summary: IntelligenceArticleSummary | undefined = snapshot.archive.find(
      (item) => item.id === articleId,
    );
    assert.ok(summary);
    assert.equal(summary.front, front);

    const path = join(
      generatedRoot,
      'intelligence',
      'articles',
      summary.front,
      `${summary.slug}.json`,
    );
    const raw = readFileSync(path, 'utf8');
    const article = parseIntelligenceArticle(JSON.parse(raw));
    assert.ok(article);
    assert.equal(article.source.commit, snapshot.source.commit);
    assert.equal(article.source.ref, snapshot.source.ref);
    assert.equal(article.source.canonicalRef, summary.articleRef);

    const resolved = resolveIntelligenceArticleText(
      raw,
      summary,
      snapshot,
      new Date('2026-09-21T12:00:00Z'),
    );
    assert.equal(resolved.status, 'ready');
  }
});

test('INT-05. portada es editorial y no repite el dashboard Profesional', () => {
  const source = readFileSync(
    join(process.cwd(), 'components/intelligence/IntelligenceDashboard.tsx'),
    'utf8',
  );

  assert.match(source, /IA esta semana/);
  assert.match(source, /Carrera & futuro/);
  assert.match(source, /Tecnología explicada/);
  assert.match(source, /Tu PAS/);
  assert.match(source, /Archivo editorial/);
  assert.doesNotMatch(source, /Tu radar ahora|Carrera & Skills|Tech & Open Source Radar/);
  assert.doesNotMatch(source, /\.priorities|\.technologies|nowMoves/);
  assert.doesNotMatch(source, /streak|racha|unread count|\d+ sin leer/i);
});

test('INT-06. Inteligencia ya no carga ni deriva el snapshot Profesional', () => {
  const source = readFileSync(join(process.cwd(), 'lib/data/intelligence-source.ts'), 'utf8');
  const dashboard = readFileSync(
    join(process.cwd(), 'components/intelligence/IntelligenceDashboard.tsx'),
    'utf8',
  );

  assert.doesNotMatch(source, /loadProfessionalSnapshot/);
  assert.doesNotMatch(dashboard, /ProfessionalIntelligenceData|professional\.snapshot/);
  assert.match(dashboard, /href="\/professional"/);
});

test('INT-07. artículos y archivo son rutas separadas, dinámicas y autenticadas', () => {
  const articleRoute = readFileSync(
    join(process.cwd(), 'app/(app)/inteligencia/[front]/[slug]/page.tsx'),
    'utf8',
  );
  const archiveRoute = readFileSync(
    join(process.cwd(), 'app/(app)/inteligencia/archivo/page.tsx'),
    'utf8',
  );
  const source = readFileSync(join(process.cwd(), 'lib/data/intelligence-source.ts'), 'utf8');

  assert.match(articleRoute, /export const dynamic = 'force-dynamic'/);
  assert.match(archiveRoute, /export const dynamic = 'force-dynamic'/);
  assert.match(source, /requireAuthorizedSession/);
  assert.match(source, /getIntelligenceArticleData/);
  assert.match(source, /getIntelligenceArchiveData/);
});

test('INT-08. archivo es biblioteca persistente, no backlog', () => {
  const raw = snapshotText();
  const archiveRoute = readFileSync(
    join(process.cwd(), 'app/(app)/inteligencia/archivo/page.tsx'),
    'utf8',
  );

  assert.match(archiveRoute, /No hay artículos pendientes ni deuda de lectura/);
  assert.doesNotMatch(raw + archiveRoute, /streak|racha|unread count|infinite scroll/i);
});

test('INT-09. Profesional deriva enlaces explicativos desde professionalRefs', () => {
  const dashboard = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalDashboard.tsx'),
    'utf8',
  );

  assert.match(dashboard, /findIntelligenceArticleForProfessionalRef/);
  assert.match(dashboard, /priority:\$\{item\.capability\}/);
  assert.match(dashboard, /technology:\$\{item\.id\}/);
  assert.match(dashboard, /Entender por qué/);
  assert.doesNotMatch(dashboard, /opentelemetry-explicado-sin-humo/);
});

test('INT-10. artículo vencido sigue disponible con advertencia', () => {
  const snapshot = parseIntelligenceEditorialSnapshot(JSON.parse(snapshotText()));
  assert.ok(snapshot);

  const summary = snapshot.archive.find((item) => item.front === 'ia');
  assert.ok(summary);

  const raw = readFileSync(
    join(
      generatedRoot,
      'intelligence',
      'articles',
      summary.front,
      `${summary.slug}.json`,
    ),
    'utf8',
  );

  const stale = resolveIntelligenceArticleText(
    raw,
    summary,
    snapshot,
    new Date('2026-10-02T12:00:00Z'),
  );
  assert.equal(stale.status, 'ready');
  assert.equal(stale.stale, true);
  assert.ok(stale.article);
  assert.match(stale.notice ?? '', /revalidación/i);
});
