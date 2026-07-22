/**
 * Tests 8C — navegación, enlaces, búsqueda y rutas documentales (fixtures).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { primaryNav, secondaryNav } from '@/lib/constants/navigation';
import {
  buildSourcePageIndex,
  isSafeExternalHttpsUrl,
  resolveContentHref,
} from '@/lib/web-catalog/links';
import { buildAppNavigation, listNavigableCatalogEntries } from '@/lib/web-catalog/navigation';
import { canNavigateWebCatalogEntry, canSearchWebCatalogEntry } from '@/lib/web-catalog/policy';
import {
  buildSearchableDocument,
  searchWebCatalogDocuments,
  type SearchableDocument,
} from '@/lib/web-catalog/search';
import {
  WEB_CATALOG_FIXED_ROUTES,
  WEB_CATALOG_SECTION_LABELS,
} from '@/lib/web-catalog/section-labels';
import type { ContentPage } from '@/types/content';
import type { WebCatalogEntry } from '@/types/web-catalog';

const PAGE_A = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PAGE_B = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee';
const PAGE_PRIVATE = 'cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee';
const PAGE_LEGACY = 'dddddddd-bbbb-cccc-dddd-eeeeeeeeeeee';
const PAGE_HIDDEN = 'eeeeeeee-bbbb-cccc-dddd-eeeeeeeeeeee';

function entry(overrides: Partial<WebCatalogEntry> = {}): WebCatalogEntry {
  return {
    stableKey: 'fixture.doc',
    editorialName: 'Documento visible',
    sourceRef: `notion:${PAGE_A}`,
    status: 'published',
    canonical: true,
    replacesResourceKey: null,
    section: 'reference',
    slug: 'documento-visible',
    aliases: ['doc-alias'],
    navigationPlacement: 'primary',
    navigationOrder: 2,
    renderMode: 'document',
    privacy: 'general',
    policy: {
      visibleWeb: true,
      searchable: true,
      generalAI: 'allowed',
      reviewAI: 'allowed',
      writeMode: 'none',
      confirmation: 'none',
    },
    ...overrides,
  };
}

function pageFixture(overrides: Partial<ContentPage> = {}): ContentPage {
  return {
    stableKey: 'fixture.doc',
    slug: 'documento-visible',
    title: 'Documento visible',
    icon: null,
    lastEditedAt: null,
    renderMode: 'document',
    section: 'reference',
    policy: {
      visibleWeb: true,
      searchable: true,
      generalAI: 'allowed',
      reviewAI: 'allowed',
    },
    blocks: [
      {
        localId: 'b1',
        type: 'paragraph',
        text: [{ plain: 'Texto de productividad personal', href: null }],
        checked: null,
        language: null,
        link: null,
        asset: null,
        childPageSlug: null,
        childPageTitle: null,
        children: [],
      },
      {
        localId: 'b2',
        type: 'heading_1',
        text: [{ plain: 'Sección foco', href: null }],
        checked: null,
        language: null,
        link: null,
        asset: null,
        childPageSlug: null,
        childPageTitle: null,
        children: [],
      },
    ],
    childPages: [],
    provenance: { source: 'web-catalog', fetchedAt: '2026-07-22T00:00:00.000Z' },
    ...overrides,
  };
}

test('8C-1. enlace interno publicado → /p/[slug]', () => {
  const published = entry();
  const index = buildSourcePageIndex([published]);
  const resolved = resolveContentHref(
    `https://app.notion.com/workspace/Page-${PAGE_A.replace(/-/g, '')}`,
    index,
  );
  assert.deepEqual(resolved, { kind: 'internal', href: '/p/documento-visible' });
});

test('8C-2. enlace interno oculto → sin href', () => {
  const hidden = entry({
    stableKey: 'fixture.hidden',
    status: 'hidden',
    canonical: false,
    slug: 'oculto',
    sourceRef: `notion:${PAGE_HIDDEN}`,
    navigationPlacement: 'none',
    policy: {
      visibleWeb: false,
      searchable: false,
      generalAI: 'denied',
      reviewAI: 'denied',
      writeMode: 'none',
      confirmation: 'none',
    },
  });
  const resolved = resolveContentHref(
    `https://www.notion.so/${PAGE_HIDDEN.replace(/-/g, '')}`,
    buildSourcePageIndex([hidden]),
  );
  assert.equal(resolved.kind, 'unavailable');
});

test('8C-3. enlace privado → sin href', () => {
  const priv = entry({
    stableKey: 'fixture.private-journaling',
    editorialName: 'Journaling',
    privacy: 'private',
    renderMode: 'private',
    slug: 'private-journaling',
    sourceRef: `notion:${PAGE_PRIVATE}`,
    policy: {
      visibleWeb: false,
      searchable: false,
      generalAI: 'denied',
      reviewAI: 'explicit-authorization',
      writeMode: 'none',
      confirmation: 'none',
    },
  });
  assert.equal(
    resolveContentHref(
      `https://notion.so/${PAGE_PRIVATE.replace(/-/g, '')}`,
      buildSourcePageIndex([priv]),
    ).kind,
    'unavailable',
  );
});

test('8C-4. enlace legacy → sin href', () => {
  const legacy = entry({
    status: 'legacy',
    canonical: false,
    slug: 'legacy-doc',
    sourceRef: `notion:${PAGE_LEGACY}`,
  });
  assert.equal(
    resolveContentHref(
      `https://www.notion.so/${PAGE_LEGACY.replace(/-/g, '')}`,
      buildSourcePageIndex([legacy]),
    ).kind,
    'unavailable',
  );
});

test('8C-5. URL interna desconocida → no expuesta', () => {
  const resolved = resolveContentHref(
    `https://app.notion.com/${PAGE_B.replace(/-/g, '')}`,
    buildSourcePageIndex([entry()]),
  );
  assert.equal(resolved.kind, 'unavailable');
  assert.equal('href' in resolved && (resolved as { href?: string }).href, false);
});

test('8C-6. enlace externo HTTPS válido', () => {
  assert.deepEqual(resolveContentHref('https://example.com/docs', new Map()), {
    kind: 'external',
    href: 'https://example.com/docs',
  });
  assert.equal(isSafeExternalHttpsUrl('https://example.com/a'), true);
});

test('8C-7. enlace inseguro rechazado', () => {
  assert.equal(resolveContentHref('http://example.com', new Map()).kind, 'none');
  assert.equal(resolveContentHref('javascript:alert(1)', new Map()).kind, 'none');
  assert.equal(isSafeExternalHttpsUrl('http://example.com'), false);
});

test('8C-8. navegación dinámica válida', () => {
  const docs = [
    entry({ navigationOrder: 1, editorialName: 'Norte actual', slug: 'norte-actual' }),
    entry({
      stableKey: 'fixture.exp',
      editorialName: 'Experimentos',
      slug: 'experimentos',
      sourceRef: `notion:${PAGE_B}`,
      navigationPlacement: 'secondary',
      navigationOrder: 0,
    }),
  ];
  const nav = buildAppNavigation(true, docs);
  assert.ok(nav.primary.some((item) => item.href === '/p/norte-actual'));
  assert.ok(nav.secondary.some((item) => item.href === '/p/experimentos'));
  assert.ok(nav.primary.some((item) => item.href === '/buscar'));
});

test('8C-9. orden de navegación', () => {
  const docs = [
    entry({
      stableKey: 'a',
      slug: 'segundo',
      editorialName: 'Segundo',
      navigationOrder: 2,
      sourceRef: `notion:${PAGE_A}`,
    }),
    entry({
      stableKey: 'b',
      slug: 'primero',
      editorialName: 'Primero',
      navigationOrder: 1,
      sourceRef: `notion:${PAGE_B}`,
    }),
  ];
  const listed = listNavigableCatalogEntries(docs);
  assert.deepEqual(
    listed.map((e) => e.slug),
    ['primero', 'segundo'],
  );
});

test('8C-10. exclusión hidden/private/legacy/excluded de navegación', () => {
  assert.equal(canNavigateWebCatalogEntry(entry({ status: 'hidden', canonical: false })), false);
  assert.equal(canNavigateWebCatalogEntry(entry({ privacy: 'private' })), false);
  assert.equal(canNavigateWebCatalogEntry(entry({ status: 'legacy', canonical: false })), false);
  assert.equal(canNavigateWebCatalogEntry(entry({ privacy: 'excluded' })), false);
  assert.equal(canNavigateWebCatalogEntry(entry({ renderMode: 'area' })), false);
});

test('8C-11. feature flag apagada conserva menú actual', () => {
  const nav = buildAppNavigation(false, [entry()]);
  assert.deepEqual(
    nav.primary.map((i) => i.href),
    primaryNav.map((i) => i.href),
  );
  assert.deepEqual(
    nav.secondary.map((i) => i.href),
    secondaryNav.map((i) => i.href),
  );
  assert.equal(
    nav.primary.some((i) => i.href.startsWith('/p/')),
    false,
  );
});

test('8C-12. breadcrumbs usan sección sanitizada', () => {
  const page = pageFixture();
  assert.equal(WEB_CATALOG_SECTION_LABELS[page.section], 'Referencia');
  assert.equal(page.title, 'Documento visible');
});

test('8C-13. búsqueda por título', () => {
  const published = entry();
  const doc = buildSearchableDocument(published, pageFixture());
  assert.ok(doc);
  const hits = searchWebCatalogDocuments([doc!], 'Documento', [published]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.href, '/p/documento-visible');
});

test('8C-14. búsqueda por contenido', () => {
  const published = entry();
  const doc = buildSearchableDocument(published, pageFixture());
  const hits = searchWebCatalogDocuments([doc!], 'productividad personal', [published]);
  assert.equal(hits.length, 1);
  assert.ok(hits[0]?.snippet.toLowerCase().includes('productividad'));
});

test('8C-15. exclusión de Journaling en búsqueda', () => {
  const journaling = entry({
    stableKey: 'fixture.private-journaling',
    editorialName: 'Journaling',
    privacy: 'private',
    renderMode: 'private',
    slug: 'private-journaling',
    policy: {
      visibleWeb: false,
      searchable: false,
      generalAI: 'denied',
      reviewAI: 'explicit-authorization',
      writeMode: 'none',
      confirmation: 'none',
    },
  });
  assert.equal(canSearchWebCatalogEntry(journaling), false);
  assert.equal(buildSearchableDocument(journaling, pageFixture({ title: 'Journaling' })), null);
});

test('8C-16. exclusión de no-searchable', () => {
  const closed = entry({
    policy: {
      visibleWeb: true,
      searchable: false,
      generalAI: 'denied',
      reviewAI: 'denied',
      writeMode: 'none',
      confirmation: 'none',
    },
  });
  assert.equal(canSearchWebCatalogEntry(closed), false);
});

test('8C-17. snippets limitados', () => {
  const published = entry();
  const longBody = 'x'.repeat(500);
  const doc = buildSearchableDocument(
    published,
    pageFixture({
      blocks: [
        {
          localId: 'long',
          type: 'paragraph',
          text: [{ plain: longBody, href: null }],
          checked: null,
          language: null,
          link: null,
          asset: null,
          childPageSlug: null,
          childPageTitle: null,
          children: [],
        },
      ],
    }),
  );
  const hits = searchWebCatalogDocuments([doc!], 'xxx', [published]);
  assert.ok(hits[0]);
  assert.ok(hits[0]!.snippet.length <= 160);
  assert.equal(hits[0]!.href.includes('notion'), false);
  assert.equal(JSON.stringify(hits[0]).includes(PAGE_A), false);
});

test('8C-18. /aprendizaje resuelve por clave estable', () => {
  assert.equal(WEB_CATALOG_FIXED_ROUTES.aprendizaje.stableKey, 'aprendizaje');
  assert.equal(WEB_CATALOG_FIXED_ROUTES.aprendizaje.path, '/aprendizaje');
});

test('8C-19. /compras resuelve por clave estable', () => {
  assert.equal(WEB_CATALOG_FIXED_ROUTES.compras.stableKey, 'compras');
  assert.equal(WEB_CATALOG_FIXED_ROUTES.compras.path, '/compras');
});

test('8C-20. recurso no publicado no es navegable ni buscable', () => {
  const draft = entry({ status: 'draft', canonical: false });
  assert.equal(canNavigateWebCatalogEntry(draft), false);
  assert.equal(canSearchWebCatalogEntry(draft), false);
  assert.equal(canLoadViaPolicy(draft), false);
});

function canLoadViaPolicy(e: WebCatalogEntry): boolean {
  return e.status === 'published' && e.canonical && e.policy.visibleWeb && e.privacy === 'general';
}

test('8C-21. ausencia de URLs e IDs internos en resolución pública', () => {
  const published = entry();
  const resolved = resolveContentHref(
    `https://app.notion.com/Page-${PAGE_A.replace(/-/g, '')}`,
    buildSourcePageIndex([published]),
  );
  assert.equal(resolved.kind, 'internal');
  if (resolved.kind !== 'internal') return;
  assert.equal(resolved.href.includes('notion'), false);
  assert.equal(resolved.href.includes(PAGE_A), false);
  assert.equal(resolved.href.startsWith('/p/'), true);
});

test('8C-22. query vacía no produce hits', () => {
  const published = entry();
  const doc = buildSearchableDocument(published, pageFixture());
  assert.deepEqual(searchWebCatalogDocuments([doc!], '   ', [published]), []);
});

test('8C-23. claves fijas no se duplican en nav dinámica', () => {
  const fixed = entry({
    stableKey: 'aprendizaje',
    slug: 'aprendizaje',
    editorialName: 'Aprendizaje',
  });
  const listed = listNavigableCatalogEntries([fixed, entry()]);
  assert.equal(
    listed.some((e) => e.stableKey === 'aprendizaje'),
    false,
  );
});

function staleIndexStillHas(published: WebCatalogEntry) {
  return [buildSearchableDocument(published, pageFixture())!];
}

test('8C-24. índice stale + catálogo hidden → sin resultados', () => {
  const wasPublished = entry();
  const staleDocs = staleIndexStillHas(wasPublished);
  const nowHidden = entry({ status: 'hidden', canonical: false });
  assert.equal(searchWebCatalogDocuments(staleDocs, 'Documento', [nowHidden]).length, 0);
});

test('8C-25. índice stale + catálogo private → sin resultados', () => {
  const wasPublished = entry();
  const staleDocs = staleIndexStillHas(wasPublished);
  const nowPrivate = entry({
    privacy: 'private',
    renderMode: 'private',
    policy: {
      visibleWeb: false,
      searchable: false,
      generalAI: 'denied',
      reviewAI: 'explicit-authorization',
      writeMode: 'none',
      confirmation: 'none',
    },
  });
  assert.equal(searchWebCatalogDocuments(staleDocs, 'Documento', [nowPrivate]).length, 0);
});

test('8C-26. índice stale + catálogo legacy → sin resultados', () => {
  const wasPublished = entry();
  const staleDocs = staleIndexStillHas(wasPublished);
  const nowLegacy = entry({ status: 'legacy', canonical: false });
  assert.equal(searchWebCatalogDocuments(staleDocs, 'Documento', [nowLegacy]).length, 0);
});

test('8C-27. índice stale + catálogo excluded → sin resultados', () => {
  const wasPublished = entry();
  const staleDocs = staleIndexStillHas(wasPublished);
  const nowExcluded = entry({
    status: 'excluded',
    canonical: false,
    privacy: 'excluded',
    policy: {
      visibleWeb: false,
      searchable: false,
      generalAI: 'denied',
      reviewAI: 'denied',
      writeMode: 'none',
      confirmation: 'none',
    },
  });
  assert.equal(searchWebCatalogDocuments(staleDocs, 'Documento', [nowExcluded]).length, 0);
});

test('8C-28. índice stale + searchable=false → sin resultados', () => {
  const wasPublished = entry();
  const staleDocs = staleIndexStillHas(wasPublished);
  const nowClosed = entry({
    policy: {
      visibleWeb: true,
      searchable: false,
      generalAI: 'allowed',
      reviewAI: 'allowed',
      writeMode: 'none',
      confirmation: 'none',
    },
  });
  assert.equal(searchWebCatalogDocuments(staleDocs, 'Documento', [nowClosed]).length, 0);
});

test('8C-29. índice stale + visibleWeb=false → sin resultados', () => {
  const wasPublished = entry();
  const staleDocs = staleIndexStillHas(wasPublished);
  const nowInvisible = entry({
    policy: {
      visibleWeb: false,
      searchable: true,
      generalAI: 'allowed',
      reviewAI: 'allowed',
      writeMode: 'none',
      confirmation: 'none',
    },
  });
  assert.equal(searchWebCatalogDocuments(staleDocs, 'Documento', [nowInvisible]).length, 0);
});

test('8C-30. índice stale + canonical=false → sin resultados', () => {
  const wasPublished = entry();
  const staleDocs = staleIndexStillHas(wasPublished);
  const nowNonCanonical = entry({ canonical: false });
  assert.equal(searchWebCatalogDocuments(staleDocs, 'Documento', [nowNonCanonical]).length, 0);
});

test('8C-31. recurso todavía publicado sigue apareciendo con índice stale', () => {
  const stillPublished = entry();
  const other = entry({
    stableKey: 'fixture.other',
    slug: 'otro-doc',
    editorialName: 'Otro',
    sourceRef: `notion:${PAGE_B}`,
  });
  const staleDocs = [
    ...staleIndexStillHas(stillPublished),
    buildSearchableDocument(other, pageFixture({ title: 'Otro', slug: 'otro-doc' }))!,
  ];
  const hits = searchWebCatalogDocuments(staleDocs, 'Documento', [stillPublished, other]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.href, '/p/documento-visible');
});

test('8C-32. Journaling en índice stale nunca aparece', () => {
  const journaling = entry({
    stableKey: 'fixture.private-journaling',
    editorialName: 'Journaling',
    privacy: 'private',
    renderMode: 'private',
    slug: 'private-journaling',
    policy: {
      visibleWeb: false,
      searchable: false,
      generalAI: 'denied',
      reviewAI: 'explicit-authorization',
      writeMode: 'none',
      confirmation: 'none',
    },
  });
  const staleDoc: SearchableDocument = {
    stableKey: journaling.stableKey,
    title: 'Journaling',
    section: 'private',
    aliases: [],
    href: '/p/private-journaling',
    body: 'entrada privada',
  };
  assert.equal(searchWebCatalogDocuments([staleDoc], 'Journaling', [journaling]).length, 0);
  assert.equal(searchWebCatalogDocuments([staleDoc], 'Journaling', [entry()]).length, 0);
});

test('8C-33. ausente del catálogo actual se descarta del índice stale', () => {
  const wasPublished = entry();
  const staleDocs = staleIndexStillHas(wasPublished);
  assert.equal(searchWebCatalogDocuments(staleDocs, 'Documento', []).length, 0);
});
