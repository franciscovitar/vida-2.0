/** Read-only, source-constrained snapshot of manually logged vacancies. */
export type ObservedGeography =
  | 'CORDOBA_ONSITE_HYBRID'
  | 'ARGENTINA_REMOTE'
  | 'LATAM_REMOTE'
  | 'UNKNOWN';

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
const HISTORICAL_REF = 'AI/projects/professional-profile-v1/MARKET_FIT_QA_2026-10-02.md';
const GEO = new Set(['CORDOBA_ONSITE_HYBRID', 'ARGENTINA_REMOTE', 'LATAM_REMOTE', 'UNKNOWN']);
const ENTRY_FIELDS = ['key', 'url', 'company', 'role', 'geography', 'workMode', 'seniority', 'yearsRequired', 'mustHave', 'seenInHistoricalSample'];
const SOURCE_FIELDS = ['evidence', 'spreadsheetId', 'tab', 'observedAt', 'generatedAt', 'sampleMethod', 'historicalSamplePasCommit', 'historicalSampleRef'];
const SAMPLE_FIELDS = ['n', 'historicalUrlOverlaps', 'newUniqueUrlsComparedToOct02', 'sourceQuality', 'historicalTrend', 'crossGeographyDemand'];

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).length === allowed.length &&
    allowed.every((name) => Object.prototype.hasOwnProperty.call(value, name));
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= 2048;
}

function day(value: unknown): value is string {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const actual = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(actual.getTime()) && actual.toISOString().slice(0, 10) === value;
}

function publicJobUrl(value: unknown): value is string {
  if (!text(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) &&
      url.username === '' && url.password === '' && url.pathname.startsWith('/jobs/view/');
  } catch {
    return false;
  }
}

function entry(value: unknown): value is ObservedJob {
  if (!object(value) || !keys(value, ENTRY_FIELDS)) return false;
  return text(value.key) && /^job:v1:[a-f0-9]{24}$/.test(value.key) &&
    publicJobUrl(value.url) &&
    text(value.company) && text(value.role) && GEO.has(String(value.geography)) &&
    text(value.workMode) && text(value.seniority) &&
    (value.yearsRequired === null ||
      (Number.isInteger(value.yearsRequired) && Number(value.yearsRequired) >= 0 && Number(value.yearsRequired) <= 50)) &&
    Array.isArray(value.mustHave) && value.mustHave.length <= 50 &&
    value.mustHave.every((item: unknown) => text(item) && item.length <= 180) &&
    typeof value.seenInHistoricalSample === 'boolean';
}

/** This parser fails closed on fabricated trends, percentages, missing rows or provenance drift. */
export function parseObservedJobs(value: unknown): ObservedJobSnapshot | null {
  if (!object(value) || !keys(value, ['schemaVersion', 'kind', 'source', 'sample', 'observations']) ||
      !object(value.source) || !keys(value.source, SOURCE_FIELDS) ||
      !object(value.sample) || !keys(value.sample, SAMPLE_FIELDS)) return null;

  const s = value.source;
  const m = value.sample;
  if (value.schemaVersion !== 1 || value.kind !== 'professional_observed_job_sample' ||
      s.evidence !== 'Job Search Market Evidence V1' ||
      s.spreadsheetId !== SHEET_ID || s.tab !== 'Observations' ||
      !day(s.observedAt) || !day(s.generatedAt) || s.generatedAt < s.observedAt ||
      s.sampleMethod !== 'MANUAL_PURPOSIVE_NOT_COMPARABLE_ACROSS_WEEKS' ||
      s.historicalSamplePasCommit !== HISTORICAL_COMMIT ||
      s.historicalSampleRef !== HISTORICAL_REF ||
      m.sourceQuality !== 'PUBLIC_JOB_BOARD_POSTINGS_NOT_EMPLOYER_ATS_CONFIRMED' ||
      m.historicalTrend !== 'HELD' || m.crossGeographyDemand !== 'HELD' ||
      !Array.isArray(value.observations) ||
      !Number.isInteger(m.n) || Number(m.n) < 1 || Number(m.n) > 100 ||
      value.observations.length !== m.n || !value.observations.every(entry)) return null;

  const rows = value.observations as ObservedJob[];
  const keysSet = new Set(rows.map((item) => item.key));
  const urlSet = new Set(rows.map((item) => item.url));
  if (keysSet.size !== rows.length || urlSet.size !== rows.length) return null;
  const overlap = rows.filter((item) => item.seenInHistoricalSample).length;
  if (m.historicalUrlOverlaps !== overlap || m.newUniqueUrlsComparedToOct02 !== rows.length - overlap)
    return null;

  return value as unknown as ObservedJobSnapshot;
}

