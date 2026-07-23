import assert from 'node:assert/strict';
import { test } from 'node:test';

import { adaptCatalogBlock } from '@/lib/web-catalog/content-adapters';
import {
  buildContentOutline,
  groupAdjacentContentBlocks,
} from '@/lib/web-catalog/content-layout';
import { buildAppNavigation } from '@/lib/web-catalog/navigation';
import type { ContentBlock } from '@/types/content';
import type { WebCatalogEntry } from '@/types/web-catalog';

function catalogEntry(overrides: Partial<WebCatalogEntry> = {}): WebCatalogEntry {
  return {
    stableKey: 'fixture.document',
    editorialName: 'Documento',
    sourceRef: 'notion:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    status: 'published',
    canonical: true,
    replacesResourceKey: null,
    section: 'reference',
    slug: 'documento',
    aliases: [],
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

function block(
  localId: string,
  type: ContentBlock['type'],
  text = localId,
): ContentBlock {
  return {
    localId,
    type,
    text: text ? [{ plain: text, href: null }] : [],
    checked: null,
    language: null,
    link: null,
    asset: null,
    childPageSlug: null,
    childPageTitle: null,
    children: [],
  };
}

test('9B-1. catálogo activo oculta rutas fijas documentales no publicadas', () => {
  const nav = buildAppNavigation(true, [
    catalogEntry({
      stableKey: 'aprendizaje',
      editorialName: 'Aprendizaje',
      slug: 'aprendizaje',
      status: 'hidden',
      canonical: true,
      navigationPlacement: 'primary',
      policy: {
        visibleWeb: false,
        searchable: false,
        generalAI: 'denied',
        reviewAI: 'denied',
        writeMode: 'none',
        confirmation: 'none',
      },
    }),
    catalogEntry({
      stableKey: 'compras',
      editorialName: 'Compras',
      slug: 'compras',
      status: 'hidden',
      canonical: true,
      navigationPlacement: 'primary',
      policy: {
        visibleWeb: false,
        searchable: false,
        generalAI: 'denied',
        reviewAI: 'denied',
        writeMode: 'none',
        confirmation: 'none',
      },
    }),
  ]);

  assert.equal(nav.primary.some((item) => item.href === '/aprendizaje'), false);
  assert.equal(nav.primary.some((item) => item.href === '/compras'), false);
});

test('9B-2. ruta fija publicada aparece una sola vez con su path estable', () => {
  const nav = buildAppNavigation(true, [
    catalogEntry({
      stableKey: 'aprendizaje',
      editorialName: 'Aprendizaje',
      slug: 'mapa-aprendizaje',
    }),
  ]);
  assert.equal(nav.primary.filter((item) => item.href === '/aprendizaje').length, 1);
});

test('9B-3. Journaling queda fuera de la navegación general con catálogo activo', () => {
  const nav = buildAppNavigation(true, []);
  assert.equal(
    [...nav.primary, ...nav.secondary].some((item) => item.href === '/journaling'),
    false,
  );
});

test('9B-4. guía documental no duplica un módulo funcional existente', () => {
  const nav = buildAppNavigation(true, [
    catalogEntry({
      stableKey: 'productividad.guia',
      editorialName: 'Guía de Productividad',
      slug: 'productividad-guia',
      navigationPlacement: 'secondary',
    }),
  ]);
  const all = [...nav.primary, ...nav.secondary];
  assert.equal(all.some((item) => item.href === '/p/productividad-guia'), false);
  assert.equal(all.filter((item) => item.href === '/productividad').length, 1);
});

test('9C-1. listas consecutivas se agrupan sin reiniciar numeración', () => {
  const groups = groupAdjacentContentBlocks([
    block('n1', 'numbered_list_item'),
    block('n2', 'numbered_list_item'),
    block('p', 'paragraph'),
    block('b1', 'bulleted_list_item'),
    block('b2', 'bulleted_list_item'),
  ]);

  assert.equal(groups.length, 3);
  assert.equal(groups[0]?.kind, 'list');
  if (groups[0]?.kind === 'list') {
    assert.equal(groups[0].ordered, true);
    assert.equal(groups[0].blocks.length, 2);
  }
  assert.equal(groups[1]?.kind, 'single');
  assert.equal(groups[2]?.kind, 'list');
  if (groups[2]?.kind === 'list') {
    assert.equal(groups[2].ordered, false);
    assert.equal(groups[2].blocks.length, 2);
  }
});

test('9C-2. índice usa headings reales y omite títulos vacíos', () => {
  const nested = block('parent', 'toggle');
  nested.children = [block('h3', 'heading_3', 'Detalle')];
  const outline = buildContentOutline([
    block('h1', 'heading_1', 'Inicio'),
    block('empty', 'heading_2', ''),
    nested,
  ]);
  assert.deepEqual(
    outline.map(({ label, level }) => ({ label, level })),
    [
      { label: 'Inicio', level: 1 },
      { label: 'Detalle', level: 3 },
    ],
  );
});

test('9C-3. rich text conserva anotaciones sanitizadas', () => {
  const adapted = adaptCatalogBlock(
    {
      id: 'rich',
      type: 'paragraph',
      has_children: false,
      raw: {
        paragraph: {
          rich_text: [
            {
              plain_text: 'Importante',
              annotations: {
                bold: true,
                italic: true,
                strikethrough: false,
                underline: false,
                code: false,
                color: 'red_background',
              },
            },
          ],
        },
      },
    },
    0,
    [],
    null,
  );

  assert.deepEqual(adapted.text[0]?.annotations, {
    bold: true,
    italic: true,
    strikethrough: false,
    underline: false,
    code: false,
    color: 'red_background',
  });
});

test('9C-4. child_database tiene fallback seguro y no se marca unsupported', () => {
  const adapted = adaptCatalogBlock(
    {
      id: 'db',
      type: 'child_database',
      has_children: false,
      raw: { child_database: { title: 'Recursos' } },
    },
    0,
    [],
    null,
  );
  assert.equal(adapted.type, 'child_database');
  assert.equal(adapted.childPageTitle, 'Recursos');
  assert.equal(adapted.childPageSlug, null);
});
