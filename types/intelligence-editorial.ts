export type IntelligenceSourceStatus = 'ready' | 'missing' | 'invalid';
export type IntelligenceFront = 'ia' | 'carrera' | 'tecnologia' | 'pas';

export interface IntelligenceSourceRef {
  role: string;
  title: string;
  url?: string;
  ref?: string;
  observedAt: string;
}

export interface IntelligenceArticleSummary {
  id: string;
  front: IntelligenceFront;
  slug: string;
  title: string;
  dek: string;
  publishedAt: string;
  readingMinutes: number;
  articleRef: string;
  professionalRefs: readonly string[];
}

export interface IntelligenceEditorialSnapshot {
  schemaVersion: 2;
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: string;
    commit: string;
    canonicalCurrentRef: 'AI/editorial/INTELLIGENCE_EDITORIAL_CURRENT.json';
    canonicalArchiveRef: 'AI/editorial/INTELLIGENCE_EDITORIAL_ARCHIVE.json';
    generatedAt: string;
    observedAt: string;
    staleAfterDays: number;
  };
  readingDebt: false;
  current: Record<IntelligenceFront, string>;
  archive: readonly IntelligenceArticleSummary[];
  editorialNote: string;
}

export interface IntelligenceArticleSection {
  heading: string;
  body: readonly string[];
}

export interface IntelligenceArticle {
  schemaVersion: 1;
  articleId: string;
  front: IntelligenceFront;
  slug: string;
  title: string;
  dek: string;
  publishedAt: string;
  readingMinutes: number;
  format: 'ARTICLE';
  status: 'PUBLISHED';
  audienceAssumption: 'START_FROM_ZERO';
  freshness: {
    evidenceObservedAt: string;
    reverifyAfter: string;
    rule: string;
  };
  sections: readonly IntelligenceArticleSection[];
  sources: readonly IntelligenceSourceRef[];
  professionalRefs: readonly string[];
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: string;
    commit: string;
    canonicalRef: string;
  };
}

export interface IntelligenceEditorialData {
  status: IntelligenceSourceStatus;
  notice: string | null;
  stale: boolean;
  snapshot: IntelligenceEditorialSnapshot | null;
}

export interface IntelligenceArticleData {
  status: IntelligenceSourceStatus;
  notice: string | null;
  stale: boolean;
  summary: IntelligenceArticleSummary | null;
  article: IntelligenceArticle | null;
}