export function resolveObservedJobs(raw: string | null, now = new Date()): ObservedJobSampleData {
  if (raw === null) return {status: 'missing', notice: 'Sin observaciones nuevas verificadas para esta vista.', snapshot: null};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch {
    return {status: 'invalid', notice: 'La muestra observada tiene un archivo inválido.', snapshot: null};
  }
  const snapshot = parseObservedJobs(parsed);
  if (!snapshot) return {status: 'invalid', notice: 'La muestra observada no cumple el contrato de fuente, conteo y deduplicación.', snapshot: null};
  const age = now.getTime() - new Date(snapshot.source.observedAt + 'T00:00:00Z').getTime();
  return {
    status: 'ready',
    snapshot,
    notice: !Number.isFinite(age) || age < 0 || age > 30 * 86400000 ?
      'Muestra observada histórica: la disponibilidad de las ofertas requiere una verificación nueva.' : null,
  };
}

const SKILLS = [
  { id: 'react', label: 'React / React Native', pattern: /react/i },
  { id: 'node', label: 'Node / NestJS / Express', pattern: /node|nestjs|express|fastify/i },
  { id: 'typescript', label: 'TypeScript', pattern: /typescript/i },
  { id: 'sql', label: 'SQL / PostgreSQL / MySQL', pattern: /postgres|mysql|\bsql\b/i },
  { id: 'testing', label: 'Testing / Jest / Playwright', pattern: /test|jest|playwright/i },
  { id: 'cloud', label: 'Cloud / DevOps (agrupado)', pattern: /aws|cloud|docker|kubernetes|ci\/cd/i },
  { id: 'aws', label: 'AWS explícito', pattern: /\baws\b/i },
] as const;

/** Within-sample keyword mention counts, not prevalence or comparable market frequencies. */
export function observedSkillCounts(rows: readonly ObservedJob[]) {
  return SKILLS.map(({id, label, pattern}) => ({
    id, label, mentions: rows.filter((item) => item.mustHave.some((term) => pattern.test(term))).length,
  }));
}

/** Disjoint minimum-years bands. Junior titles are an independent overlapping indicator. */
export function observedExperienceCounts(rows: readonly ObservedJob[]) {
  return [
    { id: 'upTo2', label: '0–2 años explícitos', mentions: rows.filter((item) => item.yearsRequired !== null && item.yearsRequired < 3).length },
    { id: 'threePlus', label: '3+ años explícitos', mentions: rows.filter((item) => item.yearsRequired !== null && item.yearsRequired >= 3).length },
    { id: 'unspecified', label: 'Años no informados', mentions: rows.filter((item) => item.yearsRequired === null).length },
  ];
}

export function observedGeographyCounts(rows: readonly ObservedJob[]) {
  const groups = [
    {id:'CORDOBA_ONSITE_HYBRID',label:'Córdoba · presencial/híbrido'},
    {id:'ARGENTINA_REMOTE',label:'Argentina · remoto'},
    {id:'LATAM_REMOTE',label:'LATAM · remoto'},
    {id:'UNKNOWN',label:'Ubicación/modalidad no clasificadas'},
  ] as const;
  return groups.map(({id,label})=>({id,label,mentions:rows.filter((item)=>item.geography===id).length}));
}
