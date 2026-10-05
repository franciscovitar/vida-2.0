export type ProfessionalOfferAccessClass =
  'FREE' | 'FREEMIUM' | 'PAID' | 'OPEN_SOURCE' | 'USAGE_BASED';

export type ProfessionalOfferRankingStatus = 'COMPARISON_ONLY' | 'RANKED';

export interface ProfessionalOfferVariant {
  id: string;
  provider: string;
  product: string;
  plan: string;
  channels: readonly string[];
  accessClass: ProfessionalOfferAccessClass;
  headlinePriceUsdMonthly: number;
  keyLimit: string;
  limitExactness: string;
  resetCadence: string;
  included: readonly string[];
  excludedOrCapped: readonly string[];
  sustainedUseFit: string;
  officialSources: readonly string[];
  lastVerified: string;
}

export interface ProfessionalOfferComparisonGroup {
  id: string;
  label: string;
  taskFamily: string;
  rankingStatus: ProfessionalOfferRankingStatus;
  rankingReason: string;
  offerIds: readonly string[];
}

export interface ProfessionalOfferVariantsSnapshot {
  schemaVersion: 1;
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: string;
    commit: string;
    canonicalRef: string;
    generatedAt: string;
    observedAt: string;
    staleAfterDays: number;
  };
  status: string;
  notes: readonly string[];
  comparisonGroups: readonly ProfessionalOfferComparisonGroup[];
  offers: readonly ProfessionalOfferVariant[];
}

export interface ProfessionalOfferVariantsData {
  status: 'ready' | 'missing' | 'invalid';
  notice: string | null;
  stale: boolean;
  snapshot: ProfessionalOfferVariantsSnapshot | null;
}
