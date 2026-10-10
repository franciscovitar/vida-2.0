export const FORECAST_HORIZONS = ['NEAR_12_24M', 'MID_3_5Y', 'LONG_5_10Y'] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];
export type ForecastOutlook =
  | 'STRONG_POSITIVE'
  | 'POSITIVE'
  | 'POSITIVE_BUT_TRANSFORMING'
  | 'MIXED'
  | 'PRESSURE_ON_ROUTINE_TASKS'
  | 'UNCERTAIN';
export type ForecastConfidence = 'HIGH' | 'MEDIUM_HIGH' | 'MEDIUM' | 'LOW';

interface TranslatedText {
  original: string;
  es: string;
}

export interface ForecastPhase {
  outlook: ForecastOutlook;
  confidence: ForecastConfidence;
  aiInteractionOriginal: string;
  aiInteractionEs: string;
}

export interface ForecastProfile {
  id: string;
  label: string;
  horizons: Record<ForecastHorizon, ForecastPhase>;
  signpostsUp: TranslatedText[];
  signpostsDown: TranslatedText[];
  action: TranslatedText;
}

export interface ProfessionalHorizonSnapshot {
  schemaVersion: 1;
  kind: 'professional_forecast_horizons';
  source: {
    repository: 'franciscovitar/personal-ai-system';
    ref: 'main';
    commit: string;
    canonicalRef: 'AI/projects/professional-intelligence/FORECAST_CURRENT_V1.json';
    observedAt: string;
    generatedAt: string;
    staleAfterDays: number;
    calibrationStatus: 'DIRECTIONAL_NOT_PROBABILISTICALLY_CALIBRATED';
  };
  forecastMode: 'BASE_DIRECTIONAL_ONLY';
  scenarioVariantsKnown: string[];
  profiles: ForecastProfile[];
}

export interface ProfessionalHorizonData {
  status: 'ready' | 'missing' | 'invalid';
  notice: string | null;
  stale: boolean;
  snapshot: ProfessionalHorizonSnapshot | null;
}

const OUTLOOKS = new Set<string>([
  'STRONG_POSITIVE',
  'POSITIVE',
  'POSITIVE_BUT_TRANSFORMING',
  'MIXED',
  'PRESSURE_ON_ROUTINE_TASKS',
  'UNCERTAIN',
]);
const CONFIDENCES = new Set<string>(['HIGH', 'MEDIUM_HIGH', 'MEDIUM', 'LOW']);
const IDS = new Set([
  'ai-native-product-software-engineering',
  'security-privacy-engineering',
  'data-ai-engineering',
  'platform-production-reliability',
  'systems-architecture-analysis',
  'web-implementation-only',
]);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  if (!nonempty(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(time.getTime()) && time.toISOString().slice(0, 10) === value;
}

function translated(value: unknown): boolean {
  return object(value) && nonempty(value.original) && nonempty(value.es);
}

function profile(value: unknown): value is ForecastProfile {
  if (
    !object(value) ||
    !nonempty(value.id) ||
    !IDS.has(value.id) ||
    !nonempty(value.label) ||
    !object(value.horizons) ||
    Object.keys(value.horizons).length !== FORECAST_HORIZONS.length ||
    !Array.isArray(value.signpostsUp) ||
    !Array.isArray(value.signpostsDown) ||
    !value.signpostsUp.length ||
    !value.signpostsDown.length ||
    !value.signpostsUp.every(translated) ||
    !value.signpostsDown.every(translated) ||
    !translated(value.action)
  ) {
    return false;
  }

  return FORECAST_HORIZONS.every((key) => {
    const phase = value.horizons[key];
    return (
      object(phase) &&
      Object.keys(phase).length === 4 &&
      OUTLOOKS.has(String(phase.outlook)) &&
      CONFIDENCES.has(String(phase.confidence)) &&
      nonempty(phase.aiInteractionOriginal) &&
      nonempty(phase.aiInteractionEs)
    );
  });
}

export function parseProfessionalHorizonSnapshot(
  input: unknown,
): ProfessionalHorizonSnapshot | null {
  if (!object(input) || !object(input.source)) return null;
  const source = input.source;
  if (
    input.schemaVersion !== 1 ||
    input.kind !== 'professional_forecast_horizons' ||
    source.repository !== 'franciscovitar/personal-ai-system' ||
    source.ref !== 'main' ||
    !nonempty(source.commit) ||
    !/^[0-9a-f]{40}$/.test(source.commit) ||
    source.canonicalRef !== 'AI/projects/professional-intelligence/FORECAST_CURRENT_V1.json' ||
    !validDate(source.observedAt) ||
    !validDate(source.generatedAt) ||
    !Number.isInteger(source.staleAfterDays) ||
    Number(source.staleAfterDays) < 1 ||
    source.calibrationStatus !== 'DIRECTIONAL_NOT_PROBABILISTICALLY_CALIBRATED' ||
    input.forecastMode !== 'BASE_DIRECTIONAL_ONLY' ||
    !Array.isArray(input.scenarioVariantsKnown) ||
    !input.scenarioVariantsKnown.includes('BASE') ||
    !input.scenarioVariantsKnown.includes('FASTER_AI_CAPABILITY_AND_ADOPTION') ||
    !input.scenarioVariantsKnown.includes('SLOWER_OR_CONSTRAINED_ADOPTION') ||
    !Array.isArray(input.profiles) ||
    input.profiles.length !== IDS.size ||
    !input.profiles.every(profile) ||
    new Set(input.profiles.map((item: ForecastProfile) => item.id)).size !== IDS.size
  ) {
    return null;
  }

  return input as unknown as ProfessionalHorizonSnapshot;
}

export function resolveProfessionalHorizonText(
  raw: string | null,
  now = new Date(),
): ProfessionalHorizonData {
  if (raw === null) {
    return {
      status: 'missing',
      notice: 'No hay pronósticos verificables disponibles.',
      stale: false,
      snapshot: null,
    };
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return {
      status: 'invalid',
      notice: 'El archivo de pronósticos no es válido.',
      stale: false,
      snapshot: null,
    };
  }

  const snapshot = parseProfessionalHorizonSnapshot(input);
  if (!snapshot) {
    return {
      status: 'invalid',
      notice: 'El pronóstico no superó los controles de procedencia y horizonte.',
      stale: false,
      snapshot: null,
    };
  }

  const observed = new Date(snapshot.source.observedAt + 'T00:00:00Z').getTime();
  const elapsed = now.getTime() - observed;
  const stale =
    !Number.isFinite(elapsed) ||
    elapsed < 0 ||
    elapsed > snapshot.source.staleAfterDays * 24 * 60 * 60 * 1000;

  return {
    status: 'ready',
    notice: stale
      ? 'Análisis antiguo: verificá la evidencia actual antes de tomar decisiones de carrera.'
      : null,
    stale,
    snapshot,
  };
}
