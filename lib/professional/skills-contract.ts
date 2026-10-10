export type SkillEvidenceState = 'DEMONSTRATED' | 'PRACTICED';
export type SkillConfidence = 'LOW' | 'MEDIUM' | 'MEDIUM_HIGH' | 'HIGH';

export interface SkillClaim {
  id: string;
  evidenceState: SkillEvidenceState;
  personalVerificationStatus: 'UNVERIFIED';
  confidence: SkillConfidence;
}

export interface SkillGrowthItem {
  id: string;
  title: string;
  queueState: 'QUEUED' | 'PRACTICING';
  confidence: SkillConfidence;
  whyNow: string;
  practiceContract: string;
  evidenceTarget: string;
  skillRefs: SkillClaim[];
}

export interface SkillRole {
  id: string;
  name: string;
  coreSkillRefs: string[];
}

export interface ProfessionalSkillsMatrix {
  version: 1;
  kind: 'professional_skills_evidence_matrix';
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: 'main';
    commit: string;
    canonicalRefs: string[];
    observedAt: string;
    personalEvidenceObservedAt: string;
    generatedAt: string;
    staleAfterDays: number;
  };
  method: 'ONTOLOGY_MEMBERSHIP_AND_PERSONAL_ARTIFACT_EVIDENCE_ONLY';
  marketSkillFrequencyStatus: 'INSUFFICIENT_COMPARABLE_REPEATED_JOB_SAMPLES';
  horizons: {
    current: 'CURRENT_GROWTH_QUEUE_ONLY';
    near: 'NO_SKILL_SPECIFIC_12_24M_PROJECTION';
    mid: 'NO_SKILL_SPECIFIC_3_5Y_PROJECTION';
    long: 'NO_SKILL_SPECIFIC_5_10Y_PROJECTION';
  };
  targetRoles: string[];
  roles: SkillRole[];
  items: SkillGrowthItem[];
}

export type ProfessionalSkillsData = {
  status: 'ready' | 'missing' | 'invalid';
  notice: string | null;
  stale: boolean;
  snapshot: ProfessionalSkillsMatrix | null;
};

