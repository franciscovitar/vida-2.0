import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isWebCatalogEnabled } from '@/lib/web-catalog/config';
import { buildWebCatalogIndex, resolveWebCatalogPath } from '@/lib/web-catalog/index';
import { validateWebCatalog } from '@/lib/web-catalog/validator';
import type { RenderMode, WebCatalogEntry } from '@/types/web-catalog';

function documentEntry(overrides: Partial<WebCatalogEntry> = {}): WebCatalogEntry {
  return {
    stableKey: 'fixture.guide',
    editorialName: 'Guía ficticia',
    sourceRef: 'fixture:source:guide',
    status: 'published',
    canonical: true,
    replacesResourceKey: null,
    section: 'reference',
    slug: 'guia-ficticia',
    aliases: ['guia-anterior'],
    navigationPlacement: 'primary',
    navigationOrder: 10,
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

function privateJournalingFixture(overrides: Partial<WebCatalogEntry> = {}): WebCatalogEntry {
  return {
    stableKey: 'fixture.private-journaling',
    editorialName: 'Journaling',
    sourceRef: 'fixture:source:private-journaling',
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
    ...overrides,
  };
}

function issueCodes(entries: readonly WebCatalogEntry[]): string[] {
  return validateWebCatalog(entries).issues.map((item) => item.code);
}

test('8B1. catálogo válido', () => {
  const result = validateWebCatalog([documentEntry(), privateJournalingFixture()]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test('8B2. detecta claves estables duplicadas', () => {
  const duplicate = documentEntry({ slug: 'otra-guia', aliases: [] });
  assert.ok(issueCodes([documentEntry(), duplicate]).includes('duplicate-stable-key'));
});

test('8B3. detecta slugs duplicados', () => {
  const duplicate = documentEntry({ stableKey: 'fixture.other', aliases: [] });
  assert.ok(issueCodes([documentEntry(), duplicate]).includes('duplicate-slug'));
});

test('8B4. detecta alias duplicado entre entradas', () => {
  const duplicate = documentEntry({
    stableKey: 'fixture.other',
    slug: 'otra-guia',
    aliases: ['guia-anterior'],
  });
  assert.ok(issueCodes([documentEntry(), duplicate]).includes('duplicate-alias'));
});

test('8B5. detecta alias repetido dentro de una entrada', () => {
  const entry = documentEntry({ aliases: ['alias-repetido', 'alias-repetido'] });
  assert.ok(issueCodes([entry]).includes('duplicate-alias'));
});

test('8B6. detecta colisión entre slug y alias', () => {
  const first = documentEntry({ aliases: ['ruta-compartida'] });
  const second = documentEntry({
    stableKey: 'fixture.other',
    slug: 'ruta-compartida',
    aliases: [],
  });
  assert.ok(issueCodes([first, second]).includes('slug-alias-collision'));
});

test('8B7. rechaza slug inválido', () => {
  assert.ok(issueCodes([documentEntry({ slug: 'Ruta Insegura' })]).includes('invalid-slug'));
});

test('8B8. rechaza alias inválido', () => {
  assert.ok(
    issueCodes([documentEntry({ aliases: ['/alias-invalido'] })]).includes('invalid-alias'),
  );
});

test('8B9. resuelve el slug principal a la clave estable', () => {
  const result = buildWebCatalogIndex([documentEntry()]);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(resolveWebCatalogPath(result.index, '/guia-ficticia/'), {
    stableKey: 'fixture.guide',
    matchedBy: 'slug',
    matchedValue: 'guia-ficticia',
  });
});

test('8B10. resuelve un alias histórico a la misma clave estable', () => {
  const result = buildWebCatalogIndex([documentEntry()]);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(resolveWebCatalogPath(result.index, 'guia-anterior'), {
    stableKey: 'fixture.guide',
    matchedBy: 'alias',
    matchedValue: 'guia-anterior',
  });
});

test('8B11. no construye índice para un catálogo inválido', () => {
  const result = buildWebCatalogIndex([documentEntry({ slug: 'NO-valido' })]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.validation.issues.some((item) => item.code === 'invalid-slug'));
});

test('8B12. legacy no puede ser canónico', () => {
  const legacy = documentEntry({
    status: 'legacy',
    canonical: true,
    navigationPlacement: 'none',
    navigationOrder: null,
    policy: {
      visibleWeb: false,
      searchable: false,
      generalAI: 'denied',
      reviewAI: 'denied',
      writeMode: 'none',
      confirmation: 'none',
    },
  });
  assert.ok(issueCodes([legacy]).includes('legacy-canonical'));
});

test('8B13. legacy no puede publicarse, navegarse, buscarse ni usar IA general', () => {
  const legacy = documentEntry({
    status: 'legacy',
    canonical: false,
    replacesResourceKey: 'fixture.current',
  });
  assert.ok(issueCodes([legacy]).includes('legacy-unsafe'));
});

test('8B14. Journaling falso rechaza visibilidad web general', () => {
  const entry = privateJournalingFixture({
    policy: { ...privateJournalingFixture().policy, visibleWeb: true },
  });
  assert.ok(issueCodes([entry]).includes('private-unsafe'));
});

test('8B15. Journaling falso rechaza búsqueda', () => {
  const entry = privateJournalingFixture({
    policy: { ...privateJournalingFixture().policy, searchable: true },
  });
  assert.ok(issueCodes([entry]).includes('private-unsafe'));
});

test('8B16. Journaling falso rechaza navegación general', () => {
  const entry = privateJournalingFixture({
    navigationPlacement: 'primary',
    navigationOrder: 1,
  });
  assert.ok(issueCodes([entry]).includes('private-unsafe'));
});

test('8B17. Journaling falso rechaza IA general', () => {
  const entry = privateJournalingFixture({
    policy: { ...privateJournalingFixture().policy, generalAI: 'allowed' },
  });
  assert.ok(issueCodes([entry]).includes('private-unsafe'));
});

test('8B18. privado no puede usar el renderer document', () => {
  assert.ok(
    issueCodes([privateJournalingFixture({ renderMode: 'document' })]).includes('private-unsafe'),
  );
});

test('8B19. rechaza una configuración insegura de sistema', () => {
  const systemEntry = documentEntry({
    stableKey: 'fixture.system',
    status: 'hidden',
    slug: 'system-fixture',
    aliases: [],
    navigationPlacement: 'none',
    navigationOrder: null,
    renderMode: 'document',
    privacy: 'system',
    policy: {
      visibleWeb: false,
      searchable: false,
      generalAI: 'denied',
      reviewAI: 'allowed',
      writeMode: 'none',
      confirmation: 'none',
    },
  });
  assert.ok(issueCodes([systemEntry]).includes('system-unsafe'));
});

test('8B20. rechaza una configuración insegura de recurso excluido', () => {
  const excluded = documentEntry({
    status: 'excluded',
    canonical: false,
    privacy: 'excluded',
    navigationPlacement: 'none',
    navigationOrder: null,
    policy: {
      visibleWeb: false,
      searchable: false,
      generalAI: 'denied',
      reviewAI: 'allowed',
      writeMode: 'none',
      confirmation: 'none',
    },
  });
  assert.ok(issueCodes([excluded]).includes('excluded-unsafe'));
});

test('8B21. rechaza renderer desconocido', () => {
  const unknown = 'external-code' as RenderMode;
  assert.ok(issueCodes([documentEntry({ renderMode: unknown })]).includes('unknown-renderer'));
});

test('8B22. escritura futura exige confirmación explícita o reforzada', () => {
  for (const writeMode of ['proposal', 'properties', 'content', 'special-module'] as const) {
    const entry = documentEntry({
      policy: { ...documentEntry().policy, writeMode, confirmation: 'none' },
    });
    assert.ok(issueCodes([entry]).includes('insufficient-confirmation'));
  }

  const confirmed = documentEntry({
    policy: {
      ...documentEntry().policy,
      writeMode: 'special-module',
      confirmation: 'reinforced',
    },
  });
  assert.equal(validateWebCatalog([confirmed]).valid, true);
});

test('8B23. los errores son estructurados y determinísticos', () => {
  const entries = [documentEntry({ slug: 'Inválido' })];
  assert.deepEqual(validateWebCatalog(entries), validateWebCatalog(entries));
  const [first] = validateWebCatalog(entries).issues;
  assert.equal(first?.severity, 'error');
  assert.equal(typeof first?.message, 'string');
  assert.equal(first?.entryKey, 'fixture.guide');
});

test('8B24. feature flag ausente queda apagada', () => {
  assert.equal(isWebCatalogEnabled({}), false);
});

test('8B25. feature flag false queda apagada', () => {
  assert.equal(isWebCatalogEnabled({ WEB_CATALOG_ENABLED: 'false' }), false);
});

test('8B26. solo el valor exacto true enciende la feature flag', () => {
  assert.equal(isWebCatalogEnabled({ WEB_CATALOG_ENABLED: 'true' }), true);
  assert.equal(isWebCatalogEnabled({ WEB_CATALOG_ENABLED: 'TRUE' }), false);
  assert.equal(isWebCatalogEnabled({ WEB_CATALOG_ENABLED: ' true ' }), false);
});
