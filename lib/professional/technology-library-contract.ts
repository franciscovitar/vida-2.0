import type {
  TechnologyLibraryAttention,
  TechnologyLibraryData,
  TechnologyLibraryEntry,
  TechnologyLibrarySnapshot,
  TechnologyLibraryStatus,
} from '@/types/technology-library';

const STATUSES = new Set<TechnologyLibraryStatus>([
  'CURRENT_STACK',
  'ASSESS_NOW',
  'WATCH',
  'REFERENCE',
  'HOLD',
  'ARCHIVED',
]);

const ATTENTION = new Set<TechnologyLibraryAttention>(['NOW', 'WHEN_NEEDED', 'LIBRARY']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStatus(value: unknown): value is TechnologyLibraryStatus {
  return typeof value === 'string' && STATUSES.has(value as TechnologyLibraryStatus);
}

function isAttention(value: unknown): value is TechnologyLibraryAttention {
  return typeof value === 'string' && ATTENTION.has(value as TechnologyLibraryAttention);
}

function validEntry(value: unknown): value is TechnologyLibraryEntry {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    /^TL-\d{3}$/.test(value.id) &&
    isString(value.name) &&
    isString(value.kind) &&
    isStatus(value.status) &&
    isAttention(value.attention) &&
    isString(value.summary) &&
    isString(value.application) &&
    isString(value.benefit) &&
    isString(value.caution) &&
    isString(value.repository) &&
    isString(value.sourceUrl) &&
    value.sourceUrl.startsWith('https://') &&
    Array.isArray(value.tags) &&
    value.tags.length > 0 &&
    value.tags.every(isString)
  );
}

export function parseTechnologyLibrarySnapshot(value: unknown): TechnologyLibrarySnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;

  const source = value.source;
  if (
    !isRecord(source) ||
    source.repository !== 'franciscovitar/personal-ai-system' ||
    !isString(source.ref) ||
    !isString(source.commit) ||
    !/^[a-f0-9]{40}$/.test(source.commit) ||
    !isString(source.generatedAt) ||
    !isString(source.observedAt) ||
    !isNumber(source.staleAfterDays) ||
    source.staleAfterDays <= 0 ||
    !isString(source.canonicalRef) ||
    !isNumber(value.totalEntries) ||
    value.totalEntries < 1 ||
    !Array.isArray(value.spotlightIds) ||
    !value.spotlightIds.every(isString) ||
    !Array.isArray(value.categories) ||
    value.categories.length < 1
  ) {
    return null;
  }

  const entries: TechnologyLibraryEntry[] = [];
  const categoryIds = new Set<string>();

  for (const category of value.categories) {
    if (
      !isRecord(category) ||
      !isString(category.id) ||
      !isString(category.label) ||
      !Array.isArray(category.entries) ||
      !category.entries.every(validEntry) ||
      categoryIds.has(category.id)
    ) {
      return null;
    }
    categoryIds.add(category.id);
    entries.push(...(category.entries as TechnologyLibraryEntry[]));
  }

  if (entries.length !== value.totalEntries) return null;

  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) return null;

  const repos = entries.map((entry) => entry.repository);
  if (new Set(repos).size !== repos.length) return null;

  const idSet = new Set(ids);
  if (
    new Set(value.spotlightIds).size !== value.spotlightIds.length ||
    !value.spotlightIds.every((id) => idSet.has(id))
  ) {
    return null;
  }

  return value as unknown as TechnologyLibrarySnapshot;
}

export function isTechnologyLibraryStale(
  snapshot: TechnologyLibrarySnapshot,
  now = new Date(),
): boolean {
  const observed = new Date(`${snapshot.source.observedAt}T00:00:00Z`);
  if (Number.isNaN(observed.getTime())) return true;
  return Math.max(0, now.getTime() - observed.getTime()) >
    snapshot.source.staleAfterDays * 24 * 60 * 60 * 1000;
}

export function resolveTechnologyLibraryText(
  raw: string | null,
  now?: Date,
): TechnologyLibraryData {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'La biblioteca tecnológica no está disponible.',
      stale: false,
      snapshot: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: 'invalid',
      notice: 'La biblioteca tecnológica no está disponible: JSON inválido.',
      stale: false,
      snapshot: null,
    };
  }

  const snapshot = parseTechnologyLibrarySnapshot(parsed);
  if (!snapshot) {
    return {
      status: 'invalid',
      notice: 'La biblioteca tecnológica no cumple el contrato.',
      stale: false,
      snapshot: null,
    };
  }

  const stale = isTechnologyLibraryStale(snapshot, now);
  return {
    status: 'ready',
    notice: stale ? 'La biblioteca está disponible, pero conviene revalidar antes de usar algo.' : null,
    stale,
    snapshot,
  };
}
