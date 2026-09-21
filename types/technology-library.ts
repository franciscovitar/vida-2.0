export type TechnologyLibraryStatus =
  'CURRENT_STACK' | 'ASSESS_NOW' | 'WATCH' | 'REFERENCE' | 'HOLD' | 'ARCHIVED';

export type TechnologyLibraryAttention = 'NOW' | 'WHEN_NEEDED' | 'LIBRARY';

export interface TechnologyLibraryEntry {
  id: string;
  name: string;
  kind: string;
  status: TechnologyLibraryStatus;
  attention: TechnologyLibraryAttention;
  summary: string;
  application: string;
  benefit: string;
  caution: string;
  repository: string;
  sourceUrl: string;
  tags: readonly string[];
}

export interface TechnologyLibraryCategory {
  id: string;
  label: string;
  entries: readonly TechnologyLibraryEntry[];
}

export interface TechnologyLibrarySnapshot {
  schemaVersion: 1;
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: string;
    commit: string;
    generatedAt: string;
    observedAt: string;
    staleAfterDays: number;
    canonicalRef: string;
  };
  totalEntries: number;
  spotlightIds: readonly string[];
  categories: readonly TechnologyLibraryCategory[];
}

export interface TechnologyLibraryData {
  status: 'ready' | 'missing' | 'invalid';
  notice: string | null;
  stale: boolean;
  snapshot: TechnologyLibrarySnapshot | null;
}
