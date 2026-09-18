export type ProfessionalConfidence = 'LOW' | 'MEDIUM' | 'MEDIUM_HIGH' | 'HIGH';

export type ProfessionalSourceStatus = 'ready' | 'missing' | 'invalid';

export interface ProfessionalNowMove {
  id: string;
  title: string;
  why: string;
  route: string;
  confidence: ProfessionalConfidence;
}

export interface ProfessionalEvidenceItem {
  capability: string;
  state: 'PRACTICED' | 'DEMONSTRATED' | 'EXTERNALLY_VALIDATED';
  confidence: ProfessionalConfidence;
  note: string;
}

export interface ProfessionalPriorityItem {
  rank: number;
  capability: string;
  actionType: string;
  action: string;
  confidence: ProfessionalConfidence;
}

export interface ProfessionalMarketView {
  observedAt: string;
  status: string;
  signals: readonly string[];
  limitations: readonly string[];
}

export interface ProfessionalTechnologyItem {
  id: string;
  name: string;
  capability: string;
  disposition: string;
  priceLabel: string;
  freeTier: boolean;
  application: string;
  personalEvalStatus: string;
  decisionOwner: 'system-maintenance';
}

export interface ProfessionalLearningItem {
  id: string;
  capability: string;
  mode: string;
  rationale: string;
  courseNeededNow: boolean;
  credentialNeededNow: boolean;
}

export interface ProfessionalProfileFinding {
  id: string;
  claim: string;
  status: string;
  note: string;
}

export interface ProfessionalForecastItem {
  subject: string;
  label: string;
  nearOutlook: string;
  nearConfidence: ProfessionalConfidence;
  aiInteraction: string;
}

export interface ProfessionalFluencyFamily {
  id: string;
  route: string;
  evalStatus: string;
  outcomeEvidenceCount: number;
  nextMeasurement: string;
}

export interface ProfessionalSnapshot {
  schemaVersion: 1;
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: 'main';
    commit: string;
    generatedAt: string;
    observedAt: string;
    staleAfterDays: number;
  };
  profileSummary: string;
  nowMoves: readonly ProfessionalNowMove[];
  strongestEvidence: readonly ProfessionalEvidenceItem[];
  priorities: readonly ProfessionalPriorityItem[];
  market: ProfessionalMarketView;
  technologies: readonly ProfessionalTechnologyItem[];
  learning: readonly ProfessionalLearningItem[];
  profileFindings: readonly ProfessionalProfileFinding[];
  forecast: {
    direction: string;
    confidence: ProfessionalConfidence;
    items: readonly ProfessionalForecastItem[];
  };
  aiFluency: {
    status: string;
    materialOutcomesLogged: number;
    taskFamilies: readonly ProfessionalFluencyFamily[];
  };
}

export interface ProfessionalIntelligenceData {
  status: ProfessionalSourceStatus;
  notice: string | null;
  stale: boolean;
  snapshot: ProfessionalSnapshot | null;
}
