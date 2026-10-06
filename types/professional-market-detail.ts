export interface ProfessionalMarketDetailRemoteSample {
  sample: string;
  geography: string;
  observedAt: string;
}

export interface ProfessionalMarketDetailRole {
  id: string;
  name: string;
  evidence: {
    demonstrated: number;
    practiced: number;
  };
  personalVerificationStatus: string;
  comparisonStatus: string;
  macroSignals: readonly string[];
  unresolved: readonly string[];
  remoteSamples: readonly ProfessionalMarketDetailRemoteSample[];
}

export interface ProfessionalMarketSkillSignal {
  id: string;
  label: string;
  signal: string;
  geography: string;
  period: string;
  sourceLabel: string;
  sourceUrl: string;
}

export interface ProfessionalMarketDetailSnapshot {
  schemaVersion: 1;
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: 'main';
    commit: string;
    generatedAt: string;
    observedAt: string;
    staleAfterDays: number;
    canonicalRefs: readonly string[];
  };
  status: string;
  rule: string;
  targetRoleIds: readonly string[];
  roles: readonly ProfessionalMarketDetailRole[];
  skillSignals: readonly ProfessionalMarketSkillSignal[];
  seniorityContext: {
    geography: string;
    period: string;
    levels: {
      Junior: string;
      'Semi-Senior': string;
      Senior: string;
    };
    sourceLabel: string;
    sourceUrl: string;
    note: string;
  };
  commonGaps: readonly string[];
}

export interface ProfessionalMarketDetailData {
  status: 'ready' | 'missing' | 'invalid';
  notice: string | null;
  stale: boolean;
  snapshot: ProfessionalMarketDetailSnapshot | null;
}
