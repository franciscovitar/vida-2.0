import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildUnavailableAgendaData } from '@/lib/calendar/summaries';
import {
  buildDocumentOverview,
  detectDocumentPresentation,
} from '@/lib/web-catalog/document-overview';
import { buildAppNavigation } from '@/lib/web-catalog/navigation';
import {
  buildSearchableDocument,
  searchWebCatalogDocuments,
} from '@/lib/web-catalog/search';
import { webCatalogPathFor } from '@/lib/web-catalog/section-labels';
import { usesReadableContentRenderer } from '@/lib/web-catalog/policy';
import type { ContentBlock, ContentPage } from '@/types/content';
import type { WebCatalogEntry } from '@/types/web-catalog';

function block(localId: string, type: ContentBlock['type'], text: string): ContentBlock {
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

function page(blocks: readonly ContentBlock[]): ContentPage {
  return {
    stableKey: 'fixture.content',
    slug: 'fixture-content',
    title: 'Documento de prueba',
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
    blocks,
    childPages: [],
    provenance: { source: 'web-catalog', fetchedAt: '2026-07-23T00:00:00.000Z' },
  };
}

function entry(overrides: Partial<WebCatalogEntry> = {}): WebCatalogEntry {
  return {
    stableKey: 'fixture.content',
    editorialName: 'Documento de prueba',
    sourceRef: 'notion:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    status: 'published',
    canonical: true,
    replacesResourceKey: null,
    section: 'reference',
    slug: 'fixture-content',
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

test('10A-1. detecta Norte por estructura y arma prioridades sin inventar datos', () => {
  const content = page([
    block('h-season', 'heading_1', 'Temporada actual'),
    block('p-season', 'paragraph', 'Temporada de prueba hasta fin de mes.'),
    block('h-objective', 'heading_1', 'Objetivo principal'),
    block('p-objective', 'paragraph', 'Consolidar el sistema sin sobrecarga.'),
    block('h-priorities', 'heading_1', 'Prioridades'),
    block('n-1', 'numbered_list_item', 'Primera prioridad'),
    block('n-2', 'numbered_list_item', 'Segunda prioridad'),
    block('h-out', 'heading_1', 'Fuera de foco'),
    block('b-1', 'bulleted_list_item', 'No abrir frentes innecesarios'),
  ]);

  assert.equal(detectDocumentPresentation(content), 'north');
  const overview = buildDocumentOverview(content);
  assert.equal(overview?.presentation, 'north');
  assert.deepEqual(overview?.cards.find((item) => item.key === 'priorities')?.items, [
    'Primera prioridad',
    'Segunda prioridad',
  ]);
});

test('10A-2. aprendizaje separa activo, pasivo, algún día y consolidado', () => {
  const content = page([
    block('h-active', 'heading_1', 'Activo'),
    block('a-1', 'bulleted_list_item', 'Tema activo'),
    block('h-passive', 'heading_1', 'Pasivo'),
    block('p-1', 'bulleted_list_item', 'Tema pasivo'),
    block('h-someday', 'heading_1', 'Algún día'),
    block('s-1', 'bulleted_list_item', 'Tema futuro'),
    block('h-done', 'heading_1', 'Consolidado'),
    block('d-1', 'paragraph', 'Sin temas confirmados.'),
  ]);

  assert.equal(detectDocumentPresentation(content), 'learning');
  const overview = buildDocumentOverview(content);
  assert.deepEqual(
    overview?.cards.map((item) => item.title),
    ['Activo', 'Pasivo', 'Algún día', 'Consolidado'],
  );
});

test('10A-3. compras muestra Comprar, Reponer e Investigar antes', () => {
  const content = page([
    block('h-buy', 'heading_1', 'Comprar'),
    block('buy-1', 'bulleted_list_item', 'Elemento decidido'),
    block('h-replenish', 'heading_1', 'Reponer'),
    block('rep-1', 'bulleted_list_item', 'Elemento recurrente'),
    block('h-research', 'heading_1', 'Investigar antes'),
    block('res-1', 'bulleted_list_item', 'Elemento por comparar'),
  ]);

  assert.equal(detectDocumentPresentation(content), 'purchases');
  const overview = buildDocumentOverview(content);
  assert.equal(overview?.cards.length, 3);
  assert.equal(overview?.cards[2]?.items[0], 'Elemento por comparar');
});

test('10A-4. dieta detecta comidas rápidas dentro de Meal prep', () => {
  const content = page([
    block('h-objective', 'heading_1', 'Objetivo'),
    block('p-objective', 'paragraph', 'Resolver comidas con bases preparadas.'),
    block('h-prep', 'heading_1', 'Meal prep semanal'),
    block('h-quick', 'heading_2', 'Comidas rápidas para resolver en 10 minutos'),
    block('quick-1', 'bulleted_list_item', 'Comida rápida de prueba'),
    block('h-shopping', 'heading_1', 'Lista de compra principal'),
    block('shop-1', 'bulleted_list_item', 'Ingrediente de prueba'),
  ]);

  assert.equal(detectDocumentPresentation(content), 'diet');
  const overview = buildDocumentOverview(content);
  const quick = overview?.cards.find((item) => item.key === 'quick-meals');
  assert.deepEqual(quick?.items, ['Comida rápida de prueba']);
});

test('10A-5. Facultad resume materias activas y próximos bloques', () => {
  const content = page([
    block('h-season', 'heading_1', 'Temporada actual'),
    block('p-season', 'paragraph', 'Período académico de prueba.'),
    block('h-subjects', 'heading_1', 'Materias activas'),
    block('h-subject-a', 'heading_2', 'Materia A'),
    block('h-subject-b', 'heading_2', 'Materia B'),
    block('h-next', 'heading_1', 'Próximos bloques recomendados'),
    block('next-1', 'bulleted_list_item', 'Bloque breve'),
    block('h-rule', 'heading_1', 'Regla'),
    block('p-rule', 'paragraph', 'Elegir un bloque principal.'),
  ]);

  assert.equal(detectDocumentPresentation(content), 'faculty');
  const overview = buildDocumentOverview(content);
  assert.deepEqual(overview?.cards[0]?.items, ['Materia A', 'Materia B']);
});

test('10A-6. documentos sin firma estructural conservan renderer genérico', () => {
  const content = page([
    block('h', 'heading_1', 'Notas'),
    block('p', 'paragraph', 'Contenido libre.'),
  ]);
  assert.equal(detectDocumentPresentation(content), 'document');
  assert.equal(buildDocumentOverview(content), null);
});

test('10A-6b. presentación forzada sin estructura no inventa un resumen', () => {
  const content = page([block('p', 'paragraph', 'Contenido libre sin secciones.')]);
  assert.equal(buildDocumentOverview(content, 'north'), null);
});

test('10A-7. rutas fijas se usan también en búsqueda', () => {
  const fixed = entry({ stableKey: 'aprendizaje', slug: 'mapa-de-prueba' });
  const document = buildSearchableDocument(fixed, page([block('p', 'paragraph', 'Texto')]));
  assert.equal(webCatalogPathFor('aprendizaje', 'mapa-de-prueba'), '/aprendizaje');
  assert.equal(webCatalogPathFor('today.north', 'direccion-temporal'), '/norte');
  assert.equal(webCatalogPathFor('facultad', 'facultad-documento'), '/areas/facultad');
  assert.equal(webCatalogPathFor('health.diet', 'alimentacion-canonica'), '/dieta');
  assert.equal(document?.href, '/aprendizaje');
  assert.equal(webCatalogPathFor('fixture.other', 'otro'), '/p/otro');
});

test('10A-7b. búsqueda no indexa ni devuelve menciones incidentales de Journaling', () => {
  const searchable = entry({ stableKey: 'productividad.guide', slug: 'productividad-guia' });
  const content = page([
    block('safe', 'paragraph', 'Hábitos: levantarse con la alarma.'),
    block('private-reference', 'paragraph', 'Journaling: diario.'),
  ]);
  const document = buildSearchableDocument(searchable, content);
  assert.ok(document);
  assert.equal(document.body.toLowerCase().includes('journaling'), false);
  assert.deepEqual(searchWebCatalogDocuments([document], 'Journaling', [searchable]), []);
});

test('10A-8. renderers documentales y módulos fijos reutilizan lectura segura', () => {
  assert.equal(usesReadableContentRenderer(entry({ renderMode: 'faculty' })), true);
  assert.equal(usesReadableContentRenderer(entry({ renderMode: 'functional-module' })), true);
  assert.equal(usesReadableContentRenderer(entry({ renderMode: 'gym' })), false);
  assert.equal(usesReadableContentRenderer(entry({ renderMode: 'private' })), false);
});

test('10A-9. Norte usa una sola ruta fija y desaparece si el catálogo lo oculta', () => {
  const published = buildAppNavigation(true, [
    entry({
      stableKey: 'today.north',
      slug: 'direccion-temporal',
      section: 'today',
      renderMode: 'functional-module',
      navigationPlacement: 'none',
      navigationOrder: null,
    }),
  ]);
  assert.equal(published.primary.filter((item) => item.href === '/norte').length, 1);

  const hidden = buildAppNavigation(true, [
    entry({
      stableKey: 'today.north',
      slug: 'direccion-temporal',
      section: 'today',
      renderMode: 'functional-module',
      navigationPlacement: 'none',
      navigationOrder: null,
      status: 'hidden',
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
  assert.equal(
    hidden.primary.some((item) => item.href === '/norte'),
    false,
  );
});

test('10A-10. Dieta usa una sola ruta fija y obedece la política del catálogo', () => {
  const published = buildAppNavigation(true, [
    entry({
      stableKey: 'health.diet',
      editorialName: 'Dieta',
      slug: 'alimentacion-canonica',
      section: 'personal-systems',
      navigationPlacement: 'none',
      navigationOrder: null,
    }),
  ]);
  assert.equal(published.primary.filter((item) => item.href === '/dieta').length, 1);

  const hidden = buildAppNavigation(true, [
    entry({
      stableKey: 'health.diet',
      editorialName: 'Dieta',
      slug: 'alimentacion-canonica',
      section: 'personal-systems',
      navigationPlacement: 'none',
      navigationOrder: null,
      status: 'hidden',
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
  assert.equal(
    hidden.primary.some((item) => item.href === '/dieta'),
    false,
  );
});

test('10B-1. fallo Calendar real produce agenda vacía, no eventos simulados', () => {
  const agenda = buildUnavailableAgendaData({
    view: '7',
    today: '2026-07-23',
    status: 'not-configured',
    notice: 'Calendar no configurado.',
  });

  assert.equal(agenda.source, 'google');
  assert.equal(agenda.status, 'not-configured');
  assert.equal(agenda.summary.totalEvents, 0);
  assert.equal(agenda.timelineToday.length, 0);
  assert.equal(agenda.calendarCount, 0);
  assert.ok(agenda.days.every((day) => day.events.length === 0));
});

test('10B-2. la rama de error de Agenda no llama al generador mock', () => {
  const source = readFileSync(join(process.cwd(), 'lib', 'data', 'calendar-source.ts'), 'utf8');
  const fallback = source.match(
    /function fallbackAgenda[\s\S]*?async function loadAgendaUncached/,
  )?.[0];

  assert.ok(fallback);
  assert.match(fallback, /buildUnavailableAgendaData/);
  assert.doesNotMatch(fallback, /buildMockCalendarEvents|mockAgenda\(/);
});
