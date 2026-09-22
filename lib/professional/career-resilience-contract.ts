import type {
  CareerResilienceConfidence,
  CareerResilienceData,
  CareerResilienceSnapshot,
} from '@/types/career-resilience';

const CONFIDENCE = new Set<CareerResilienceConfidence>(['LOW', 'MEDIUM', 'MEDIUM_HIGH', 'HIGH']);
const HORIZONS = ['Y1', 'Y5', 'Y10', 'Y20'] as const;
const REQUIRED_DATA_PROFILES = new Set(['data-engineer', 'data-scientist', 'data-analyst-bi']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isString);
}

function validRange(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(isNumber) &&
    value[0] >= 0 &&
    value[1] <= 100 &&
    value[0] <= value[1]
  );
}

function validSource(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.name) &&
    isString(value.kind) &&
    isString(value.url) &&
    value.url.startsWith('https://') &&
    (value.publishedAt === null || isString(value.publishedAt)) &&
    isString(value.observedAt) &&
    isString(value.confidence) &&
    isString(value.note)
  );
}

function validHorizon(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    validRange(value.aiAloneSubstitutionPressurePctRange) &&
    value.pressureSemantics === 'UNCALIBRATED_SCENARIO_ESTIMATE' &&
    validRange(value.aiNativeResilienceIndexRange) &&
    value.resilienceSemantics === 'HEURISTIC_INDEX_NOT_PROBABILITY' &&
    validRange(value.headcountCompressionIndexRange) &&
    value.compressionSemantics === 'HEURISTIC_INDEX_NOT_PROBABILITY' &&
    typeof value.confidence === 'string' &&
    CONFIDENCE.has(value.confidence as CareerResilienceConfidence) &&
    isString(value.summary)
  );
}

export function parseCareerResilienceSnapshot(value: unknown): CareerResilienceSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;

  const source = value.source;
  if (
    !isRecord(source) ||
    source.repository !== 'franciscovitar/personal-ai-system' ||
    source.ref !== 'main' ||
    !isString(source.commit) ||
    !/^[a-f0-9]{40}$/.test(source.commit) ||
    !isString(source.generatedAt) ||
    !isString(source.observedAt) ||
    !isNumber(source.staleAfterDays) ||
    source.staleAfterDays <= 0 ||
    !isString(source.canonicalRef)
  ) {
    return null;
  }

  if (
    !isString(value.statement) ||
    !isString(value.status) ||
    !isRecord(value.numericSemantics) ||
    !Array.isArray(value.sources) ||
    !value.sources.every(validSource) ||
    !Array.isArray(value.roles) ||
    value.roles.length < 1 ||
    !Array.isArray(value.crossRoleFindings) ||
    !Array.isArray(value.globalProtectionStrategy) ||
    !value.globalProtectionStrategy.every(isString) ||
    !Array.isArray(value.limitations) ||
    !value.limitations.every(isString)
  ) {
    return null;
  }

  const sourceIds = new Set(
    (value.sources as Array<Record<string, unknown>>).map((item) => String(item.id)),
  );
  if (sourceIds.size !== value.sources.length) return null;

  const roleIds = new Set<string>();
  for (const role of value.roles) {
    if (!isRecord(role) || !isString(role.id) || roleIds.has(role.id)) return null;
    roleIds.add(role.id);

    if (
      !isString(role.name) ||
      !isStringArray(role.baseRoleRefs) ||
      !isRecord(role.demand) ||
      !isString(role.demand.direction) ||
      !isStringArray(role.demand.facts) ||
      !isStringArray(role.demand.sourceRefs) ||
      !isString(role.aiTransformation) ||
      !isStringArray(role.loadBearingHumanWork) ||
      !isRecord(role.horizons) ||
      !isStringArray(role.riskUpSignposts) ||
      !isStringArray(role.riskDownSignposts) ||
      !isStringArray(role.protectionPlaybook) ||
      !isStringArray(role.sourceRefs)
    ) {
      return null;
    }

    const horizons = role.horizons as Record<string, unknown>;
    if (
      Object.keys(horizons).length !== HORIZONS.length ||
      !HORIZONS.every((key) => validHorizon(horizons[key]))
    ) {
      return null;
    }

    for (const ref of [...role.demand.sourceRefs, ...role.sourceRefs]) {
      if (!sourceIds.has(ref)) return null;
    }
  }

  if (![...REQUIRED_DATA_PROFILES].every((id) => roleIds.has(id))) return null;

  for (const finding of value.crossRoleFindings) {
    if (
      !isRecord(finding) ||
      !isString(finding.id) ||
      !isString(finding.finding) ||
      !isStringArray(finding.sourceRefs) ||
      !finding.sourceRefs.every((ref) => sourceIds.has(ref))
    ) {
      return null;
    }
  }

  if (
    !String(value.numericSemantics.ai_alone_substitution_pressure_pct_range).includes(
      'UNCALIBRATED',
    ) ||
    !String(value.numericSemantics.ai_native_resilience_index_range).includes(
      'NOT_PROBABILITY',
    ) ||
    !String(value.numericSemantics.headcount_compression_index_range).includes(
      'NOT_PERCENT_JOBS_LOST',
    )
  ) {
    return null;
  }

  return value as unknown as CareerResilienceSnapshot;
}

export function isCareerResilienceStale(
  snapshot: CareerResilienceSnapshot,
  now = new Date(),
): boolean {
  const observed = new Date(`${snapshot.source.observedAt}T00:00:00Z`);
  if (Number.isNaN(observed.getTime())) return true;
  return (
    Math.max(0, now.getTime() - observed.getTime()) >
    snapshot.source.staleAfterDays * 24 * 60 * 60 * 1000
  );
}

export function resolveCareerResilienceText(raw: string | null, now?: Date): CareerResilienceData {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'El radar de resiliencia profesional ante IA no está disponible.',
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
      notice: 'El radar de resiliencia profesional ante IA tiene JSON inválido.',
      stale: false,
      snapshot: null,
    };
  }

  const snapshot = parseCareerResilienceSnapshot(parsed);
  if (!snapshot) {
    return {
      status: 'invalid',
      notice: 'El radar de resiliencia profesional ante IA no cumple el contrato.',
      stale: false,
      snapshot: null,
    };
  }

  const stale = isCareerResilienceStale(snapshot, now);
  return {
    status: 'ready',
    notice: stale ? 'Este análisis necesita refresh antes de usarlo para una decisión sensible.' : null,
    stale,
    snapshot,
  };
}
