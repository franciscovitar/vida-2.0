export type CareerResilienceSourceStatus = 'ready' | 'missing' | 'invalid';
export type CareerResilienceConfidence = 'LOW' | 'MEDIUM' | 'MEDIUM_HIGH' | 'HIGH';
export type CareerResilienceHorizonKey = 'Y1' | 'Y5' | 'Y10' | 'Y20';

export interface CareerResilienceHorizon {
  aiAloneSubstitutionPressurePctRange: readonly [number, number];
  pressureSemantics: 'UNCALIBRATED_SCENARIO_ESTIMATE';
  aiNativeResilienceIndexRange: readonly [number, number];
  resilienceSemantics: 'HEURISTIC_INDEX_NOT_PROBABILITY';
  headcountCompressionIndexRange: readonly [number, number];
  compressionSemantics: 'HEURISTIC_INDEX_NOT_PROBABILITY';
  confidence: CareerResilienceConfidence;
  summary: string;
}

export interface CareerResilienceRole {
  id: string;
  name: string;
  baseRoleRefs: readonly string[];
  demand: {
    direction: string;
    facts: readonly string[];
    sourceRefs: readonly string[];
  };
  aiTransformation: string;
  loadBearingHumanWork: readonly string[];
  horizons: Record<CareerResilienceHorizonKey, CareerResilienceHorizon>;
  riskUpSignposts: readonly string[];
  riskDownSignposts: readonly string[];
  protectionPlaybook: readonly string[];
  sourceRefs: readonly string[];
}

export interface CareerResilienceSource {
  id: string;
  name: string;
  kind: string;
  url: string;
  publishedAt: string | null;
  observedAt: string;
  confidence: string;
  note: string;
}

export interface CareerResilienceSnapshot {
  schemaVersion: 1;
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: 'main';
    commit: string;
    generatedAt: string;
    observedAt: string;
    staleAfterDays: number;
    canonicalRef: string;
  };
  statement: string;
  status: string;
  numericSemantics: {
    ai_alone_substitution_pressure_pct_range: string;
    ai_native_resilience_index_range: string;
    headcount_compression_index_range: string;
  };
  crossRoleFindings: readonly {
    id: string;
    finding: string;
    sourceRefs: readonly string[];
  }[];
  globalProtectionStrategy: readonly string[];
  sources: readonly CareerResilienceSource[];
  roles: readonly CareerResilienceRole[];
  limitations: readonly string[];
}

export interface CareerResilienceData {
  status: CareerResilienceSourceStatus;
  notice: string | null;
  stale: boolean;
  snapshot: CareerResilienceSnapshot | null;
}
