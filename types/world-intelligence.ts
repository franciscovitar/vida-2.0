export type WorldSourceStatus = 'ready' | 'missing' | 'invalid';
export type WorldMode = 'NOW' | 'LEARN';
export type WorldPublicationState = 'HUMAN_APPROVED';
export type WorldFreshnessState = 'CURRENT' | 'STALE';

export type WorldTemporalGranularity = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
export type WorldTemporalState = 'IN_PROGRESS' | 'CLOSED' | 'CORRECTED';
export type WorldCoverageState = 'COVERAGE_OK' | 'COVERAGE_PARTIAL' | 'COVERAGE_FAILED';
export type WorldDomainOutcome =
  | 'HAS_MATERIAL_ITEMS'
  | 'NO_MATERIAL_CHANGE'
  | 'COVERAGE_PARTIAL'
  | 'COVERAGE_FAILED';

export type WorldDomain =
  | 'POLITICS_GEOPOLITICS'
  | 'ECONOMICS'
  | 'SCIENCE'
  | 'PSYCHOLOGY_BEHAVIOR'
  | 'HEALTH'
  | 'TECH_AI'
  | 'HISTORY_CULTURE'
  | 'PRODUCTIVITY_HABITS';

export interface WorldPieceSummary {
  briefId: string;
  mode: WorldMode;
  slug: string;
  primaryDomain: WorldDomain;
  headline: string;
  deck: string;
  readingSeconds: number;
  deltaMarker?: 'NEW_STORY' | 'NEW_SINCE_PREVIOUS' | 'MATERIAL_UPDATE';
  conceptId?: string;
  subdomain?: string;
  pieceRef: string;
  editorialDraftSha256: string;
  humanReviewRef: string;
  sourceCommit?: string;
  publicationState: WorldPublicationState;
}

export interface WorldDomainSummary {
  id: WorldDomain;
  label: string;
  publishedItems: number;
}

export interface WorldSurfaceSnapshot {
  schemaVersion: 1;
  kind: 'world_vida_surface';
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: string;
    commit: string;
    canonicalSurfaceRef: 'AI/projects/world-intelligence/fixtures/PUBLISHED_SURFACE_V1.json';
    generatedAt: string;
    observedAt: string;
    staleAfterHours: number;
  };
  editionDate: string;
  freshnessState: WorldFreshnessState;
  provenanceVersion: string;
  readingDebt: false;
  now: {
    targetReadingSeconds: number;
    selectedReadingSeconds: number;
    items: readonly WorldPieceSummary[];
  };
  learn: { items: readonly WorldPieceSummary[] };
  library: { items: readonly WorldPieceSummary[] };
  domains: readonly WorldDomainSummary[];
  coverageNotes: readonly string[];
}

export interface WorldBackgroundNote {
  backgroundRef: string;
  term: string;
  plainLanguageDefinition: string;
  sourceId: string;
  sourceRole: string;
  sourceUrl: string;
}

export interface WorldPieceBlock {
  kind: string;
  material: boolean;
  text: string;
  claimRefs: readonly string[];
  backgroundRefs: readonly string[];
  analogyLimitExplicit?: true;
}

export interface WorldPieceSection {
  id: string;
  title: string;
  blocks: readonly WorldPieceBlock[];
}

export interface WorldSourceNote {
  sourceId: string;
  role: string;
  publisher?: string;
}

export interface WorldPublishedPiece {
  schemaVersion: 1;
  kind: 'world_published_piece';
  publicationState: WorldPublicationState;
  mode: WorldMode;
  briefId: string;
  conceptId?: string;
  slug: string;
  primaryDomain: WorldDomain;
  secondaryDomains: readonly WorldDomain[];
  subdomain?: string;
  headline: string;
  deck: string;
  readingSeconds: number;
  publishedAt: string;
  editorialDraftSha256: string;
  backgroundNotes: readonly WorldBackgroundNote[];
  sections: readonly WorldPieceSection[];
  sourceNotes: readonly WorldSourceNote[];
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: string;
    commit: string;
    canonicalRef: string;
    editorialDraftRef: string;
    humanReviewRef: string;
  };
}

export interface WorldSurfaceData {
  status: WorldSourceStatus;
  notice: string | null;
  stale: boolean;
  snapshot: WorldSurfaceSnapshot | null;
}

export interface WorldPieceData {
  status: WorldSourceStatus;
  notice: string | null;
  stale: boolean;
  summary: WorldPieceSummary | null;
  piece: WorldPublishedPiece | null;
}

export interface WorldTemporalIndexEntry {
  periodKey: string;
  label: string;
  state: WorldTemporalState;
  localRef: string;
}

export interface WorldTemporalIndex {
  schemaVersion: 1;
  kind: 'world_temporal_index';
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: string;
    commit: string;
    canonicalRef: string;
    generatedAt: string;
  };
  latest: {
    day: WorldTemporalIndexEntry | null;
    week: WorldTemporalIndexEntry | null;
    month: WorldTemporalIndexEntry | null;
    year: WorldTemporalIndexEntry | null;
  };
  months: readonly WorldTemporalIndexEntry[];
  years: readonly WorldTemporalIndexEntry[];
}

export interface WorldTemporalSummaryItem {
  itemId: string;
  headline: string;
  summary: string;
  sourceRefs: readonly string[];
}

export interface WorldTemporalFollowUp {
  storylineId: string;
  label: string;
  status: string;
}

export interface WorldTemporalDomainSection {
  domain: WorldDomain;
  coverageState: WorldCoverageState;
  outcome: WorldDomainOutcome;
  summaryItems: readonly WorldTemporalSummaryItem[];
  deepDiveBriefIds: readonly string[];
  followUps: readonly WorldTemporalFollowUp[];
}

export interface WorldTemporalPeriod {
  schemaVersion: 1;
  kind: 'world_temporal_period';
  granularity: WorldTemporalGranularity;
  periodKey: string;
  state: WorldTemporalState;
  label: string;
  window: {
    start: string;
    end: string;
    timezone: string;
  };
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: string;
    commit: string;
    canonicalRef: string;
    generatedAt: string;
    observedAt: string;
  };
  readingDebt: false;
  transitionNote?: string;
  topStoryBriefIds: readonly string[];
  domains: readonly WorldTemporalDomainSection[];
}

export interface WorldTemporalPageData {
  status: WorldSourceStatus;
  notice: string | null;
  granularity: WorldTemporalGranularity;
  index: WorldTemporalIndex | null;
  period: WorldTemporalPeriod | null;
  surface: WorldSurfaceSnapshot | null;
}

