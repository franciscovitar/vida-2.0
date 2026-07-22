/**
 * Tests 8B — Registro Web read-only (fixtures; sin Notion real).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { loadValidatedWebCatalogWithPort } from '@/lib/web-catalog/catalog-load';
import {
  extractNotionPageIdFromUrl,
  mapCatalogRawPage,
  mapCatalogRawPageResult,
  mapCatalogRawPages,
  parseCatalogAliases,
  parseNotionSourceRef,
  resolveCatalogProp,
  resolveSourcePageId,
  type CatalogRawPage,
} from '@/lib/web-catalog/catalog-mapper';
import { WEB_CATALOG_PROP_NAMES } from '@/lib/web-catalog/constants';
import {
  getWebCatalogNotionConfig,
  isAllowedWebCatalogDataSourceId,
  isWebCatalogEnabled,
} from '@/lib/web-catalog/config';
import { adaptCatalogBlock, isSafeHttpUrl } from '@/lib/web-catalog/content-adapters';
import { readWebCatalogContentPage } from '@/lib/web-catalog/content-reader';
import { buildWebCatalogIndex, resolveWebCatalogPath } from '@/lib/web-catalog/index';
import type {
  CatalogRawBlock,
  WebCatalogBlocksResult,
  WebCatalogNotionPort,
  WebCatalogPageMetaResult,
  WebCatalogQueryResult,
} from '@/lib/web-catalog/notion-port';
import {
  canLoadWebCatalogContent,
  isPrivateWebCatalogEntry,
  usesGenericDocumentRenderer,
} from '@/lib/web-catalog/policy';
import { validateWebCatalog } from '@/lib/web-catalog/validator';
import type { WebCatalogEntry, WebCatalogRouteIndex } from '@/types/web-catalog';

function titleProp(text: string) {
  return { type: 'title', title: [{ plain_text: text }] };
}
function rich(text: string) {
  return { type: 'rich_text', rich_text: [{ plain_text: text }] };
}
function select(name: string) {
  return { type: 'select', select: { name } };
}
function checkbox(value: boolean) {
  return { type: 'checkbox', checkbox: value };
}
function multi(names: string[]) {
  return { type: 'multi_select', multi_select: names.map((name) => ({ name })) };
}
function number(value: number) {
  return { type: 'number', number: value };
}
function relation(ids: string[]) {
  return { type: 'relation', relation: ids.map((id) => ({ id })) };
}
function url(value: string | null) {
  return { type: 'url', url: value };
}

const FIXTURE_PAGE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const FIXTURE_PAGE_ID_HEX = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const FIXTURE_NOTION_URL = `https://www.notion.so/Fixture-Page-${FIXTURE_PAGE_ID_HEX}`;

function technicalProps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Name: titleProp('Guía'),
    stableKey: rich('fixture.guide'),
    sourceRef: url(FIXTURE_NOTION_URL),
    status: select('published'),
    canonical: checkbox(true),
    replacesResourceKey: rich(''),
    section: select('reference'),
    slug: rich('guia'),
    aliases: rich('guia-vieja'),
    navigationPlacement: select('primary'),
    navigationOrder: number(2),
    renderMode: select('document'),
    privacy: select('general'),
    visibleWeb: checkbox(true),
    searchable: checkbox(true),
    generalAI: select('allowed'),
    reviewAI: select('allowed'),
    writeMode: select('none'),
    confirmation: select('none'),
    ...overrides,
  };
}

function editorialProps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    'Nombre editorial': titleProp('Guía'),
    'Clave estable': rich('fixture.guide'),
    'Página origen': relation([FIXTURE_PAGE_ID]),
    Estado: select('published'),
    Canónico: checkbox(true),
    Reemplaza: rich(''),
    Sección: select('reference'),
    Slug: rich('guia'),
    Alias: multi(['guia-vieja']),
    Navegación: select('primary'),
    Orden: number(2),
    Renderer: select('document'),
    Privacidad: select('general'),
    'Visible web': checkbox(true),
    Buscable: checkbox(true),
    'IA general': select('allowed'),
    'IA revisión': select('allowed'),
    Escritura: select('none'),
    Confirmación: select('none'),
    ...overrides,
  };
}

function rawPage(id: string, properties: Record<string, unknown>): CatalogRawPage {
  return { id, properties };
}

function publishedDocument(overrides: Partial<WebCatalogEntry> = {}): WebCatalogEntry {
  return {
    stableKey: 'fixture.doc',
    editorialName: 'Documento visible',
    sourceRef: 'notion:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    status: 'published',
    canonical: true,
    replacesResourceKey: null,
    section: 'reference',
    slug: 'documento-visible',
    aliases: ['doc-alias'],
    navigationPlacement: 'primary',
    navigationOrder: 1,
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

function journalingFixture(): WebCatalogEntry {
  return {
    stableKey: 'fixture.private-journaling',
    editorialName: 'Journaling',
    sourceRef: 'notion:11111111-2222-3333-4444-555555555555',
    status: 'hidden',
    canonical: true,
    replacesResourceKey: null,
    section: 'private',
    slug: 'private-journaling',
    aliases: [],
    navigationPlacement: 'none',
    navigationOrder: null,
    renderMode: 'private',
    privacy: 'private',
    policy: {
      visibleWeb: false,
      searchable: false,
      generalAI: 'denied',
      reviewAI: 'explicit-authorization',
      writeMode: 'none',
      confirmation: 'none',
    },
  };
}

function requireIndex(entries: readonly WebCatalogEntry[]): WebCatalogRouteIndex {
  const built = buildWebCatalogIndex(entries);
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error('expected valid index');
  return built.index;
}

function createFakePort(options: {
  pages?: CatalogRawPage[];
  blocksById?: Record<string, CatalogRawBlock[]>;
  metaById?: Record<string, WebCatalogPageMetaResult>;
  failQuery?: WebCatalogQueryResult;
}): WebCatalogNotionPort {
  return {
    async queryCatalogDataSource(): Promise<WebCatalogQueryResult> {
      if (options.failQuery) return options.failQuery;
      return { ok: true, pages: options.pages ?? [] };
    },
    async retrievePageMeta(pageId: string): Promise<WebCatalogPageMetaResult> {
      return (
        options.metaById?.[pageId] ?? {
          ok: true,
          title: 'Título fixture',
          icon: null,
          lastEditedAt: '2026-07-21T00:00:00.000Z',
        }
      );
    },
    async listBlockChildren(blockId: string): Promise<WebCatalogBlocksResult> {
      return { ok: true, blocks: options.blocksById?.[blockId] ?? [] };
    },
  };
}

test('8B-R1. mapeo válido desde respuestas simuladas (nombres técnicos)', () => {
  const page = rawPage('page-1', technicalProps());
  const entry = mapCatalogRawPage(page);
  assert.ok(entry);
  assert.equal(entry?.stableKey, 'fixture.guide');
  assert.equal(entry?.slug, 'guia');
  assert.equal(entry?.sourceRef, `notion:${FIXTURE_PAGE_ID}`);
  assert.deepEqual(entry?.aliases, ['guia-vieja']);
  assert.equal(entry?.editorialName, 'Guía');
});

test('8B-R2. paginación del catálogo acumula páginas del puerto', async () => {
  const pages = [
    rawPage(
      '1',
      technicalProps({
        Name: titleProp('Uno'),
        stableKey: rich('k1'),
        slug: rich('uno'),
        status: select('hidden'),
        canonical: checkbox(false),
        aliases: rich(''),
        navigationPlacement: select('none'),
        visibleWeb: checkbox(false),
        searchable: checkbox(false),
        generalAI: select('denied'),
        reviewAI: select('denied'),
        sourceRef: url(`https://www.notion.so/Uno-${'11111111222233334444555555555555'}`),
      }),
    ),
    rawPage(
      '2',
      technicalProps({
        Name: titleProp('Dos'),
        stableKey: rich('k2'),
        slug: rich('dos'),
        status: select('hidden'),
        canonical: checkbox(false),
        aliases: rich(''),
        navigationPlacement: select('none'),
        visibleWeb: checkbox(false),
        searchable: checkbox(false),
        generalAI: select('denied'),
        reviewAI: select('denied'),
        sourceRef: url(`https://www.notion.so/Dos-${'22222222333344445555666666666666'}`),
      }),
    ),
  ];
  const mapped = mapCatalogRawPages(pages);
  assert.equal(mapped.length, 2);
});

test('8B-R3. catálogo inválido no indexa', async () => {
  const bad = publishedDocument({ slug: 'NO-VALIDO' });
  assert.equal(validateWebCatalog([bad]).valid, false);
  assert.equal(buildWebCatalogIndex([bad]).ok, false);
});

test('8B-R4. variable ausente con flag apagada no exige configuración', () => {
  assert.equal(isWebCatalogEnabled({}), false);
  assert.equal(getWebCatalogNotionConfig({}).ok, false);
});

test('8B-R5. flag activa sin configuración reporta not-configured', () => {
  assert.equal(isWebCatalogEnabled({ WEB_CATALOG_ENABLED: 'true' }), true);
  assert.deepEqual(getWebCatalogNotionConfig({ WEB_CATALOG_ENABLED: 'true' }), {
    ok: false,
    reason: 'not-configured',
  });
});

test('8B-R6. recurso oculto no se lee', () => {
  assert.equal(canLoadWebCatalogContent(publishedDocument({ status: 'hidden' })), false);
});

test('8B-R7. recurso legacy no se lee', () => {
  assert.equal(
    canLoadWebCatalogContent(publishedDocument({ status: 'legacy', canonical: false })),
    false,
  );
});

test('8B-R8. recurso privado no se lee', () => {
  const entry = journalingFixture();
  assert.equal(isPrivateWebCatalogEntry(entry), true);
  assert.equal(canLoadWebCatalogContent(entry), false);
});

test('8B-R9. Journaling no se lee por política tipada', () => {
  const entry = journalingFixture();
  assert.equal(canLoadWebCatalogContent(entry), false);
  assert.equal(usesGenericDocumentRenderer(entry), false);
});

test('8B-R10. recurso visible autorizado puede leerse', () => {
  assert.equal(canLoadWebCatalogContent(publishedDocument()), true);
  assert.equal(usesGenericDocumentRenderer(publishedDocument()), true);
});

test('8B-R11. paginación de bloques del lector', async () => {
  const pageId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const blocks: CatalogRawBlock[] = [
    {
      id: 'b1',
      type: 'paragraph',
      has_children: false,
      raw: { paragraph: { rich_text: [{ plain_text: 'Hola' }] } },
    },
    {
      id: 'b2',
      type: 'paragraph',
      has_children: false,
      raw: { paragraph: { rich_text: [{ plain_text: 'Mundo' }] } },
    },
  ];
  const port = createFakePort({
    blocksById: { [pageId]: blocks },
  });
  const result = await readWebCatalogContentPage(
    port,
    publishedDocument(),
    requireIndex([publishedDocument()]),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.page.blocks.length, 2);
});

test('8B-R12. recursión de hijos', async () => {
  const pageId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const port = createFakePort({
    blocksById: {
      [pageId]: [
        {
          id: 'toggle-1',
          type: 'toggle',
          has_children: true,
          raw: { toggle: { rich_text: [{ plain_text: 'Abrir' }] } },
        },
      ],
      'toggle-1': [
        {
          id: 'child-p',
          type: 'paragraph',
          has_children: false,
          raw: { paragraph: { rich_text: [{ plain_text: 'Dentro' }] } },
        },
      ],
    },
  });
  const index = requireIndex([publishedDocument()]);
  const result = await readWebCatalogContentPage(port, publishedDocument(), index);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.page.blocks[0]?.children.length, 1);
});

test('8B-R13. profundidad máxima detiene la recursión', async () => {
  const pageId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const blocksById: Record<string, CatalogRawBlock[]> = {
    [pageId]: [
      {
        id: 'd0',
        type: 'toggle',
        has_children: true,
        raw: { toggle: { rich_text: [{ plain_text: '0' }] } },
      },
    ],
  };
  for (let i = 0; i < 10; i += 1) {
    blocksById[`d${i}`] = [
      {
        id: `d${i + 1}`,
        type: 'toggle',
        has_children: true,
        raw: { toggle: { rich_text: [{ plain_text: String(i + 1) }] } },
      },
    ];
  }
  const port = createFakePort({ blocksById });
  const index = requireIndex([publishedDocument()]);
  const result = await readWebCatalogContentPage(port, publishedDocument(), index);
  assert.equal(result.ok, true);
});

test('8B-R14. límite de bloques se respeta', async () => {
  const pageId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const many = Array.from({ length: 450 }, (_, i) => ({
    id: `p${i}`,
    type: 'paragraph',
    has_children: false,
    raw: { paragraph: { rich_text: [{ plain_text: `n${i}` }] } },
  }));
  const port = createFakePort({ blocksById: { [pageId]: many } });
  const index = requireIndex([publishedDocument()]);
  const result = await readWebCatalogContentPage(port, publishedDocument(), index);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.page.blocks.length <= 400);
});

test('8B-R15. prevención de ciclos', async () => {
  const pageId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const port = createFakePort({
    blocksById: {
      [pageId]: [
        {
          id: 'loop',
          type: 'toggle',
          has_children: true,
          raw: { toggle: { rich_text: [{ plain_text: 'loop' }] } },
        },
      ],
      loop: [
        {
          id: 'loop',
          type: 'toggle',
          has_children: true,
          raw: { toggle: { rich_text: [{ plain_text: 'loop' }] } },
        },
      ],
    },
  });
  const index = requireIndex([publishedDocument()]);
  const result = await readWebCatalogContentPage(port, publishedDocument(), index);
  assert.equal(result.ok, true);
});

test('8B-R16. bloque desconocido se adapta a unsupported', () => {
  const adapted = adaptCatalogBlock(
    {
      id: 'x',
      type: 'video',
      has_children: false,
      raw: { video: {} },
    },
    0,
    [],
    null,
  );
  assert.equal(adapted.type, 'unsupported');
});

test('8B-R17. resolución por slug', () => {
  const entry = publishedDocument();
  const built = buildWebCatalogIndex([entry]);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(resolveWebCatalogPath(built.index, 'documento-visible')?.stableKey, entry.stableKey);
});

test('8B-R18. alias resuelve a la misma clave estable', () => {
  const entry = publishedDocument();
  const built = buildWebCatalogIndex([entry]);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const hit = resolveWebCatalogPath(built.index, 'doc-alias');
  assert.equal(hit?.matchedBy, 'alias');
  assert.equal(hit?.stableKey, entry.stableKey);
});

test('8B-R19. renderer especial no usa el genérico', () => {
  assert.equal(usesGenericDocumentRenderer(publishedDocument({ renderMode: 'health' })), false);
});

test('8B-R20. DTOs de contenido no incluyen IDs internos', async () => {
  const pageId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const port = createFakePort({
    blocksById: {
      [pageId]: [
        {
          id: 'notion-secret-id-should-not-leak',
          type: 'paragraph',
          has_children: false,
          raw: { paragraph: { rich_text: [{ plain_text: 'Hola' }] } },
        },
      ],
    },
  });
  const index = requireIndex([publishedDocument()]);
  const result = await readWebCatalogContentPage(port, publishedDocument(), index);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const json = JSON.stringify(result.page);
  assert.equal(json.includes('notion-secret-id-should-not-leak'), false);
  assert.equal(json.includes(pageId), false);
  assert.equal(result.page.provenance.source, 'web-catalog');
});

test('8B-R21. ausencia de métodos de escritura en el puerto', () => {
  const source = readFileSync(
    new URL('../lib/web-catalog/notion-port.ts', import.meta.url),
    'utf8',
  );
  assert.equal(
    /pages\.create|pages\.update|blocks\.children\.append|databases\.create/.test(source),
    false,
  );
  assert.match(source, /dataSources\.query/);
  assert.match(source, /blocks\.children\.list/);
});

test('8B-R22. allowlist del data source solo por entorno', () => {
  assert.equal(
    isAllowedWebCatalogDataSourceId('abc', { NOTION_WEB_CATALOG_DATA_SOURCE_ID: 'abc' }),
    true,
  );
  assert.equal(
    isAllowedWebCatalogDataSourceId('abc', { NOTION_WEB_CATALOG_DATA_SOURCE_ID: 'zzz' }),
    false,
  );
});

test('8B-R23. loadValidatedWebCatalogWithPort con puerto falso válido', async () => {
  const page = rawPage(
    '1',
    technicalProps({
      status: select('hidden'),
      canonical: checkbox(false),
      aliases: rich(''),
      navigationPlacement: select('none'),
      visibleWeb: checkbox(false),
      searchable: checkbox(false),
      generalAI: select('denied'),
      reviewAI: select('denied'),
    }),
  );
  const port = createFakePort({ pages: [page] });
  const result = await loadValidatedWebCatalogWithPort(port, 'ds-test');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]?.sourceRef, `notion:${FIXTURE_PAGE_ID}`);
});

test('8B-R24. URLs inseguras se descartan', () => {
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('https://example.com/a'), true);
});

test('8B-R25. parseNotionSourceRef', () => {
  assert.equal(parseNotionSourceRef(`notion:${FIXTURE_PAGE_ID}`)?.length, 36);
  assert.equal(parseNotionSourceRef('https://evil'), null);
});

test('8B-R26. compatibilidad con nombres editoriales anteriores', () => {
  const entry = mapCatalogRawPage(rawPage('ed-1', editorialProps()));
  assert.ok(entry);
  assert.equal(entry?.stableKey, 'fixture.guide');
  assert.equal(entry?.sourceRef, `notion:${FIXTURE_PAGE_ID}`);
  assert.deepEqual(entry?.aliases, ['guia-vieja']);
});

test('8B-R27. prioridad del nombre técnico cuando existen ambos', () => {
  const page = rawPage('both-1', {
    ...editorialProps({
      'Clave estable': rich('editorial.key'),
      Slug: rich('slug-editorial'),
      'Nombre editorial': titleProp('Editorial'),
    }),
    ...technicalProps({
      stableKey: rich('technical.key'),
      slug: rich('slug-tecnico'),
      Name: titleProp('Técnico'),
    }),
  });
  assert.equal(
    resolveCatalogProp(page, WEB_CATALOG_PROP_NAMES.stableKey),
    page.properties.stableKey,
  );
  const entry = mapCatalogRawPage(page);
  assert.equal(entry?.stableKey, 'technical.key');
  assert.equal(entry?.slug, 'slug-tecnico');
  assert.equal(entry?.editorialName, 'Técnico');
});

test('8B-R28. sourceRef válido como URL de Notion', () => {
  const resolved = resolveSourcePageId(url(FIXTURE_NOTION_URL));
  assert.deepEqual(resolved, { ok: true, pageId: FIXTURE_PAGE_ID });
  assert.equal(extractNotionPageIdFromUrl(FIXTURE_NOTION_URL), FIXTURE_PAGE_ID);
});

test('8B-R29. sourceRef válido como relation', () => {
  assert.deepEqual(resolveSourcePageId(relation([FIXTURE_PAGE_ID])), {
    ok: true,
    pageId: FIXTURE_PAGE_ID,
  });
});

test('8B-R30. URL de host no permitido', () => {
  assert.equal(extractNotionPageIdFromUrl(`https://evil.example/${FIXTURE_PAGE_ID_HEX}`), null);
  assert.deepEqual(resolveSourcePageId(url(`https://evil.example/${FIXTURE_PAGE_ID_HEX}`)), {
    ok: false,
    code: 'invalid-source-ref',
  });
});

test('8B-R31. URL de Notion malformada', () => {
  assert.equal(extractNotionPageIdFromUrl('https://www.notion.so/solo-titulo'), null);
  assert.deepEqual(
    mapCatalogRawPageResult(
      rawPage('bad-url', technicalProps({ sourceRef: url('https://www.notion.so/solo-titulo') })),
    ),
    {
      ok: false,
      code: 'invalid-source-ref',
    },
  );
});

test('8B-R32. sourceRef ausente', () => {
  const props = technicalProps();
  delete props.sourceRef;
  assert.deepEqual(mapCatalogRawPageResult(rawPage('no-src', props)), {
    ok: false,
    code: 'missing-source-ref',
  });
});

test('8B-R33. no se usa el ID de la propia fila del catálogo', () => {
  const catalogRowId = 'catalog-row-should-never-be-content';
  const props = technicalProps();
  delete props.sourceRef;
  const result = mapCatalogRawPageResult(rawPage(catalogRowId, props));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'missing-source-ref');
  assert.equal(mapCatalogRawPage(rawPage(catalogRowId, props)), null);
});

test('8B-R34. aliases rich_text con un alias', () => {
  assert.deepEqual(parseCatalogAliases(rich('unico-alias')), {
    ok: true,
    aliases: ['unico-alias'],
  });
});

test('8B-R35. aliases rich_text con varios alias, uno por línea', () => {
  assert.deepEqual(parseCatalogAliases(rich('alias-uno\nalias-dos\nalias-tres')), {
    ok: true,
    aliases: ['alias-uno', 'alias-dos', 'alias-tres'],
  });
});

test('8B-R36. aliases rich_text omite líneas vacías', () => {
  assert.deepEqual(parseCatalogAliases(rich('alias-a\n\n  \nalias-b\n')), {
    ok: true,
    aliases: ['alias-a', 'alias-b'],
  });
});

test('8B-R37. alias inválido no se acepta', () => {
  assert.deepEqual(parseCatalogAliases(rich('valido\n/invalido')), {
    ok: false,
    code: 'invalid-alias',
  });
  assert.deepEqual(
    mapCatalogRawPageResult(rawPage('bad-alias', technicalProps({ aliases: rich('/malo') }))),
    { ok: false, code: 'invalid-alias' },
  );
});

test('8B-R38. aliases como multi_select (compatibilidad)', () => {
  assert.deepEqual(parseCatalogAliases(multi(['legacy-a', 'legacy-b'])), {
    ok: true,
    aliases: ['legacy-a', 'legacy-b'],
  });
});

test('8B-R39. ausencia de URL o ID interno en el DTO público mapeado', () => {
  const entry = mapCatalogRawPage(rawPage('dto-1', technicalProps()));
  assert.ok(entry);
  const json = JSON.stringify(entry);
  assert.equal(json.includes(FIXTURE_NOTION_URL), false);
  assert.equal(json.includes('https://'), false);
  assert.equal(json.includes('www.notion.so'), false);
  assert.equal(entry?.sourceRef.startsWith('notion:'), true);
});

test('8B-R40. catálogo realista válido solo con datos ficticios', async () => {
  const pages = [
    rawPage(
      'row-a',
      technicalProps({
        Name: titleProp('Doc A'),
        stableKey: rich('fixture.doc-a'),
        slug: rich('doc-a'),
        aliases: rich('doc-a-old'),
        status: select('hidden'),
        canonical: checkbox(false),
        navigationPlacement: select('none'),
        visibleWeb: checkbox(false),
        searchable: checkbox(false),
        generalAI: select('denied'),
        reviewAI: select('denied'),
        sourceRef: url(`https://notion.so/${'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}`),
      }),
    ),
    rawPage(
      'row-b',
      technicalProps({
        Name: titleProp('Doc B'),
        stableKey: rich('fixture.doc-b'),
        slug: rich('doc-b'),
        aliases: rich(''),
        status: select('hidden'),
        canonical: checkbox(false),
        navigationPlacement: select('none'),
        visibleWeb: checkbox(false),
        searchable: checkbox(false),
        generalAI: select('denied'),
        reviewAI: select('denied'),
        sourceRef: url(`https://www.notion.so/Doc-B-${'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'}`),
      }),
    ),
  ];
  const port = createFakePort({ pages });
  const result = await loadValidatedWebCatalogWithPort(port, 'ds-fixture');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.entries.length, 2);
  for (const entry of result.entries) {
    assert.equal(entry.sourceRef.includes('https'), false);
    assert.match(entry.sourceRef, /^notion:[0-9a-f-]{36}$/);
  }
});

const FIXTURE_APP_NOTION_URL = `https://app.notion.com/workspace/Fixture-${FIXTURE_PAGE_ID_HEX}`;

test('8B-R41. https://app.notion.com/... aceptada', () => {
  assert.equal(extractNotionPageIdFromUrl(FIXTURE_APP_NOTION_URL), FIXTURE_PAGE_ID);
  assert.deepEqual(resolveSourcePageId(url(FIXTURE_APP_NOTION_URL)), {
    ok: true,
    pageId: FIXTURE_PAGE_ID,
  });
});

test('8B-R42. https://notion.so/... aceptada', () => {
  assert.equal(
    extractNotionPageIdFromUrl(`https://notion.so/${FIXTURE_PAGE_ID_HEX}`),
    FIXTURE_PAGE_ID,
  );
});

test('8B-R43. https://www.notion.so/... aceptada', () => {
  assert.equal(extractNotionPageIdFromUrl(FIXTURE_NOTION_URL), FIXTURE_PAGE_ID);
});

test('8B-R44. https://evil.app.notion.com/... rechazada', () => {
  assert.equal(
    extractNotionPageIdFromUrl(`https://evil.app.notion.com/${FIXTURE_PAGE_ID_HEX}`),
    null,
  );
  assert.deepEqual(resolveSourcePageId(url(`https://evil.app.notion.com/${FIXTURE_PAGE_ID_HEX}`)), {
    ok: false,
    code: 'invalid-source-ref',
  });
});

test('8B-R45. https://app-notion.com/... rechazada', () => {
  assert.equal(extractNotionPageIdFromUrl(`https://app-notion.com/${FIXTURE_PAGE_ID_HEX}`), null);
});

test('8B-R46. http://app.notion.com/... rechazada', () => {
  assert.equal(extractNotionPageIdFromUrl(`http://app.notion.com/${FIXTURE_PAGE_ID_HEX}`), null);
});

test('8B-R47. URL con credenciales rechazada', () => {
  assert.equal(
    extractNotionPageIdFromUrl(`https://user:secret@app.notion.com/Fixture-${FIXTURE_PAGE_ID_HEX}`),
    null,
  );
});

test('8B-R48. URL con puerto no estándar rechazada', () => {
  assert.equal(
    extractNotionPageIdFromUrl(`https://app.notion.com:8443/Fixture-${FIXTURE_PAGE_ID_HEX}`),
    null,
  );
});

test('8B-R49. sourceRef e IDs no aparecen en el DTO público', async () => {
  const entry = mapCatalogRawPage(
    rawPage('app-dto', technicalProps({ sourceRef: url(FIXTURE_APP_NOTION_URL) })),
  );
  assert.ok(entry);
  assert.equal(entry?.sourceRef, `notion:${FIXTURE_PAGE_ID}`);

  const pageId = 'notion-secret-id-should-not-leak';
  const port = createFakePort({
    blocksById: {
      [FIXTURE_PAGE_ID]: [
        {
          id: pageId,
          type: 'paragraph',
          has_children: false,
          raw: { paragraph: { rich_text: [{ plain_text: 'Hola', href: null }] } },
        },
      ],
    },
  });
  const index = requireIndex([entry!]);
  const result = await readWebCatalogContentPage(port, entry!, index);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const json = JSON.stringify(result.page);
  assert.equal(json.includes(FIXTURE_APP_NOTION_URL), false);
  assert.equal(json.includes('app.notion.com'), false);
  assert.equal(json.includes('https://'), false);
  assert.equal(json.includes(FIXTURE_PAGE_ID), false);
  assert.equal(json.includes(pageId), false);
  assert.equal(json.includes('notion:'), false);
});
