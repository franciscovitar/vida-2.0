/** Read-only, source-constrained snapshot of manually logged vacancies. */
export type ObservedGeography =
  'CORDOBA_ONSITE_HYBRID' | 'ARGENTINA_REMOTE' | 'LATAM_REMOTE' | 'UNKNOWN';

export interface ObservedJob {
  key: string;
  url: string;
  company: string;
  role: string;
  geography: ObservedGeography;
  workMode: string;
  seniority: string;
  yearsRequired: number | null;
  mustHave: string[];
  seenInHistoricalSample: boolean;
}

export interface ObservedJobSnapshot {
  schemaVersion: 1;
  kind: 'professional_observed_job_sample';
  source: {
    evidence: 'Job Search Market Evidence V1';
    spreadsheetId: string;
    tab: 'Observations';
    observedAt: string;
    generatedAt: string;
    sampleMethod: 'MANUAL_PURPOSIVE_NOT_COMPARABLE_ACROSS_WEEKS';
    historicalSamplePasCommit: string;
    historicalSampleRef: string;
  };
  sample: {
    n: number;
    historicalUrlOverlaps: number;
    newUniqueUrlsComparedToOct02: number;
    sourceQuality: 'PUBLIC_JOB_BOARD_POSTINGS_NOT_EMPLOYER_ATS_CONFIRMED';
    historicalTrend: 'HELD';
    crossGeographyDemand: 'HELD';
  };
  observations: ObservedJob[];
}

export type ObservedJobSampleData = {
  status: 'ready' | 'missing' | 'invalid';
  notice: string | null;
  snapshot: ObservedJobSnapshot | null;
};

const SHEET_ID = '1JzpLjmMO1TK15KlNSzgJbSoq3a5PT0BBsUa0kMCAX0k';
const HISTORICAL_COMMIT = '08ae01c509111438cb77f0f9582b9966013ae4a2';
const HISTORICAL_REF = 'AI/projects/professional-profile-v1/MARKET_FIT_QA_2026-10¶»§q«^