import type {
  ProfessionalConfidence,
  ProfessionalIntelligenceData,
  ProfessionalSnapshot,
} from '@/types/professional-intelligence';

const CONFIDENCE = new Set<ProfessionalConfidence>([
  'LOW',
  'MEDIUM',
  'MEDIUM_HIGH',
  'HIGH',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isConfidence(value: unknown): value is ProfessionalConfidence {
  return typeof value === 'string' && CONFIDENCE.has(value as ProfessionalConfidence);
}

function everyArray(
  value: unknown,
  predicate: (item: unknown) => boolean,
): boolean {
  return Array.isArray(value) && value.every(predicate);
}

function validNowMove(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.title) &&
    isString(value.why) &&
    isString(value.route) &&
    isConfidence(value.confidence)
  );
}

function validEvidence(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value.capability) &&
    ['PRACTICED', 'DEMONSTRATED', 'EXTERNALLY_VALIDATED'].includes(
      String(value.state),
    ) &&
    isConfidence(value.confidence) &&
    isString(value.note)
  );
}

function validPriority(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNumber(value.rank) &&
    isString(value.capability) &&
    isString(value.actionType) &&
    isString(value.action) &&
    isConfidence(value.confidence)
  );
}

function validTechnology(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.name) &&
    isString(value.capability) &&
    isString(value.disposition) &&
    isString(value.priceLabel) &&
    isBoolean(value.freeTier) &&
    isString(value.application) &&
    isString(value.personalEvalStatus) &&
    value.decisionOwner === 'system-maintenance'
  );
}

function validLearning(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.capability) &&
    isString(value.mode) &&
    isString(value.rationale) &&
    isBoolean(value.courseNeededNow) &&
    isBoolean(value.credentialNeededNow)
  );
}

function validFinding(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.claim) &&
    isString(value.status) &&
    isString(value.note)
  );
}

function validForecastItem(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value.subject) &&
    isString(value.label) &&
    isString(value.nearOutlook) &&
    isConfidence(value.nearConfidence) &&
    isString(value.aiInteraction)
  );
}

function validFluencyFamily(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.route) &&
    isString(value.evalStatus) &&
    isNumber(value.outcomeEvidenceCount) &&
    isString(value.nextMeasurement)
  );
}

export function parseProfessionalSnapshot(value: unknown): ProfessionalSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;

  const source = value.source;
  const market = value.market;
  const forecast = value.forecast;
  const aiFluency = value.aiFluency;

  if (
    !isRecord(source) ||
    !isRecord(market) ||
    !isRecord(forecast) ||
    !isRecord(aiFluency)
  ) {
    return null;
  }

  const sourceValid =
    source.repository === 'franciscovitar/personal-ai-system' &&
    source.ref === 'main' &&
    isString(source.commit) &&
    isString(source.generatedAt) &&
    isString(source.observedAt) &&
    isNumber(source.staleAfterDays) &&
    source.staleAfterDays > 0;

  const marketValid =
    isString(market.observedAt) &&
    isString(market.status) &&
    everyArray(market.signals, isString) &&
    everyArray(market.limitations, isString);

  const forecastValid =
    isString(forecast.direction) &&
    isConfidence(forecast.confidence) &&
    everyArray(forecast.items, validForecastItem);

  const fluencyValid =
    isString(aiFluency.status) &&
    isNumber(aiFluency.materialOutcomesLogged) &&
    everyArray(aiFluency.taskFamilies, validFluencyFamily);

  if (
    !sourceValid ||
    !marketValid ||
    !forecastValid ||
    !fluencyValid ||
    !isString(value.profileSummary) ||
    !everyArray(value.nowMoves, validNowMove) ||
    !everyArray(value.strongestEvidence, validEvidence) ||
    !everyArray(value.priorities, validPriority) ||
    !everyArray(value.technologies, validTechnology) ||
    !everyArray(value.learning, validLearning) ||
    !everyArray(value.profileFindings, validFinding)
  ) {
    return null;
  }

  return value as unknown as ProfessionalSnapshot;
}

export function isProfessionalSnapshotStale(
  snapshot: ProfessionalSnapshot,
  now = new Date(),
): boolean {
  const observed = new Date(`${snapshot.source.observedAt}T00:00:00Z`);
  if (Number.isNaN(observed.getTime())) return true;

  const ageMs = Math.max(0, now.getTime() - observed.getTime());
  return ageMs > snapshot.source.staleAfterDays * 24 * 60 * 60 * 1000;
}

export function resolveProfessionalSnapshotText(
  raw: string | null,
  now?: Date,
): ProfessionalIntelligenceData {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'Professional Intelligence no está disponible: falta el snapshot derivado.',
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
      notice: 'Professional Intelligence no está disponible: el snapshot no es JSON válido.',
      stale: false,
      snapshot: null,
    };
  }

  const snapshot = parseProfessionalSnapshot(parsed);
  if (!snapshot) {
    return {
      status: 'invalid',
      notice: 'Professional Intelligence no está disponible: el snapshot no cumple el contrato.',
      stale: false,
      snapshot: null,
    };
  }

  const stale = isProfessionalSnapshotStale(snapshot, now);
  return {
    status: 'ready',
    notice: stale
      ? 'El snapshot profesional está disponible, pero necesita refresh antes de una decisión sensible.'
      : null,
    stale,
    snapshot,
  };
}
