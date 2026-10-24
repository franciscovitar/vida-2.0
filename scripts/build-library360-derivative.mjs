#!/usr/bin/env node
/**
 * Deterministic offline compiler: PAS canonical TL + 12-area crosswalk -> Vida V2 derivative.
 * No GitHub/API calls; never edits PAS. Requires a local PAS checkout at the pinned commit.
 *
 * node scripts/build-library360-derivative.mjs ../personal-ai-system <40-char-main-sha> 2026-10-24 --check
 * node scripts/build-library360-derivative.mjs ../personal-ai-system <40-char-main-sha> 2026-10-24 --write
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { format, resolveConfig } from 'prettier';

const [pasDirArg, mainSha, date, mode = '--check'] = process.argv.slice(2);
if (
  !pasDirArg ||
  !/^[a-f0-9]{40}$/.test(mainSha ?? '') ||
  !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ||
  !['--check', '--write'].includes(mode)
) {
  throw new Error(
    'Usage: node scripts/build-library360-derivative.mjs <PAS-checkout> <sha40> <YYYY-MM-DD> <--check|--write>',
  );
}
const pasDir = resolve(pasDirArg);
const srcPrefix = 'AI/projects/professional-intelligence/';
const indexPath = srcPrefix + 'TECHNOLOGY_LIBRARY_INDEX_V1.json';
const crossPath = srcPrefix + 'KNOWLEDGE_LIBRARY_360_INVENTORY_PROPOSAL_V1.json';
const navPath = srcPrefix + 'KNOWLEDGE_LIBRARY_360_GLOBAL_FINAL_G_READER_NAV_20261024.json';
const candidateSourcePaths = {
  A01: 'KNOWLEDGE_LIBRARY_360_A01_P5_123_RECORD_TRIAGE_20261023.json',
  A02: 'KNOWLEDGE_LIBRARY_360_A02_P5_204_RECORD_GPD_TRIAGE_20261023.json',
  A12: 'KNOWLEDGE_LIBRARY_360_A12_P3_SELECTED_CANDIDATE_IDENTITY_TRIAGE_20261023.json',
};
const dossierSources = [
  {
    area: 'A03',
    path: 'KNOWLEDGE_LIBRARY_360_A03_P4_PASS5_G16_DECISION_DOSSIERS_20261023.json',
    key: 'entries',
    id: (r) => r.id,
    title: (r) => r.capability,
  },
  {
    area: 'A04',
    path: 'KNOWLEDGE_LIBRARY_360_A04_P4_G18_DECISION_DOSSIERS_20261023.json',
    key: 'dossiers',
    id: (r) => r.family,
    title: (r) => r.capability,
  },
  {
    area: 'A05',
    path: 'KNOWLEDGE_LIBRARY_360_A05_P4_CURATED_12_DECISIONS_20261023.json',
    key: 'selected',
    id: (r) => r.id,
    title: (r) => r.area,
  },
  {
    area: 'A06',
    path: 'KNOWLEDGE_LIBRARY_360_A06_P4_G18_DECISION_DOSSIERS_20261023.json',
    key: 'dossiers',
    id: (r) => r.family,
    title: (r) => r.capability,
  },
  {
    area: 'A07',
    path: 'KNOWLEDGE_LIBRARY_360_A07_P4_PASS4_G18_DECISION_DOSSIERS_20261023.json',
    key: 'dossiers',
    id: (r) => r.family,
    title: (r) => r.capability,
  },
  {
    area: 'A08',
    path: 'KNOWLEDGE_LIBRARY_360_A08_P4_G18_DECISIONS_AND_NOT_RUN_TRIALS_20261023.json',
    key: 'dossiers',
    id: (r) => r.family,
    title: (r) => r.goal,
  },
  {
    area: 'A09',
    path: 'KNOWLEDGE_LIBRARY_360_A09_P4_G18_DECISIONS_AND_NOT_RUN_TRIALS_20261023.json',
    key: 'dossiers',
    id: (r) => r.family,
    title: (r) => r.problem,
  },
  {
    area: 'A10',
    path: 'KNOWLEDGE_LIBRARY_360_A10_P4_G18_DECISION_DOSSIERS_20261023.json',
    key: 'dossiers',
    id: (r) => r.family,
    title: (r) => r.goal,
  },
  {
    area: 'A11',
    path: 'KNOWLEDGE_LIBRARY_360_A11_P4_G18_DECISION_DOSSIERS_20261023.json',
    key: 'dossiers',
    id: (r) => r.family,
    title: (r) => r.goal,
  },
];
const legacyPath = join(process.cwd(), 'data/generated/technology-library.json');
const outputPath = join(process.cwd(), 'data/generated/library-360.json');

const head = execFileSync('git', ['-C', pasDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== mainSha) throw new Error('PAS HEAD differs from requested source commit');

function blobSha(contents) {
  const bytes = Buffer.from(contents, 'utf8');
  const header = Buffer.from('blob ' + bytes.length + '\0', 'utf8');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}
function pasFile(file) {
  if (!file.startsWith(srcPrefix) || file.includes('..')) throw new Error('Unsafe PAS path');
  const raw = readFileSync(join(pasDir, file), 'utf8');
  const sha = blobSha(raw);
  const expected = execFileSync('git', ['-C', pasDir, 'rev-parse', mainSha + ':' + file], {
    encoding: 'utf8',
  }).trim();
  if (sha !== expected) throw new Error('Source file differs from PAS commit: ' + file);
  return { data: JSON.parse(raw), sha };
}
const { data: index, sha: indexSha } = pasFile(indexPath);
const { data: cross, sha: crossSha } = pasFile(crossPath);
const { data: nav, sha: navSha } = pasFile(navPath);
const candidateInputs = Object.fromEntries(
  Object.entries(candidateSourcePaths).map(([area, path]) => [
    area,
    { ...pasFile(srcPrefix + path), path: srcPrefix + path },
  ]),
);
const dossierInputs = dossierSources.map((spec) => ({
  ...spec,
  ...pasFile(srcPrefix + spec.path),
  fullPath: srcPrefix + spec.path,
}));
const legacyRaw = readFileSync(legacyPath, 'utf8');
const legacy = JSON.parse(legacyRaw);
const entries = index.categories.flatMap((category) => pasFile(category.path).data.entries);
if (entries.length !== 193 || cross.entries.length !== 193 || legacy.totalEntries !== 193) {
  throw new Error('Expected 193 TL identities in all authoritative/legacy inputs');
}
const byId = new Map(entries.map((entry) => [entry.id, entry]));
const legacyById = new Map(
  legacy.categories.flatMap((c) => c.entries).map((entry) => [entry.id, entry]),
);
const crossById = new Map(cross.entries.map((entry) => [entry.resource_id, entry]));
if (byId.size !== 193 || legacyById.size !== 193 || crossById.size !== 193) {
  throw new Error('Duplicate IDs in one of the authoritative inputs');
}
const reportByCode = new Map(nav.areas.map((area) => [area.id, area.report]));
const areas = cross.areas.map((area) => {
  const report = reportByCode.get(area.id.slice(0, 3));
  if (!report) throw new Error('Missing research report for area ' + area.id);
  return {
    id: area.id,
    label: area.title,
    code: area.id.slice(0, 3),
    researchStatus: 'EVIDENCE_READY_DOCUMENTARY_ONLY',
    researchReportPath: report.path,
    researchReportBlobSha: report.sha,
    entries: [],
    researchCases: [],
    candidateReferences: [],
  };
});
const areaMap = new Map(areas.map((area) => [area.id, area]));
for (const original of entries) {
  const old = legacyById.get(original.id),
    classification = crossById.get(original.id);
  if (
    !old ||
    !classification ||
    old.name !== original.name ||
    classification.name_for_review !== original.name ||
    old.repository !== original.repository ||
    old.sourceUrl !== original.sources[0]?.url
  )
    throw new Error('Identity/source mismatch: ' + original.id);
  for (const field of [
    'kind',
    'status',
    'attention',
    'summary',
    'application',
    'benefit',
    'caution',
    'tags',
  ]) {
    if (JSON.stringify(old[field]) !== JSON.stringify(original[field])) {
      throw new Error('Preserved field changed: ' + original.id + '/' + field);
    }
  }
  const bucket = areaMap.get(classification.proposed_primary_area);
  if (!bucket || !classification.proposed_secondary_areas.every((id) => areaMap.has(id))) {
    throw new Error('Unknown classification area: ' + original.id);
  }
  if (classification.proposed_secondary_areas.includes(bucket.id)) {
    throw new Error('Primary area duplicated in secondary facets: ' + original.id);
  }
  bucket.entries.push({
    ...old,
    legacyCategoryId: classification.source_category,
    relatedAreaIds: classification.proposed_secondary_areas,
    classificationStatus: classification.classification_status,
    sourceReferences: original.sources.map((reference) => ({
      label: reference.label,
      url: reference.url,
      verifiedAt: reference.verified_at,
    })),
  });
}
const total = areas.reduce((acc, area) => acc + area.entries.length, 0);
if (
  total !== 193 ||
  new Set(areas.flatMap((area) => area.entries).map((entry) => entry.id)).size !== 193
) {
  throw new Error('Crosswalk did not preserve every identity exactly once');
}
const source = {
  repository: 'franciscovitar/personal-ai-system',
  ref: 'main',
  commit: mainSha,
  generatedAt: date,
  observedAt: legacy.source.observedAt,
  staleAfterDays: legacy.source.staleAfterDays,
  canonicalRef: indexPath,
  canonicalIndexBlobSha: indexSha,
  crosswalkRef: crossPath,
  crosswalkBlobSha: crossSha,
  researchNavigationRef: navPath,
  researchNavigationBlobSha: navSha,
  researchContentSources: [
    ...Object.entries(candidateInputs).map(([area, input]) => ({
      area,
      path: input.path,
      blobSha: input.sha,
    })),
    ...dossierInputs.map((input) => ({
      area: input.area,
      path: input.fullPath,
      blobSha: input.sha,
    })),
  ],
  legacyDerivativeRef: 'data/generated/technology-library.json',
  legacyDerivativeBlobSha: blobSha(legacyRaw),
  legacyDerivativeCommit: legacy.source.commit,
  provenanceNote:
    'PAS main pins reference corpus; individual tool metadata observedAt remains the original TL September 2026 date. Crosswalk PROPOSED_NOT_VERIFIED; G research only documentary.',
};

const tlByRepository = new Map(entries.map((entry) => [entry.repository.toLowerCase(), entry.id]));
const crossRepoHolds = new Set([
  'appflowy-io/appflowy',
  'electron/electron',
  'evidence-dev/evidence',
  'expo/expo',
  'flutter/flutter',
  'marimo-team/marimo',
  'pact-foundation/pact-js',
  'penpot/penpot',
  'pwa-builder/pwabuilder',
  'rilldata/rill',
  'schemathesis/schemathesis',
  'tauri-apps/tauri',
  'testcontainers/testcontainers-node',
]);
const mentionAudit = [];
const identityHolds = [];
const candidateRefs = [];
const attachedMentionRefs = new Map();
function addAttached(tlId, ref) {
  const refs = attachedMentionRefs.get(tlId) ?? [];
  refs.push(ref);
  attachedMentionRefs.set(tlId, refs);
}
function repoRoot(value) {
  if (!value) return null;
  const stripped = String(value)
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
  return /^[^/]+\/[^/]+$/.test(stripped) ? stripped.toLowerCase() : null;
}
function mention(
  area,
  id,
  name,
  sourcePath,
  sourceBlobSha,
  identity,
  disposition,
  reason,
  tlId = null,
) {
  const item = {
    area,
    id,
    name,
    sourcePath,
    sourceBlobSha,
    identity: identity ?? null,
    disposition,
    reason,
  };
  if (tlId) item.existingResourceId = tlId;
  mentionAudit.push(item);
}
const seenCandidateIdentities = new Set();
for (const row of candidateInputs.A01.data.rows) {
  const root = repoRoot(row.official_code_repository_identity);
  const tlId = row.canonical_193_match;
  const ref = {
    sourceId: row.a01_record_id,
    sourcePath: candidateInputs.A01.path,
    sourceBlobSha: candidateInputs.A01.sha,
    sourceCheckedAt: row.checked_at,
  };
  if (tlId) {
    addAttached(tlId, { ...ref, disposition: 'ATTACHED_TO_EXISTING_TL' });
    mention(
      'A01',
      row.a01_record_id,
      row.name,
      ref.sourcePath,
      ref.sourceBlobSha,
      root,
      'ATTACHED_TO_EXISTING_TL',
      'Exact PAS canonical TL match',
      tlId,
    );
  } else if (row.triage_decision === 'HOLD_OR_RESTRICTED') {
    mention(
      'A01',
      row.a01_record_id,
      row.name,
      ref.sourcePath,
      ref.sourceBlobSha,
      root,
      'HOLD',
      row.triage_decision,
    );
    identityHolds.push({
      id: row.a01_record_id,
      name: row.name,
      area: 'A01',
      repository: root,
      reason: row.triage_decision,
    });
  } else if (row.name.trim().toLowerCase() === 'orval') {
    mention(
      'A01',
      row.a01_record_id,
      row.name,
      ref.sourcePath,
      ref.sourceBlobSha,
      root,
      'HOLD',
      'ORVAL_ALIAS_REVIEW_NO_COMMON_REPOSITORY',
    );
    identityHolds.push({
      id: row.a01_record_id,
      name: row.name,
      area: 'A01',
      repository: root,
      reason: 'ORVAL_ALIAS_REVIEW_NO_COMMON_REPOSITORY',
    });
  } else if (root && crossRepoHolds.has(root)) {
    mention(
      'A01',
      row.a01_record_id,
      row.name,
      ref.sourcePath,
      ref.sourceBlobSha,
      root,
      'HOLD',
      'Shared repository requires component/edition review',
    );
    identityHolds.push({
      id: row.a01_record_id,
      name: row.name,
      area: 'A01',
      repository: root,
      reason: 'SAME_REPOSITORY_COMPONENT_EDITION_REVIEW',
    });
  } else if (row.a02_repo_match) {
    mention(
      'A01',
      row.a01_record_id,
      row.name,
      ref.sourcePath,
      ref.sourceBlobSha,
      root,
      'HOLD',
      'Cross-area identity requires component/edition review',
    );
    identityHolds.push({
      id: row.a01_record_id,
      name: row.name,
      area: 'A01',
      repository: root,
      reason: 'A01_A02_IDENTITY_REVIEW',
    });
  } else if (
    root &&
    ['REFERENCE_LEARN_OR_REUSE', 'EVALUATE_IF_FIT'].includes(row.triage_decision)
  ) {
    const identity = 'repo:' + root;
    if (seenCandidateIdentities.has(identity)) {
      mention(
        'A01',
        row.a01_record_id,
        row.name,
        ref.sourcePath,
        ref.sourceBlobSha,
        root,
        'DEDUPLICATED_CANDIDATE_MENTION',
        'One candidate reference per repository identity',
      );
    } else {
      seenCandidateIdentities.add(identity);
      const candidate = {
        id: row.a01_record_id,
        area: 'A01',
        name: row.name,
        identity: root,
        referenceUrl: row.source_links[0],
        subcategory: row.family,
        candidateStatus: 'CANDIDATE_PENDING_REVIEW',
        rightsStatus: 'NOT_CERTIFIED',
        testStatus: row.P4_executed ? 'EXECUTED_SOURCE_RECORD' : 'NOT_RUN',
        adoptionStatus: row.adopted ? 'AUTHORIZED_SOURCE_RECORD' : 'NOT_AUTHORIZED',
        sourcePath: ref.sourcePath,
        sourceBlobSha: ref.sourceBlobSha,
        sourceCheckedAt: row.checked_at,
        triage: row.triage_decision,
      };
      candidateRefs.push(candidate);
      mention(
        'A01',
        row.a01_record_id,
        row.name,
        ref.sourcePath,
        ref.sourceBlobSha,
        root,
        'CANDIDATE_PENDING_REVIEW',
        'Triage allows reference; identity is a repository, rights and edition remain unverified',
      );
    }
  } else {
    mention(
      'A01',
      row.a01_record_id,
      row.name,
      ref.sourcePath,
      ref.sourceBlobSha,
      root,
      'HOLD',
      'Identity, repository, product or edition not sufficiently resolved',
    );
    identityHolds.push({
      id: row.a01_record_id,
      name: row.name,
      area: 'A01',
      repository: root,
      reason: 'IDENTITY_OR_EDITION_UNVERIFIED',
    });
  }
}
for (const row of candidateInputs.A02.data.rows) {
  const root = repoRoot(row.repository);
  const ref = {
    sourceId: row.id,
    sourcePath: candidateInputs.A02.path,
    sourceBlobSha: candidateInputs.A02.sha,
    sourceCheckedAt: row.source_checked_at,
  };
  if (row.canonical_193_match) {
    addAttached(row.canonical_193_match, { ...ref, disposition: 'ATTACHED_TO_EXISTING_TL' });
    mention(
      'A02',
      row.id,
      row.name,
      ref.sourcePath,
      ref.sourceBlobSha,
      root,
      'ATTACHED_TO_EXISTING_TL',
      'Explicit PAS canonical TL match',
      row.canonical_193_match,
    );
  } else if (
    row.A01_record_match ||
    (root && crossRepoHolds.has(root)) ||
    row.name.toLowerCase() === 'orval'
  ) {
    const reason =
      row.name.toLowerCase() === 'orval'
        ? 'ORVAL_ALIAS_REVIEW_NO_COMMON_REPOSITORY'
        : 'SAME_REPOSITORY_COMPONENT_EDITION_REVIEW';
    mention('A02', row.id, row.name, ref.sourcePath, ref.sourceBlobSha, root, 'HOLD', reason);
    identityHolds.push({ id: row.id, name: row.name, area: 'A02', repository: root, reason });
  } else if (
    ['G_CORE_SOFTWARE', 'G_ADJACENT_DIGITAL'].includes(row.GPD_fit) &&
    row.license_evidence_state === 'VERIFIED_ROOT_CODE_FILE' &&
    row.root_license_current_review?.source_url?.startsWith('https://') &&
    root
  ) {
    const identity = 'repo:' + root;
    if (seenCandidateIdentities.has(identity)) {
      mention(
        'A02',
        row.id,
        row.name,
        ref.sourcePath,
        ref.sourceBlobSha,
        root,
        'DEDUPLICATED_CANDIDATE_MENTION',
        'One candidate reference per repository identity',
      );
    } else {
      seenCandidateIdentities.add(identity);
      candidateRefs.push({
        id: row.id,
        area: 'A02',
        name: row.name,
        identity: root,
        referenceUrl: row.root_license_current_review.source_url,
        subcategory: row.GPD_fit,
        candidateStatus: 'CANDIDATE_PENDING_REVIEW',
        rightsStatus: 'ROOT_FILE_ONLY_COMMERCIAL_SCOPE_UNVERIFIED',
        testStatus: 'NOT_RUN',
        adoptionStatus: 'NOT_AUTHORIZED',
        sourcePath: ref.sourcePath,
        sourceBlobSha: ref.sourceBlobSha,
        sourceCheckedAt: row.source_checked_at,
        licenseEvidence: row.root_license_current_review.value,
      });
      mention(
        'A02',
        row.id,
        row.name,
        ref.sourcePath,
        ref.sourceBlobSha,
        root,
        'CANDIDATE_PENDING_REVIEW',
        'Root license file checked; product edition and commercial eligibility still require review',
      );
    }
  } else {
    mention(
      'A02',
      row.id,
      row.name,
      ref.sourcePath,
      ref.sourceBlobSha,
      root,
      'HOLD',
      'Rights, source identity or product edition not sufficiently verified',
    );
    identityHolds.push({
      id: row.id,
      name: row.name,
      area: 'A02',
      repository: root,
      reason: 'RIGHTS_OR_IDENTITY_UNVERIFIED',
    });
  }
}
for (const row of candidateInputs.A12.data.selected_candidates) {
  const root = repoRoot(row.repo_url);
  const ref = {
    sourceId: row.candidate_id,
    sourcePath: candidateInputs.A12.path,
    sourceBlobSha: candidateInputs.A12.sha,
    sourceCheckedAt: row.checked_at,
  };
  const tlId = row.existing_library_match;
  if (tlId) {
    addAttached(tlId, { ...ref, disposition: 'ATTACHED_TO_EXISTING_TL' });
    mention(
      'A12',
      row.candidate_id,
      row.name,
      ref.sourcePath,
      ref.sourceBlobSha,
      root,
      'ATTACHED_TO_EXISTING_TL',
      'Explicit existing library match',
      tlId,
    );
  } else if (!['NEW_CANDIDATE', 'WATCH'].includes(row.research_status)) {
    mention(
      'A12',
      row.candidate_id,
      row.name,
      ref.sourcePath,
      ref.sourceBlobSha,
      root,
      'HOLD',
      'Source triage excludes this reference',
    );
    identityHolds.push({
      id: row.candidate_id,
      name: row.name,
      area: 'A12',
      repository: root,
      reason: 'SOURCE_TRIAGE_EXCLUSION_' + row.research_status,
    });
  } else if (root && (crossRepoHolds.has(root) || tlByRepository.has(root))) {
    const tlMatch = tlByRepository.get(root);
    mention(
      'A12',
      row.candidate_id,
      row.name,
      ref.sourcePath,
      ref.sourceBlobSha,
      root,
      tlMatch ? 'HOLD' : 'HOLD',
      tlMatch
        ? 'Repository identity conflicts with an existing TL resource; exact product/edition review required'
        : 'Shared repository requires component/edition review',
      tlMatch ?? null,
    );
    identityHolds.push({
      id: row.candidate_id,
      name: row.name,
      area: 'A12',
      repository: root,
      reason: 'REPOSITORY_IDENTITY_REVIEW',
    });
  } else {
    const publicUrl = row.primary_reference_url;
    const identity = root
      ? 'repo:' + root
      : 'ref:' + (publicUrl ?? '').toLowerCase().replace(/[?#].*$/, '');
    if (!publicUrl?.startsWith('https://') || seenCandidateIdentities.has(identity)) {
      mention(
        'A12',
        row.candidate_id,
        row.name,
        ref.sourcePath,
        ref.sourceBlobSha,
        root ?? identity,
        'HOLD',
        !publicUrl?.startsWith('https://')
          ? 'No public identity reference'
          : 'Duplicate repository, edition or product mention',
      );
      identityHolds.push({
        id: row.candidate_id,
        name: row.name,
        area: 'A12',
        repository: root,
        reason: 'IDENTITY_OR_DUPLICATE_REVIEW',
      });
    } else {
      seenCandidateIdentities.add(identity);
      candidateRefs.push({
        id: row.candidate_id,
        area: 'A12',
        name: row.name,
        identity: root ?? identity.slice(4),
        referenceUrl: publicUrl,
        subcategory: row.subarea,
        resourceType: row.resource_type,
        candidateStatus: 'CANDIDATE_PENDING_REVIEW',
        rightsStatus: 'NOT_CERTIFIED',
        testStatus: row.trial_executed ? 'EXECUTED_SOURCE_RECORD' : 'NOT_RUN',
        adoptionStatus: row.adopted ? 'AUTHORIZED_SOURCE_RECORD' : 'NOT_AUTHORIZED',
        sourcePath: ref.sourcePath,
        sourceBlobSha: ref.sourceBlobSha,
        sourceCheckedAt: row.checked_at,
        sourceResearchStatus: row.research_status,
        licenseNote: row.license_code,
      });
      mention(
        'A12',
        row.candidate_id,
        row.name,
        ref.sourcePath,
        ref.sourceBlobSha,
        root ?? identity,
        'CANDIDATE_PENDING_REVIEW',
        'Source class permits a reference candidate; rights and fit remain unapproved',
      );
    }
  }
}
// Discovery and recommendation are separate gates. A missing commercial licence
// review is NOT a reason to hide a verifiable reference from the AI library.
// Hold only explicit source restrictions, exclusions and unresolved cross-area identities.
const sourceRows = {
  A01: new Map(candidateInputs.A01.data.rows.map((row) => [row.a01_record_id, row])),
  A02: new Map(candidateInputs.A02.data.rows.map((row) => [row.id, row])),
  A12: new Map(
    candidateInputs.A12.data.selected_candidates.map((row) => [row.candidate_id, row]),
  ),
};
const discoveryReasons = new Set([
  'Identity, repository, product or edition not sufficiently resolved',
  'Rights, source identity or product edition not sufficiently verified',
]);
const newlyDiscoveredIds = new Set();
for (const auditRow of mentionAudit) {
  if (auditRow.disposition !== 'HOLD' || !discoveryReasons.has(auditRow.reason)) continue;
  const row = sourceRows[auditRow.area]?.get(auditRow.id);
  if (!row) throw new Error('Discovery source row missing: ' + auditRow.id);
  // Archived/restricted A02 projects remain genuinely held.
  if (auditRow.area === 'A02' && row.GPD_fit === 'HOLD_ARCHIVED_OR_RESTRICTED') continue;
  const referenceUrl =
    auditRow.area === 'A01'
      ? row.source_links?.[0]
      : auditRow.area === 'A02'
        ? row.source_url
        : row.primary_reference_url;
  if (typeof referenceUrl !== 'string' || !referenceUrl.startsWith('https://')) {
    continue;
  }
  const identity = auditRow.identity
    ? 'repo:' + auditRow.identity
    : 'source:' + auditRow.area + ':' + auditRow.id;
  if (seenCandidateIdentities.has(identity)) continue; // do not auto-merge editions
  seenCandidateIdentities.add(identity);
  candidateRefs.push({
    id: auditRow.id,
    area: auditRow.area,
    name: auditRow.name,
    identity: auditRow.identity ?? identity,
    referenceUrl,
    subcategory: row.family ?? row.GPD_fit ?? row.subarea,
    candidateStatus: 'CANDIDATE_PENDING_REVIEW',
    rightsStatus: 'NOT_CERTIFIED_REVALIDATE_ON_USE',
    testStatus: 'NOT_RUN',
    adoptionStatus: 'NOT_AUTHORIZED',
    sourcePath: auditRow.sourcePath,
    sourceBlobSha: auditRow.sourceBlobSha,
    sourceCheckedAt: row.checked_at ?? row.source_checked_at,
    sourceScope: row.triage_decision ?? row.GPD_fit ?? row.research_status,
  });
  auditRow.disposition = 'CANDIDATE_PENDING_REVIEW';
  auditRow.reason = 'DISCOVERED_NOT_VERIFIED_RECHECK_FOR_RECOMMENDATION';
  newlyDiscoveredIds.add(auditRow.area + ':' + auditRow.id);
}
for (let i = identityHolds.length - 1; i >= 0; i--) {
  if (newlyDiscoveredIds.has(identityHolds[i].area + ':' + identityHolds[i].id)) {
    identityHolds.splice(i, 1);
  }
}
// No candidate is tested, licensed or adopted merely because it is discoverable.
for (const candidate of candidateRefs) {
  candidate.knowledgeStatus = 'DISCOVERED_NOT_VERIFIED';
  candidate.sourceScope ??=
    candidate.triage ?? candidate.sourceResearchStatus ?? candidate.subcategory;
  if (candidate.testStatus !== 'NOT_RUN' || candidate.adoptionStatus !== 'NOT_AUTHORIZED') {
    throw new Error('Cannot expose source claiming a trial or adoption: ' + candidate.id);
  }
}

for (const [tlId, refs] of attachedMentionRefs) {
  const resource = byId.get(tlId);
  const viewResource = areaMap
    .get(crossById.get(tlId).proposed_primary_area)
    .entries.find((entry) => entry.id === tlId);
  if (resource && viewResource) viewResource.researchMentionRefs = refs;
}
for (const area of areas) {
  area.candidateReferences = candidateRefs
    .filter((candidate) => candidate.area === area.code)
    .map((candidate) => candidate.id);
}

function getField(record, fields) {
  for (const field of fields)
    if (typeof record[field] === 'string' && record[field].trim()) return record[field];
  return null;
}
const researchCases = [];
for (const spec of dossierInputs) {
  const rows = spec.data[spec.key];
  const area =
    areaMap.get(
      spec.area +
        '_' +
        ({
          A03: 'AI_MODELS_APIS',
          A04: 'DATA_DISCOVERY',
          A05: 'APIS_INTEGRATIONS',
          A06: 'RESEARCH_DISCOVERY',
          A07: 'BENCHMARKS',
          A08: 'SECURITY',
          A09: 'COMMUNITY_KNOWLEDGE',
          A10: 'EDUCATION_BENEFITS',
          A11: 'OPERATIONS',
        }[spec.area] ?? ''),
    ) ?? areas.find((item) => item.code === spec.area);
  if (!Array.isArray(rows)) throw new Error('Missing dossier array for ' + spec.area);
  for (const record of rows) {
    const id = String(spec.id(record));
    const title = String(spec.title(record));
    const sourceUrl = getField(record, ['primary_url', 'primary_source', 'source', 'source_url']);
    const item = {
      id: spec.area + '-' + id,
      areaCode: spec.area,
      title,
      topic:
        getField(record, ['use_case', 'capability', 'goal', 'problem', 'question', 'area']) ??
        title,
      alternatives: getField(record, ['alternatives', 'candidates', 'examples']),
      noChange: getField(record, ['NO_CHANGE_baseline', 'NO_CHANGE', 'NO_CHANGE_baseline']),
      limitations: getField(record, [
        'rights_limitations',
        'rights_and_cost',
        'cost_and_rights',
        'rights',
        'limits',
        'limitations',
        'conditions',
        'constraints',
        'critical_limit',
        'cautions',
        'risk',
      ]),
      decision: getField(record, ['decision', 'policy']),
      trialPlan: getField(record, [
        'trial_NOT_RUN',
        'trial_not_run',
        'synthetic_test_NOT_RUN',
        'synthetic_fixture_NOT_CREATED',
      ]),
      trialStatus: 'NOT_RUN',
      adoptionStatus: 'NOT_AUTHORIZED',
      evidenceKind: 'DOCUMENTARY_RESEARCH_CASE',
      sourceUrl: sourceUrl?.startsWith('https://') ? sourceUrl : null,
      sourcePath: spec.fullPath,
      sourceBlobSha: spec.sha,
    };
    if (!item.sourceUrl) throw new Error('Dossier missing public source URL: ' + item.id);
    item.searchText = [
      item.id,
      item.title,
      item.topic,
      item.alternatives,
      item.noChange,
      item.limitations,
      item.decision,
      item.trialPlan,
      sourceUrl,
    ]
      .filter(Boolean)
      .join(' ');
    researchCases.push(item);
    if (area) area.researchCases.push(item.id);
  }
}
for (const candidate of candidateRefs) {
  candidate.searchText = Object.values(candidate)
    .filter((value) => typeof value === 'string')
    .join(' ');
}
if (
  researchCases.length !== 154 ||
  mentionAudit.length !== 356 ||
  candidateRefs.length !== 272 ||
  mentionAudit.filter((row) => row.disposition === 'HOLD').length !== 42
) {
  throw new Error(
    `Content intake mismatch: ${researchCases.length} dossiers, ${mentionAudit.length} mentions, ${candidateRefs.length} candidate references`,
  );
}
for (const area of areas) area.entries.sort((a, b) => a.id.localeCompare(b.id));
const prettierOptions = (await resolveConfig(outputPath)) ?? {};
const result = await format(
  JSON.stringify(
    {
      schemaVersion: 3,
      source,
      totalEntries: total,
      spotlightIds: legacy.spotlightIds,
      areas,
      researchCases,
      candidateReferences: candidateRefs,
      identityHolds,
      researchMentionAudit: mentionAudit,
      researchReview: {
        sourceMentionCount: mentionAudit.length,
        attachedToExistingResourceCount: mentionAudit.filter(
          (item) => item.disposition === 'ATTACHED_TO_EXISTING_TL',
        ).length,
        candidateReferenceCount: candidateRefs.length,
        holdCount: mentionAudit.filter((item) => item.disposition === 'HOLD').length,
        deduplicatedMentionCount: mentionAudit.filter(
          (item) => item.disposition === 'DEDUPLICATED_CANDIDATE_MENTION',
        ).length,
        sameRepositoryGroupsHeld: crossRepoHolds.size,
        nameCollisionHolds: new Set(
          identityHolds
            .filter((item) => item.reason === 'ORVAL_ALIAS_REVIEW_NO_COMMON_REPOSITORY')
            .map((item) => item.name.toLowerCase()),
        ).size,
        decision: 'NO_COMMERCIAL_RIGHTS_OR_ADOPTION_CERTIFIED',
      },
    },
    null,
    2,
  ),
  { ...prettierOptions, parser: 'json' },
);
if (mode === '--write') {
  writeFileSync(outputPath, result, 'utf8');
} else if (result !== readFileSync(outputPath, 'utf8')) {
  throw new Error('V2 derivative differs from pinned PAS source; run --write in a review branch');
}
process.stdout.write(
  JSON.stringify({
    result: mode === '--write' ? 'WRITTEN' : 'PASS',
    sourceCommit: mainSha,
    identityCount: total,
    researchCases: researchCases.length,
    candidateReferences: candidateRefs.length,
    mentionDispositions: Object.fromEntries(
      [...new Set(mentionAudit.map((m) => m.disposition))].map((status) => [
        status,
        mentionAudit.filter((m) => m.disposition === status).length,
      ]),
    ),
    counts: areas.map((a) => [a.code, a.entries.length]),
  }) + '\n',
);
