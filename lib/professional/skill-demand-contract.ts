export interface SkillMentionEntry {
  id: string;
  label: string;
  kind: 'stack' | 'professional';
  mentions: number;
}

export interface SkillDemandBaseline {
  version: 1;
  kind: 'professional_skill_mentions_purposive_baseline';
  source: {
    repository: 'franciscovitar/personal-ai-system';
    commit: string;
    canonicalRef: 'AI/projects/professional-profile-v1/MARKET_FIT_QA_CURRENT_V1.json';
    evidenceDocumentRef: 'AI/projects/professional-profile-v1/MARKET_FIT_QA_2026-10-02.md';
    observedAt: string;
    generatedAt: string;
    sourceSpreadsheetId: string;
  };
  sample: {
    n: 20;
    method: 'PURPOSIVE_REPRESENTATIVE_NOT_CENSUS';
    roleFamilies: string[];
    geographies: string[];
    attribution: string;
    scope: string;
  };
  semantics: 'COUNTS_OF_MENTIONS_IN_PURPOSIVE_POSTING_SAMPLE_NOT_VACANCY_RATE';
  freshness: { maxAgeDays: 30 };
  currentCollection: {
    source: 'Job Search Market Evidence V1';
    status: 'HEADERS_ONLY_NO_OBSERVATIONS';
    observedAt: string;
    repeatedComparableWindows: 0;
    skillFrequencyByGeography: 'HELD';
    skillTrend: 'HELD';
  };
  entries: SkillMentionEntry[];
}

export type SkillDemandBaselineData = {
  status: 'ready' | 'missing' | 'invalid';
  notice: string | null;
  stale: boolean;
  snapshot: SkillDemandBaseline | null;
};

const IDS = new Set([
  'typescript_javascript',
  'react_nextjs',
  'postgresql_sql',
  'production_reliability_failure_handling',
  'cloud_aws_or_cloud_operations',
  'ai_assisted_engineering',
  'node_backend_javascript',
  'testing_qa',
  'api_integrations',
  'product_cross_functional_ownership',
  'ci_cd',
  'security_auth_permissions',
  'docker_containers',
  'architecture_system_design',
  'english_explicit',
  'observability_explicit',
  'playwright_explicit',
]);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function date(value: unknown): value is string {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function entry(value: unknown): value is SkillMentionEntry {
  return (
    object(value) &&
    Object.keys(value).length === 4 &&
    text(value.id) &&
    IDS.has(value.id) &&
    text(value.label) &&
    (value.kind === 'stack' || value.kind === 'professional') &&
    Number.isInteger(value.mentions) &&
    Number(value.mentions) >= 0 &&
    Number(value.mentions) <= 20
  );
}

export function parseSkillDemandBaseline(input: unknown): SkillDemandBaseline | null {
  if (
    !object(input) ||
    !object(input.source) ||
    !object(input.sample) ||
    !object(input.freshness) ||
    !object(input.currentCollection)
  )
    return null;
  const { source, sample, currentCollection, freshness } = input;
  if (
    input.version !== 1 ||
    input.kind !== 'professional_skill_mentions_purposive_baseline' ||
    input.semantics !== 'COUNTS_OF_MENTIONS_IN_PURPOSIVE_POSTING_SAMPLE_NOT_VACANCY_RATE' ||
    source.repository !== 'franciscovitar/personal-ai-system' ||
    source.commit !== '08ae01c509111438cb77f0f9582b9966013ae4a2' ||
    source.canonicalRef !== 'AI/projects/professional-profile-v1/MARKET_FIT_QA_CURRENT_V1.json' ||
    source.evidenceDocumentRef !==
      'AI/projects/professional-profile-v1/MARKET_FIT_QA_2026-10-02.md' ||
    source.sourceSpreadsheetId !== '1JzpLjmMO1TK15KlNSzgJbSoq3a5PT0BBsUa0kMCAX0k' ||
    !date(source.observedAt) ||
    source.observedAt !== '2026-10-02' ||
    !date(source.generatedAt) ||
    sample.n !== 20 ||
    sample.method !== 'PURPOSIVE_REPRESENTATIVE_NOT_CENSUS' ||
    !Array.isArray(sample.roleFamilies) ||
    sample.roleFamilies.length !== 2 ||
    !sample.roleFamilies.every(text) ||
    !Array.isArray(sample.geographies) ||
    JSON.stringify(sample.geographies) !==
      JSON.stringify(['CORDOBA', 'ARGENTINA', 'LATAM_REMOTE']) ||
    !text(sample.attribution) ||
    !text(sample.scope) ||
    freshness.maxAgeDays !== 30 ||
    currentCollection.source !== 'Job Search Market Evidence V1' ||
    currentCollection.status !== 'HEADERS_ONLY_NO_OBSERVATIONS' ||
    !date(currentCollection.observedAt) ||
    currentCollection.repeatedComparableWindows !== 0 ||
    currentCollection.skillFrequencyByGeography !== 'HELD' ||
    currentCollection.skillTrend !== 'HELD' ||
    !Array.isArray(input.entries) ||
    input.entries.length !== IDS.size ||
    !input.entries.every(entry) ||
    new Set(input.entries.map((item: SkillMentionEntry) => item.id)).size !== IDS.size
  )
    return null;
  return input as unknown as SkillDemandBaseline;
}

export function resolveSkillDemandBaseline(
  raw: string | null,
  now = new Date(),
): SkillDemandBaselineData {
  if (raw === null)
    return {
      status: 'missing',
      notice: 'No hay evidencia laboral procesada disponible.',
      stale: false,
      snapshot: null,
    };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {
      status: 'invalid',
      notice: 'El archivo de evidencia laboral no es válido.',
      stale: false,
      snapshot: null,
    };
  }
  const snapshot = parseSkillDemandBaseline(data);
  if (!snapshot)
    return {
      status: 'invalid',
      notice: 'La evidencia laboral no pasó las comprobaciones de procedencia o método.',
      stale: false,
      snapshot: null,
    };
  const elapsed = now.getTime() - new Date(snapshot.source.observedAt + 'T00:00:00Z').getTime();
  const stale =
    !Number.isFinite(elapsed) || elapsed < 0 || elapsed > snapshot.freshness.maxAgeDays * 86400000;
  return {
    status: 'ready',
    stale,
    snapshot,
    notice: stale
      ? 'Muestra histórica: requiere observación nueva antes de usarla como evidencia de mercado actual.'
      : null,
  };
}
