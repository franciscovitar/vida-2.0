import type {
  Library360Area,
  Library360Data,
  Library360Entry,
  Library360Snapshot,
} from '@/types/library-360';

const STATES = new Set(['CURRENT_STACK', 'ASSESS_NOW', 'WATCH', 'REFERENCE', 'HOLD', 'ARCHIVED']);
const ATTENTION = new Set(['NOW', 'WHEN_NEEDED', 'LIBRARY']);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sha(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

function isoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}

function sourceReference(value: unknown): boolean {
  if (!record(value)) return false;
  return (
    text(value.label) &&
    text(value.url) &&
    value.url.startsWith('https://') &&
    isoDate(value.verifiedAt)
  );
}

function entry(value: unknown): value is Library360Entry {
  if (!record(value)) return false;
  return (
    text(value.id) &&
    /^TL-\d{3}$/.test(value.id) &&
    [
      'name',
      'kind',
      'summary',
      'application',
      'benefit',
      'caution',
      'repository',
      'sourceUrl',
      'legacyCategoryId',
    ].every((key) => text(value[key])) &&
    (value.sourceUrl as string).startsWith('https://') &&
    STATES.has(value.status as string) &&
    ATTENTION.has(value.attention as string) &&
    strings(value.tags) &&
    (value.tags as string[]).length > 0 &&
    strings(value.relatedAreaIds) &&
    value.classificationStatus === 'PROPOSED_NOT_VERIFIED' &&
    Array.isArray(value.sourceReferences) &&
    value.sourceReferences.length > 0 &&
    value.sourceReferences.every(sourceReference)
  );
}

function area(value: unknown): value is Library360Area {
  if (!record(value)) return false;
  return (
    text(value.id) &&
    /^A(0[1-9]|1[0-2])_[A-Z0-9_]+$/.test(value.id) &&
    value.code === (value.id as string).slice(0, 3) &&
    text(value.label) &&
    value.researchStatus === 'EVIDENCE_READY_DOCUMENTARY_ONLY' &&
    text(value.researchReportPath) &&
    (value.researchReportPath as string).startsWith('AI/projects/professional-intelligence/') &&
    !(value.researchReportPath as string).includes('..') &&
    (value.researchReportPath as string).endsWith('.md') &&
    sha(value.researchReportBlobSha) &&
    Array.isArray(value.entries) &&
    value.entries.every(entry)
  );
}

export function parseLibrary360Snapshot(value: unknown): Library360Snapshot | null {
  if (!record(value) || value.schemaVersion !== 2 || !record(value.source)) return null;
  const source = value.source;
  if (
    source.repository !== 'franciscovitar/personal-ai-system' ||
    source.ref !== 'main' ||
    !sha(source.commit) ||
    !sha(source.canonicalIndexBlobSha) ||
    !sha(source.crosswalkBlobSha) ||
    !sha(source.researchNavigationBlobSha) ||
    !sha(source.legacyDerivativeBlobSha) ||
    !sha(source.legacyDerivativeCommit) ||
    ![
      'generatedAt',
      'observedAt',
      'canonicalRef',
      'crosswalkRef',
      'researchNavigationRef',
      'legacyDerivativeRef',
      'provenanceNote',
    ].every((key) => text(source[key])) ||
    typeof source.staleAfterDays !== 'number' ||
    !Number.isFinite(source.staleAfterDays) ||
    source.staleAfterDays <= 0 ||
    typeof value.totalEntries !== 'number' ||
    !Number.isInteger(value.totalEntries) ||
    value.totalEntries < 1 ||
    !strings(value.spotlightIds) ||
    !Array.isArray(value.areas) ||
    value.areas.length !== 12 ||
    !value.areas.every(area)
  )
    return null;

  const areas = value.areas as Library360Area[];
  const areaIds = areas.map((item) => item.id);
  if (new Set(areaIds).size !== 12) return null;
  const expectedCodes = Array.from({ length: 12 }, (_, i) => 'A' + String(i + 1).padStart(2, '0'));
  if (
    new Set(areas.map((item) => item.code)).size !== 12 ||
    !expectedCodes.every((code) => areas.some((item) => item.code === code))
  )
    return null;

  const knownAreas = new Set(areaIds);
  const resources = areas.flatMap((item) => item.entries);
  const ids = resources.map((item) => item.id);
  const repositories = resources.map((item) => item.repository.toLowerCase());
  if (
    resources.length !== value.totalEntries ||
    new Set(ids).size !== ids.length ||
    new Set(repositories).size !== repositories.length ||
    resources.some(
      (item) =>
        new Set(item.relatedAreaIds).size !== item.relatedAreaIds.length ||
        item.relatedAreaIds.some((id) => !knownAreas.has(id)),
    ) ||
    areas.some((item) => item.entries.some((resource) => resource.relatedAreaIds.includes(item.id)))
  )
    return null;

  const knownIds = new Set(ids);
  if (
    new Set(value.spotlightIds).size !== value.spotlightIds.length ||
    value.spotlightIds.some((id) => !knownIds.has(id))
  )
    return null;

  return value as unknown as Library360Snapshot;
}

export function resolveLibrary360Text(raw: string | null, now = new Date()): Library360Data {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'La Biblioteca 360° no está disponible.',
      stale: false,
      snapshot: null,
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      status: 'invalid',
      notice: 'La Biblioteca 360° contiene JSON inválido.',
      stale: false,
      snapshot: null,
    };
  }
  const snapshot = parseLibrary360Snapshot(value);
  if (!snapshot) {
    return {
      status: 'invalid',
      notice: 'La Biblioteca 360° no cumple su contrato.',
      stale: false,
      snapshot: null,
    };
  }
  const observed = new Date(snapshot.source.observedAt + 'T00:00:00Z').getTime();
  const stale =
    Number.isNaN(observed) ||
    Math.max(0, now.getTime() - observed) > snapshot.source.staleAfterDays * 86400000;
  return {
    status: 'ready',
    notice: stale
      ? 'Los datos de las herramientas son históricos; verificá fuentes y condiciones antes de utilizarlas.'
      : null,
    stale,
    snapshot,
  };
}
