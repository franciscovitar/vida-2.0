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
  searchLibrary360Results,
  selectLibrary360Entries,
  selectLibrary360Results,
} from '@/lib/professional/library-360-view';

const raw = readFileSync(join(process.cwd(), 'data/generated/library-360.json'), 'utf8');
const payload = JSON.parse(raw);
const legacyPayload = JSON.parse(
  readFileSync(join(process.cwd(), 'data/generated/technology-library.json'), 'utf8'),
);

test('LIB360-01. V3 conserva exactamente 193 fichas únicas en las 12 áreas', () => {
  const snapshot = parseLibrary360Snapshot(payload);
  assert.ok(snapshot);
  assert.equal(snapshot.schemaVersion, 3);
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

test('LIB360-13. campos, fuentes e identidades de las 193 fichas siguen intactos', () => {
  const snapshot = parseLibrary360Snapshot(payload);
  assert.ok(snapshot);
  const current = snapshot.areas.flatMap((area) => area.entries);
  const legacy = legacyPayload.categories.flatMap(
    (category: { entries: Record<string, unknown>[] }) => category.entries,
  );
  const legacyById = new Map<string, Record<string, unknown>>(
    legacy.map((entry: Record<string, unknown>) => [String(entry.id), entry]),
  );
  for (const entry of current) {
    const old = legacyById.get(entry.id);
    assert.ok(old, `missing legacy identity ${entry.id}`);
    for (const field of [
      'name',
      'kind',
      'status',
      'attention',
      'summary',
      'application',
      'benefit',
      'caution',
      'tags',
      'repository',
      'sourceUrl',
    ]) {
      assert.deepEqual(entry[field as keyof typeof entry], old[field]);
    }
    assert.ok(entry.sourceReferences.some((reference) => reference.url === entry.sourceUrl));
  }
});

test('LIB360-09. incorpora 154 casos A03–A11 como documentación con prueba y adopción separadas', () => {
  const snapshot = parseLibrary360Snapshot(payload);
  assert.ok(snapshot);
  assert.equal(snapshot.researchCases.length, 154);
  assert.deepEqual(
    Object.fromEntries(
      snapshot.areas
        .filter((area) => area.code >= 'A03' && area.code <= 'A11')
        .map((area) => [area.code, area.researchCases.length]),
    ),
    { A03: 16, A04: 18, A05: 12, A06: 18, A07: 18, A08: 18, A09: 18, A10: 18, A11: 18 },
  );
  assert.equal(
    snapshot.researchCases.every(
      (item) =>
        item.evidenceKind === 'DOCUMENTARY_RESEARCH_CASE' &&
        item.trialStatus === 'NOT_RUN' &&
        item.adoptionStatus === 'NOT_AUTHORIZED',
    ),
    true,
  );
  assert.equal(
    snapshot.researchCases.every(
      (item) =>
        item.sourcePath.startsWith('AI/projects/professional-intelligence/') &&
        /^[a-f0-9]{40}$/.test(item.sourceBlobSha),
    ),
    true,
  );
});

test('LIB360-10. descubrimientos no certificados son visibles; solo conflictos reales quedan en HOLD', () => {
  const snapshot = parseLibrary360Snapshot(payload);
  assert.ok(snapshot);
  assert.equal(snapshot.researchMentionAudit.length, 356);
  assert.equal(snapshot.researchReview.attachedToExistingResourceCount, 42);
  assert.equal(snapshot.researchReview.sameRepositoryGroupsHeld, 13);
  assert.equal(snapshot.researchReview.nameCollisionHolds, 1);
  assert.equal(snapshot.researchReview.decision, 'NO_COMMERCIAL_RIGHTS_OR_ADOPTION_CERTIFIED');
  assert.equal(snapshot.candidateReferences.length, 272);
  assert.equal(snapshot.researchReview.holdCount, 42);
  assert.equal(snapshot.researchMentionAudit.filter((x) => x.disposition === 'CANDIDATE_PENDING_REVIEW').length, 272);
  assert.equal(snapshot.candidateReferences.every((x) => x.knowledgeStatus === 'DISCOVERED_NOT_VERIFIED' && x.testStatus === 'NOT_RUN' && x.adoptionStatus === 'NOT_AUTHORIZED'), true);
  assert.equal(snapshot.candidateReferences.some((x) => x.name === 'GitHub Copilot'), true);
  assert.equal(snapshot.candidateReferences.some((x) => x.name === 'Docling'), true);
  assert.equal(snapshot.candidateReferences.some((x) => x.name === 'WCAG 2.2'), true);
  assert.equal(snapshot.researchMentionAudit.some((x) => x.name === 'PWABuilder' && x.area === 'A01' && x.disposition === 'HOLD'), true);
  assert.equal(new Set(snapshot.candidateReferences.map((x) => x.identity)).size, 272);
  assert.equal(
    snapshot.researchMentionAudit.some(
      (mention) => mention.id === 'A01-P2-013' && mention.disposition === 'HOLD',
    ),
    true,
  );
  assert.equal(
    snapshot.identityHolds.some(
      (hold) => hold.reason === 'ORVAL_ALIAS_REVIEW_NO_COMMON_REPOSITORY',
    ),
    true,
  );
  assert.equal(
    snapshot.areas
      .flatMap((area) => area.entries)
      .find((entry) => entry.id === 'TL-169')
      ?.researchMentionRefs?.some((ref) => ref.sourceId === 'A12-G-007'),
    true,
  );
});

test('LIB360-11. la búsqueda unificada consulta casos, candidatos y conserva filtro por área', () => {
  const snapshot = parseLibrary360Snapshot(payload);
  assert.ok(snapshot);
  const all = selectLibrary360Results(snapshot);
  const matchingCase = searchLibrary360Results(all, 'API low-cost extraction');
  assert.equal(
    matchingCase.some((result) => result.kind === 'case' && result.id === 'A03-S01'),
    true,
  );
  assert.equal(
    searchLibrary360Results(all, 'cardsort').some((result) => result.kind === 'candidate'),
    true,
  );
  assert.equal(
    selectLibrary360Results(snapshot, 'A03_AI_MODELS').filter((result) => result.kind === 'case')
      .length,
    16,
  );
  assert.equal(
    selectLibrary360Results(snapshot, 'A03_AI_MODELS').some((result) => result.areaCode === 'A01'),
    false,
  );
  assert.equal(selectLibrary360Results(snapshot, 'ALL', 'hold').length, 42);
  assert.equal(selectLibrary360Results(snapshot).length, 193 + 154 + 272);
  assert.equal(
    searchLibrary360Results(selectLibrary360Results(snapshot, 'ALL', 'hold'), 'ORVAL').some((result) => result.kind === 'hold'),
    true,
  );
});

test('LIB360-12. los duplicados de contenido, pruebas ejecutadas falsas y adopción falsa fallan cerrado', () => {
  const duplicateCase = structuredClone(payload);
  duplicateCase.researchCases.push(structuredClone(duplicateCase.researchCases[0]));
  assert.equal(parseLibrary360Snapshot(duplicateCase), null);

  const executedTrial = structuredClone(payload);
  executedTrial.researchCases[0].trialStatus = 'EXECUTED';
  assert.equal(parseLibrary360Snapshot(executedTrial), null);

  const adopted = structuredClone(payload);
  adopted.researchCases[0].adoptionStatus = 'AUTHORIZED';
  assert.equal(parseLibrary360Snapshot(adopted), null);

  const fakeDiscovery = structuredClone(payload);
  fakeDiscovery.candidateReferences[0].knowledgeStatus = 'VERIFIED';
  assert.equal(parseLibrary360Snapshot(fakeDiscovery), null);
  const fakeTrial = structuredClone(payload);
  fakeTrial.candidateReferences[0].testStatus = 'EXECUTED';
  assert.equal(parseLibrary360Snapshot(fakeTrial), null);
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
  assert.equal(resolveLibrary360Text(JSON.stringify({ schemaVersion: 2 })).status, 'invalid');
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
