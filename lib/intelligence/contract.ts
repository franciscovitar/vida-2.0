import type {
  IntelligenceAction,
  IntelligenceEditorialData,
  IntelligenceEditorialSnapshot,
} from '@/types/intelligence-editorial';

const ACTIONS = new Set<IntelligenceAction>(['DO_NOW', 'TRY', 'WATCH', 'NO_ACTION']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function everyArray(value: unknown, predicate: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(predicate);
}

function validQuickPoint(value: unknown): boolean {
  return isRecord(value) && isString(value.title) && isString(value.detail);
}

function validSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.role) &&
    isString(value.title) &&
    isString(value.url) &&
    isString(value.observedAt)
  );
}

function validPasUpdate(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isString(value.before) &&
    isString(value.now) &&
    isString(value.whatYouNotice) &&
    isString(value.actionRequired) &&
    isString(value.costLabel) &&
    isString(value.status) &&
    isString(value.sourceRef)
  );
}

function validAiBrief(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    ['MATERIAL', 'NO_MATERIAL_UPDATE'].includes(String(value.status)) &&
    isString(value.periodLabel) &&
    isNumber(value.readingMinutes) &&
    value.readingMinutes > 0 &&
    value.readingMinutes <= 10 &&
    isString(value.title) &&
    isString(value.oneBigThing) &&
    everyArray(value.quickPoints, validQuickPoint) &&
    isString(value.explainedSimply) &&
    isString(value.whyItMatters) &&
    isString(value.appliedToUser) &&
    typeof value.action === 'string' &&
    ACTIONS.has(value.action as IntelligenceAction) &&
    isString(value.actionText) &&
    isString(value.noiseFilter) &&
    everyArray(value.unknowns, isString) &&
    everyArray(value.sources, validSource)
  );
}

export function parseIntelligenceEditorialSnapshot(
  value: unknown,
): IntelligenceEditorialSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.readingDebt !== false) return null;

  const source = value.source;
  if (!isRecord(source)) return null;

  const sourceValid =
    source.repository === 'franciscovitar/personal-ai-system' &&
    source.ref === 'main' &&
    source.canonicalRef === 'AI/editorial/INTELLIGENCE_EDITORIAL_CURRENT.json' &&
    isString(source.commit) &&
    /^[a-f0-9]{40}$/.test(source.commit) &&
    isString(source.generatedAt) &&
    isString(source.observedAt) &&
    isNumber(source.staleAfterDays) &&
    source.staleAfterDays > 0;

  if (
    !sourceValid ||
    !validAiBrief(value.aiBrief) ||
    !everyArray(value.pasUpdates, validPasUpdate) ||
    !everyArray(value.mustKnowItems, isString) ||
    !isString(value.editorialNote)
  ) {
    return null;
  }

  return value as unknown as IntelligenceEditorialSnapshot;
}

export function isIntelligenceEditorialSnapshotStale(
  snapshot: IntelligenceEditorialSnapshot,
  now = new Date(),
): boolean {
  const observed = new Date(`${snapshot.source.observedAt}T00:00:00Z`);
  if (Number.isNaN(observed.getTime())) return true;

  const ageMs = Math.max(0, now.getTime() - observed.getTime());
  return ageMs > snapshot.source.staleAfterDays * 24 * 60 * 60 * 1000;
}

export function resolveIntelligenceEditorialSnapshotText(
  raw: string | null,
  now?: Date,
): IntelligenceEditorialData {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'Inteligencia no está disponible: falta el snapshot editorial derivado.',
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
      notice: 'Inteligencia no está disponible: el snapshot editorial no es JSON válido.',
      stale: false,
      snapshot: null,
    };
  }

  const snapshot = parseIntelligenceEditorialSnapshot(parsed);
  if (!snapshot) {
    return {
      status: 'invalid',
      notice: 'Inteligencia no está disponible: el snapshot editorial no cumple el contrato.',
      stale: false,
      snapshot: null,
    };
  }

  const stale = isIntelligenceEditorialSnapshotStale(snapshot, now);
  return {
    status: 'ready',
    notice: stale
      ? 'El brief editorial está disponible, pero necesita refresh para representar la semana actual.'
      : null,
    stale,
    snapshot,
  };
}
