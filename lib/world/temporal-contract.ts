import { WORLD_DOMAINS } from '@/lib/world/contract';
import type {
  WorldCoverageState,
  WorldDomain,
  WorldDomainOutcome,
  WorldTemporalGranularity,
  WorldTemporalIndex,
  WorldTemporalIndexEntry,
  WorldTemporalPeriod,
  WorldTemporalState,
} from '@/types/world-intelligence';

const GIT_SHA = /^[a-f0-9]{40}$/;
const PERIOD_KEY = /^[A-Za-z0-9-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isTemporalState(value: unknown): value is WorldTemporalState {
  return value === 'IN_PROGRESS' || value === 'CLOSED' || value === 'CORRECTED';
}

function isGranularity(value: unknown): value is WorldTemporalGranularity {
  return value === 'DAY' || value === 'WEEK' || value === 'MONTH' || value === 'YEAR';
}

function isCoverageState(value: unknown): value is WorldCoverageState {
  return value === 'COVERAGE_OK' || value === 'COVERAGE_PARTIAL' || value === 'COVERAGE_FAILED';
}

function isDomainOutcome(value: unknown): value is WorldDomainOutcome {
  return (
    value === 'HAS_MATERIAL_ITEMS' ||
    value === 'NO_MATERIAL_CHANGE' ||
    value === 'COVERAGE_PARTIAL' ||
    value === 'COVERAGE_FAILED'
  );
}

function isDomain(value: unknown): value is WorldDomain {
  return typeof value === 'string' && WORLD_DOMAINS.some((candidate) => candidate.id === value);
}

function safeLocalRef(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('periods/') &&
    value.endsWith('.json') &&
    !value.includes('..') &&
    !value.startsWith('/')
  );
}

function parseEntry(value: unknown): WorldTemporalIndexEntry | null {
  if (
    !isRecord(value) ||
    !isString(value.periodKey) ||
    !PERIOD_KEY.test(value.periodKey) ||
    !isString(value.label) ||
    !isTemporalState(value.state) ||
    !safeLocalRef(value.localRef)
  ) {
    return null;
  }

  return value as unknown as WorldTemporalIndexEntry;
}

export function parseWorldTemporalIndex(value: unknown): WorldTemporalIndex | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.kind !== 'world_temporal_index' ||
    !isRecord(value.source) ||
    !isRecord(value.latest) ||
    !Array.isArray(value.weeks) ||
    !Array.isArray(value.months) ||
    !Array.isArray(value.years)
  ) {
    return null;
  }

  const source = value.source;
  if (
    source.repository !== 'franciscovitar/personal-ai-system' ||
    !isString(source.ref) ||
    !isString(source.commit) ||
    !GIT_SHA.test(source.commit) ||
    !isString(source.canonicalRef) ||
    !isString(source.generatedAt)
  ) {
    return null;
  }

  const latest = value.latest;
  for (const key of ['day', 'week', 'month', 'year'] as const) {
    const row = latest[key];
    if (row !== null && parseEntry(row) === null) return null;
  }

  if (!value.weeks.every((row) => parseEntry(row) !== null)) return null;
  if (!value.months.every((row) => parseEntry(row) !== null)) return null;
  if (!value.years.every((row) => parseEntry(row) !== null)) return null;

  const keys = [
    ...value.weeks.map((row) => (row as WorldTemporalIndexEntry).periodKey),
    ...value.months.map((row) => (row as WorldTemporalIndexEntry).periodKey),
    ...value.years.map((row) => (row as WorldTemporalIndexEntry).periodKey),
  ];
  if (new Set(keys).size !== keys.length) return null;

  return value as unknown as WorldTemporalIndex;
}

function validSummaryItem(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    isString(value.itemId) &&
    isString(value.headline) &&
    isString(value.summary) &&
    Array.isArray(value.sourceRefs) &&
    value.sourceRefs.every(isString)
  );
}

function validFollowUp(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isString(value.storylineId) && isString(value.label) && isString(value.status);
}

function validDomainSection(value: unknown): boolean {
  if (!isRecord(value)) return false;

  if (
    !isDomain(value.domain) ||
    !isCoverageState(value.coverageState) ||
    !isDomainOutcome(value.outcome) ||
    !Array.isArray(value.summaryItems) ||
    !value.summaryItems.every(validSummaryItem) ||
    !Array.isArray(value.deepDiveBriefIds) ||
    !value.deepDiveBriefIds.every(isString) ||
    !Array.isArray(value.followUps) ||
    !value.followUps.every(validFollowUp)
  ) {
    return false;
  }

  if (value.outcome === 'NO_MATERIAL_CHANGE' && value.coverageState !== 'COVERAGE_OK') {
    return false;
  }

  return true;
}

export function parseWorldTemporalPeriod(value: unknown): WorldTemporalPeriod | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.kind !== 'world_temporal_period' ||
    !isGranularity(value.granularity) ||
    !isString(value.periodKey) ||
    !PERIOD_KEY.test(value.periodKey) ||
    !isTemporalState(value.state) ||
    !isString(value.label) ||
    !isRecord(value.window) ||
    !isRecord(value.source) ||
    value.readingDebt !== false ||
    !Array.isArray(value.topStoryBriefIds) ||
    !value.topStoryBriefIds.every(isString) ||
    !Array.isArray(value.domains) ||
    !value.domains.every(validDomainSection)
  ) {
    return null;
  }

  if (
    !isString(value.window.start) ||
    !isString(value.window.end) ||
    !isString(value.window.timezone)
  ) {
    return null;
  }

  const source = value.source;
  if (
    source.repository !== 'franciscovitar/personal-ai-system' ||
    !isString(source.ref) ||
    !isString(source.commit) ||
    !GIT_SHA.test(source.commit) ||
    !isString(source.canonicalRef) ||
    !isString(source.generatedAt) ||
    !isString(source.observedAt)
  ) {
    return null;
  }

  if (value.transitionNote !== undefined && !isString(value.transitionNote)) return null;
  if (value.domains.length !== WORLD_DOMAINS.length) return null;

  const ids = value.domains.map((row) => (row as { domain: WorldDomain }).domain);
  if (new Set(ids).size !== WORLD_DOMAINS.length) return null;

  return value as unknown as WorldTemporalPeriod;
}

export function resolveWorldTemporalIndexText(raw: string | null): WorldTemporalIndex | null {
  if (raw === null) return null;

  try {
    return parseWorldTemporalIndex(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function resolveWorldTemporalPeriodText(raw: string | null): WorldTemporalPeriod | null {
  if (raw === null) return null;

  try {
    return parseWorldTemporalPeriod(JSON.parse(raw));
  } catch {
    return null;
  }
}

function latestEntry(
  index: WorldTemporalIndex,
  granularity: WorldTemporalGranularity,
): WorldTemporalIndexEntry | null {
  if (granularity === 'DAY') return index.latest.day;
  if (granularity === 'WEEK') return index.latest.week;
  if (granularity === 'MONTH') return index.latest.month;
  return index.latest.year;
}

export function selectWorldTemporalEntry(
  index: WorldTemporalIndex,
  granularity: WorldTemporalGranularity,
  periodKey?: string | null,
): WorldTemporalIndexEntry | null {
  if (periodKey) {
    const pool =
      granularity === 'WEEK'
        ? index.weeks
        : granularity === 'MONTH'
          ? index.months
          : granularity === 'YEAR'
            ? index.years
            : [latestEntry(index, granularity)].filter(
              (row): row is WorldTemporalIndexEntry => row !== null,
            );
    return pool.find((row) => row.periodKey === periodKey) ?? null;
  }

  return latestEntry(index, granularity);
}
