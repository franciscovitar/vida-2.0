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

const [pasDirArg, mainSha, date, mode = '--check'] = process.argv.slice(2);
if (!pasDirArg || !/^[a-f0-9]{40}$/.test(mainSha ?? '') ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ||
    !['--check', '--write'].includes(mode)) {
  throw new Error('Usage: node scripts/build-library360-derivative.mjs <PAS-checkout> <sha40> <YYYY-MM-DD> <--check|--write>');
}
const pasDir = resolve(pasDirArg);
const srcPrefix = 'AI/projects/professional-intelligence/';
const indexPath = srcPrefix + 'TECHNOLOGY_LIBRARY_INDEX_V1.json';
const crossPath = srcPrefix + 'KNOWLEDGE_LIBRARY_360_INVENTORY_PROPOSAL_V1.json';
const navPath = srcPrefix + 'KNOWLEDGE_LIBRARY_360_GLOBAL_FINAL_G_READER_NAV_20261024.json';
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
const legacyRaw = readFileSync(legacyPath, 'utf8');
const legacy = JSON.parse(legacyRaw);
const entries = index.categories.flatMap((category) => pasFile(category.path).data.entries);
if (entries.length !== 193 || cross.entries.length !== 193 || legacy.totalEntries !== 193) {
  throw new Error('Expected 193 TL identities in all authoritative/legacy inputs');
}
const byId = new Map(entries.map((entry) => [entry.id, entry]));
const legacyById = new Map(legacy.categories.flatMap((c) => c.entries).map((entry) => [entry.id, entry]));
const crossById = new Map(cross.entries.map((entry) => [entry.resource_id, entry]));
if (byId.size !== 193 || legacyById.size !== 193 || crossById.size !== 193) {
  throw new Error('Duplicate IDs in one of the authoritative inputs');
}
const reportByCode = new Map(nav.areas.map((area) => [area.id, area.report]));
const areas = cross.areas.map((area) => {
  const report = reportByCode.get(area.id.slice(0, 3));
  if (!report) throw new Error('Missing research report for area ' + area.id);
  return {
    id: area.id, label: area.title, code: area.id.slice(0, 3),
    researchStatus: 'EVIDENCE_READY_DOCUMENTARY_ONLY',
    researchReportPath: report.path, researchReportBlobSha: report.sha, entries: [],
  };
});
const areaMap = new Map(areas.map((area) => [area.id, area]));
for (const original of entries) {
  const old = legacyById.get(original.id), classification = crossById.get(original.id);
  if (!old || !classification || old.name !== original.name ||
      classification.name_for_review !== original.name ||
      old.repository !== original.repository ||
      old.sourceUrl !== original.sources[0]?.url) throw new Error('Identity/source mismatch: ' + original.id);
  for (const field of ['kind', 'status', 'attention', 'summary', 'application', 'benefit', 'caution', 'tags']) {
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
    ...old, legacyCategoryId: classification.source_category,
    relatedAreaIds: classification.proposed_secondary_areas,
    classificationStatus: classification.classification_status,
  });
}
const total = areas.reduce((acc, area) => acc + area.entries.length, 0);
if (total !== 193 || new Set(areas.flatMap((area) => area.entries).map((entry) => entry.id)).size !== 193) {
  throw new Error('Crosswalk did not preserve every identity exactly once');
}
const source = {
  repository: 'franciscovitar/personal-ai-system', ref: 'main', commit: mainSha,
  generatedAt: date, observedAt: legacy.source.observedAt,
  staleAfterDays: legacy.source.staleAfterDays,
  canonicalRef: indexPath, canonicalIndexBlobSha: indexSha,
  crosswalkRef: crossPath, crosswalkBlobSha: crossSha,
  researchNavigationRef: navPath, researchNavigationBlobSha: navSha,
  legacyDerivativeRef: 'data/generated/technology-library.json',
  legacyDerivativeBlobSha: blobSha(legacyRaw),
  legacyDerivativeCommit: legacy.source.commit,
  provenanceNote: 'PAS main pins reference corpus; individual tool metadata observedAt remains the original TL September 2026 date. Crosswalk PROPOSED_NOT_VERIFIED; G research only documentary.',
};
const result = JSON.stringify({
  schemaVersion: 2, source, totalEntries: total,
  spotlightIds: legacy.spotlightIds, areas,
}, null, 2) + '\n';
if (mode === '--write') {
  writeFileSync(outputPath, result, 'utf8');
} else if (result !== readFileSync(outputPath, 'utf8')) {
  throw new Error('V2 derivative differs from pinned PAS source; run --write in a review branch');
}
process.stdout.write(JSON.stringify({
  result: mode === '--write' ? 'WRITTEN' : 'PASS',
  sourceCommit: mainSha, identityCount: total,
  counts: areas.map((a) => [a.code, a.entries.length]),
}) + '\n');