const ROLE_IDS = new Set([
  'ai-native-product-engineer',
  'full-stack-product-engineer',
  'software-engineer',
  'systems-analyst-architect',
  'applied-ai-engineer',
  'data-analytics-engineer',
  'platform-production-engineer',
  'security-engineer',
  'technical-founder-product-builder',
]);
const ITEM_IDS = new Set(['GROWTH-001', 'GROWTH-002', 'GROWTH-003', 'GROWTH-004', 'GROWTH-005']);
const SKILL_IDS = new Set([
  'production-deployment-cloud',
  'distributed-systems-reliability',
  'testing-debugging-verification',
  'sql-relational-data-modeling',
  'postgresql-transactional-persistence',
  'software-design-architecture',
  'requirements-specification',
  'security-privacy-least-privilege',
  'applied-llm-systems',
  'ai-native-orchestration',
]);
const CANONICAL_REFS = [
  'AI/projects/professional-intelligence/PROFESSIONAL_GROWTH_CURRENT_V1.json',
  'AI/projects/professional-intelligence/ROLE_ARCHETYPES_V1.json',
  'AI/projects/professional-intelligence/PERSONAL_EVIDENCE_GRAPH_V1.json',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).every((key) => expected.includes(key));
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDate(value: unknown): value is string {
  if (!isText(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function roleValid(value: unknown): value is SkillRole {
  return (
    isObject(value) &&
    onlyKeys(value, ['id', 'name', 'coreSkillRefs']) &&
    isText(value.id) &&
    ROLE_IDS.has(value.id) &&
    isText(value.name) &&
    Array.isArray(value.coreSkillRefs) &&
    value.coreSkillRefs.length >= 4 &&
    value.coreSkillRefs.every(isText) &&
    new Set(value.coreSkillRefs).size === value.coreSkillRefs.length
  );
}

function claimValid(value: unknown): value is SkillClaim {
  return (
    isObject(value) &&
    onlyKeys(value, ['id', 'evidenceState', 'personalVerificationStatus', 'confidence']) &&
    isText(value.id) &&
    SKILL_IDS.has(value.id) &&
    (value.evidenceState === 'DEMONSTRATED' || value.evidenceState === 'PRACTICED') &&
    value.personalVerificationStatus === 'UNVERIFIED' &&
    ['LOW', 'MEDIUM', 'MEDIUM_HIGH', 'HIGH'].includes(String(value.confidence))
  );
}

function itemValid(value: unknown): value is SkillGrowthItem {
  return (
    isObject(value) &&
    onlyKeys(value, [
      'id',
      'title',
      'queueState',
      'confidence',
      'whyNow',
      'practiceContract',
      'evidenceTarget',
      'skillRefs',
    ]) &&
    isText(value.id) &&
    ITEM_IDS.has(value.id) &&
    isText(value.title) &&
    ['QUEUED', 'PRACTICING'].includes(String(value.queueState)) &&
    ['LOW', 'MEDIUM', 'MEDIUM_HIGH', 'HIGH'].includes(String(value.confidence)) &&
    isText(value.whyNow) &&
    isText(value.practiceContract) &&
    isText(value.evidenceTarget) &&
    Array.isArray(value.skillRefs) &&
    value.skillRefs.length > 0 &&
    value.skillRefs.every(claimValid) &&
    new Set(value.skillRefs.map((claim: SkillClaim) => claim.id)).size === value.skillRefs.length
  );
}

export function parseProfessionalSkillsMatrix(input: unknown): ProfessionalSkillsMatrix | null {
  if (!isObject(input) || !isObject(input.source) || !isObject(input.horizons)) return null;
  const source = input.source;
  if (
    !onlyKeys(input, [
      'version',
      'kind',
      'source',
      'method',
      'marketSkillFrequencyStatus',
      'horizons',
      'targetRoles',
      'roles',
      'items',
    ]) ||
    !onlyKeys(source, [
      'repository',
      'ref',
      'commit',
      'canonicalRefs',
      'observedAt',
      'personalEvidenceObservedAt',
      'generatedAt',
      'staleAfterDays',
    ]) ||
    !onlyKeys(input.horizons, ['current', 'near', 'mid', 'long']) ||
    input.version !== 1 ||
    input.kind !== 'professional_skills_evidence_matrix' ||
    source.repository !== 'franciscovitar/personal-ai-system' ||
    source.ref !== 'main' ||
    !isText(source.commit) ||
    source.commit !== '08ae01c509111438cb77f0f9582b9966013ae4a2' ||
    !Array.isArray(source.canonicalRefs) ||
    JSON.stringify(source.canonicalRefs) !== JSON.stringify(CANONICAL_REFS) ||
    !isDate(source.observedAt) ||
    !isDate(source.personalEvidenceObservedAt) ||
    !isDate(source.generatedAt) ||
    !Number.isInteger(source.staleAfterDays) ||
    Number(source.staleAfterDays) < 1 ||
    input.method !== 'ONTOLOGY_MEMBERSHIP_AND_PERSONAL_ARTIFACT_EVIDENCE_ONLY' ||
    input.marketSkillFrequencyStatus !== 'INSUFFICIENT_COMPARABLE_REPEATED_JOB_SAMPLES' ||
    input.horizons.current !== 'CURRENT_GROWTH_QUEUE_ONLY' ||
    input.horizons.near !== 'NO_SKILL_SPECIFIC_12_24M_PROJECTION' ||
    input.horizons.mid !== 'NO_SKILL_SPECIFIC_3_5Y_PROJECTION' ||
    input.horizons.long !== 'NO_SKILL_SPECIFIC_5_10Y_PROJECTION' ||
    !Array.isArray(input.targetRoles) ||
    input.targetRoles.length !== 2 ||
    !input.targetRoles.every(isText) ||
    !Array.isArray(input.roles) ||
    input.roles.length !== ROLE_IDS.size ||
    !input.roles.every(roleValid) ||
    new Set(input.roles.map((role: SkillRole) => role.id)).size !== ROLE_IDS.size ||
    !Array.isArray(input.items) ||
    input.items.length !== ITEM_IDS.size ||
    !input.items.every(itemValid) ||
    new Set(input.items.map((item: SkillGrowthItem) => item.id)).size !== ITEM_IDS.size
  ) {
    return null;
  }
  const roles = input.roles as SkillRole[];
  const items = input.items as SkillGrowthItem[];
  const claimStates = new Map<string, SkillEvidenceState>();
  for (const item of items) {
    for (const claim of item.skillRefs) {
      if (!roles.some((role) => role.coreSkillRefs.includes(claim.id))) return null;
      const previous = claimStates.get(claim.id);
      if (previous && previous !== claim.evidenceState) return null;
      claimStates.set(claim.id, claim.evidenceState);
    }
  }
  return input as unknown as ProfessionalSkillsMatrix;
}

export function resolveProfessionalSkillsText(
  raw: string | null,
  now = new Date(),
): ProfessionalSkillsData {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'El comparador de habilidades aún no tiene evidencia disponible.',
      stale: false,
      snapshot: null,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: 'invalid',
      notice: 'La evidencia del comparador es inválida.',
      stale: false,
      snapshot: null,
    };
  }
  const snapshot = parseProfessionalSkillsMatrix(parsed);
  if (!snapshot) {
    return {
      status: 'invalid',
      notice: 'El comparador no superó los controles de procedencia y comparabilidad.',
      stale: false,
      snapshot: null,
    };
  }
  const elapsed = now.getTime() - new Date(snapshot.source.observedAt + 'T00:00:00Z').getTime();
  const stale = elapsed < 0 || elapsed > snapshot.source.staleAfterDays * 86400000;
  return {
    status: 'ready',
    notice: stale ? 'La evidencia de habilidades necesita revisión antes de decidir.' : null,
    stale,
    snapshot,
  };
}
