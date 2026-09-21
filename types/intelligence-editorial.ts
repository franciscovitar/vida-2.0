export type IntelligenceSourceStatus = 'ready' | 'missing' | 'invalid';

export type IntelligenceAction = 'DO_NOW' | 'TRY' | 'WATCH' | 'NO_ACTION';

export interface IntelligenceSourceRef {
  role: string;
  title: string;
  url: string;
  observedAt: string;
}

export interface IntelligenceQuickPoint {
  title: string;
  detail: string;
}

export interface IntelligenceAiBrief {
  status: 'MATERIAL' | 'NO_MATERIAL_UPDATE';
  periodLabel: string;
  readingMinutes: number;
  title: string;
  oneBigThing: string;
  quickPoints: readonly IntelligenceQuickPoint[];
  explainedSimply: string;
  whyItMatters: string;
  appliedToUser: string;
  action: IntelligenceAction;
  actionText: string;
  noiseFilter: string;
  unknowns: readonly string[];
  sources: readonly IntelligenceSourceRef[];
}

export interface IntelligencePasUpdate {
  id: string;
  title: string;
  before: string;
  now: string;
  whatYouNotice: string;
  actionRequired: string;
  costLabel: string;
  status: string;
  sourceRef: string;
}

export interface IntelligenceEditorialSnapshot {
  schemaVersion: 1;
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: 'main';
    commit: string;
    canonicalRef: 'AI/editorial/INTELLIGENCE_EDITORIAL_CURRENT.json';
    generatedAt: string;
    observedAt: string;
    staleAfterDays: number;
  };
  readingDebt: false;
  aiBrief: IntelligenceAiBrief;
  pasUpdates: readonly IntelligencePasUpdate[];
  mustKnowItems: readonly string[];
  editorialNote: string;
}

export interface IntelligenceEditorialData {
  status: IntelligenceSourceStatus;
  notice: string | null;
  stale: boolean;
  snapshot: IntelligenceEditorialSnapshot | null;
}
