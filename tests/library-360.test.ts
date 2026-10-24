import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  parseLibrary360Snapshot,
  resolveLibrary360Text,
} from '@/lib/professional/library-360-contract';
import {
  searchLibrary360Entries,
  selectLibrary360Entries,
} from '@/lib/professional/library-360-view';

const raw = readFileSync(join(process.cwd(), 'data/generated/library-360.json'), 'utf8');
const payload = JSON.parse(raw);

test('LIB360-01. V2 deriva exactamente 193 fichas únicas en 12 áreas', () => {
  const snapshot = parseLibrary360Snapshot(payload);
  assert.ok(snapshot);
  assert.equal(snapshot.totalEntries, 193);
  assert.equal(snapshot.areas.length, 12);
  assert.equal(snapshot.source.ref, 'main');
  assert.match(snapshot.source.commit, /^[a-f0-9]{40}$/);

  const resources = snapshot.areas.flatMap((area) => area.entries);
  assert.equal(resources.length, 193);
  assert.equal(new Set(resources.map((entry) => entry.id)).size, 193);
  assert.equal(new Set(resources.map((entry) => entry.repository)).size, 193);
  assert.equal(snapshot.spotlightIds.length, 20);
  assert.equal(
    resources.some((entry) => entry.id === 'TL-001' && entry.name === 'n8n'),
    true,
  );
  assert.equal(
    resources.some((entry) => entry.id === 'TL-169' && entry.name === 'Formbricks'),
    true,
  );
  assert.deepEqual(resources.find((entry) => entry.id === 'TL-001')?.sourceReferences, [
    {
      label: 'Repositorio oficial',
      url: 'https://github.com/n8n-io/n8n',
      verifiedAt: '2026-09-21',
    },
  ]);
});

test('LIB360-02. cinco áreas sin fichas conservan referencia de investigación', () => {
  const snapshot = parseLibrary360Snapshot(payload);
  assert.ok(snapshot);
  const emptyCodes = snapshot.areas
    .filter((area) => area.entries.length === 0)
    .map((area) => area.code);
  assert.deepEqual(emptyCodes, ['A03', 'A04', 'A06', 'A09', 'A10']);
  assert.equal(
    snapshot.areas.every(
      (area) =>
        area.researchStatus === 'EVIDENCE_READY_DOCUMENTARY_ONLY' &&
        area.researchReportPath.endsWith('.md'),
    ),
    true,
  );
});

test('LIB360-03. un recurso en varias facetas no se duplica como entidad', () => {
  const snapshot = parseLibrary360Snapshot(payload);
  assert.ok(snapshot);
  const candidates = snapshot.areas.flatMap((area) => area.entries);
  const n8n = candidates.filter((entry) => entry.id === 'TL-001');
  assert.equal(n8n.length, 1);
  assert.equal(n8n[0]?.relatedAreaIds.includes('A05_APIS_INTEGRATIONS'), true);
  assert.equal(n8n[0]?.classificationStatus, 'PROPOSED_NOT_VERIFIED');
});

test('LIB360-04. entradas duplicadas y facetas desconocidas fallan cerrado', () => {
  const duplicate = structuredClone(payload);
  const first = duplicate.areas[0].entries[0];
  duplicate.areas[1].entries.push(structuredClone(first));
  duplicate.totalEntries += 1;
  assert.equal(parseLibrary360Snapshot(duplicate), null);

  const badArea = structuredClone(payload);
  badArea.areas[0].entries[0].relatedAreaIds.push('A99_UNKNOWN');
  assert.equal(parseLibrary360Snapshot(badArea), null);

  const badCommit = structuredClone(payload);
  badCommit.source.commit = 'not-a-commit';
  assert.equal(parseLibrary360Snapshot(badCommit), null);

  const badSourceDate = structuredClone(payload);
  badSourceDate.areas[0].entries[0].sourceReferences[0].verifiedAt = '2026-02-31';
  assert.equal(parseLibrary360Snapshot(badSourceDate), null);
});

test('LIB360-05. falta de fuente o datos inválidos no muestra el catálogo antiguo', () => {
  assert.equal(resolveLibrary360Text(null).status, 'missing');
  assert.equal(resolveLibrary360Text('{').status, 'invalid');
  assert.equal(resolveLibrary360Text(JSON.stringify({ schemaVersion: 1 })).status, 'invalid');
});

test('LIB360-06. frescura corresponde a datos V1, no a fecha de reorganización', () => {
  const fresh = resolveLibrary360Text(raw, new Date('2026-10-24T12:00:00Z'));
  const stale = resolveLibrary360Text(raw, new Date('2026-11-20T12:00:00Z'));
  assert.equal(fresh.status, 'ready');
  assert.equal(fresh.stale, false);
  assert.equal(stale.status, 'ready');
  assert.equal(stale.stale, true);
  assert.match(stale.notice ?? '', /históricos/);
});

test('LIB360-07. filtros por facetas secundarias muestran una identidad única', () => {
  const snapshot = parseLibrary360Snapshot(payload);
  assert.ok(snapshot);
  const all = selectLibrary360Entries(snapshot.areas);
  const apiArea = selectLibrary360Entries(snapshot.areas, 'A05_APIS_INTEGRATIONS');
  const n8nAll = all.filter(({ entry }) => entry.id === 'TL-001');
  const n8nInApi = apiArea.filter(({ entry }) => entry.id === 'TL-001');

  assert.equal(n8nAll.length, 1);
  assert.equal(n8nInApi.length, 1);
  assert.equal(n8nInApi[0]?.primaryArea.code, 'A11');
  assert.equal(
    n8nInApi[0]?.relatedAreas.some((area) => area.code === 'A05'),
    true,
  );
});

test('LIB360-08. búsqueda consulta contexto, etiquetas y nombres de áreas relacionadas', () => {
  const snapshot = parseLibrary360Snapshot(payload);
  assert.ok(snapshot);
  const all = selectLibrary360Entries(snapshot.areas);

  assert.equal(
    searchLibrary360Entries(all, 'copiar/pegar').some(({ entry }) => entry.id === 'TL-001'),
    true,
  );
  assert.equal(
    searchLibrary360Entries(all, 'integrations').some(({ entry }) => entry.id === 'TL-001'),
    true,
  );
  assert.equal(
    searchLibrary360Entries(all, 'APIs e integraciones').some(({ entry }) => entry.id === 'TL-001'),
    true,
  );
  assert.equal(searchLibrary360Entries(all, 'sin-coincidencias').length, 0);
});
