/**
 * Tests 8B — Registro Web read-only (fixtures; sin Notion real).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { loadValidatedWebCatalogWithPort } from '@/lib/web-catalog/catalog-load';
import {
  mapCatalogRawPage,
  mapCatalogRawPages,
  parseNotionSourceRef,
  type CatalogRawPage,
} from '@/lib/web-catalog/catalog-mapper';
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

test('8B-R1. mapeo válido desde respuestas simuladas', () => {
  const page = rawPage('page-1', {
    'Nombre editorial': titleProp('Guía'),
    'Clave estable': rich('fixture.guide'),
    'Página origen': relation(['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']),
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
  });
  const entry = mapCatalogRawPage(page);
  assert.ok(entry);
  assert.equal(entry?.stableKey, 'fixture.guide');
  assert.equal(entry?.slug, 'guia');
  assert.equal(entry?.sourceRef, 'notion:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.deepEqual(entry?.aliases, ['guia-vieja']);
});

test('8B-R2. paginación del catálogo acumula páginas del puerto', async () => {
  const pages = [
    rawPage('1', {
      'Nombre editorial': titleProp('Uno'),
      'Clave estable': rich('k1'),
      Estado: select('hidden'),
      Canónico: checkbox(false),
      Sección: select('reference'),
      Slug: rich('uno'),
      Alias: multi([]),
      Navegación: select('none'),
      Renderer: select('document'),
      Privacidad: select('general'),
      'Visible web': checkbox(false),
      Buscable: checkbox(false),
      'IA general': select('denied'),
      'IA revisión': select('denied'),
      Escritura: select('none'),
      Confirmación: select('none'),
    }),
    rawPage('2', {
      'Nombre editorial': titleProp('Dos'),
      'Clave estable': rich('k2'),
      Estado: select('hidden'),
      Canónico: checkbox(false),
      Sección: select('reference'),
      Slug: rich('dos'),
      Alias: multi([]),
      Navegación: select('none'),
      Renderer: select('document'),
      Privacidad: select('general'),
      'Visible web': checkbox(false),
      Buscable: checkbox(false),
      'IA general': select('denied'),
      'IA revisión': select('denied'),
      Escritura: select('none'),
      Confirmación: select('none'),
    }),
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
  const page = rawPage('1', {
    'Nombre editorial': titleProp('Guía'),
    'Clave estable': rich('fixture.guide'),
    Estado: select('hidden'),
    Canónico: checkbox(false),
    Sección: select('reference'),
    Slug: rich('guia'),
    Alias: multi([]),
    Navegación: select('none'),
    Renderer: select('document'),
    Privacidad: select('general'),
    'Visible web': checkbox(false),
    Buscable: checkbox(false),
    'IA general': select('denied'),
    'IA revisión': select('denied'),
    Escritura: select('none'),
    Confirmación: select('none'),
  });
  const port = createFakePort({ pages: [page] });
  const result = await loadValidatedWebCatalogWithPort(port, 'ds-test');
  assert.equal(result.ok, true);
});

test('8B-R24. URLs inseguras se descartan', () => {
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('https://example.com/a'), true);
});

test('8B-R25. parseNotionSourceRef', () => {
  assert.equal(parseNotionSourceRef('notion:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')?.length, 36);
  assert.equal(parseNotionSourceRef('https://evil'), null);
});
