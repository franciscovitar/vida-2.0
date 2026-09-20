import type {
  HealthBaselineSignal,
  HealthPageData,
  HealthSignalId,
} from '@/types/domain-pages';

export const PERSONAL_DEVIATION_RADAR_VERSION = 'personal-deviation-radar-v1.0.0';

export type PersonalDeviationLevel =
  | 'usual'
  | 'mild'
  | 'moderate'
  | 'marked'
  | 'insufficient';

export type PersonalDeviationDirection = 'above' | 'below' | 'mixed' | 'unknown';

type PersonalDeviationSignalState = 'usual' | 'mild' | 'shifted' | 'insufficient';

type PersonalDeviationClusterId = 'sleep' | 'cardio' | 'activity' | 'mobility';

interface SignalDefinition {
  id: Extract<
    HealthSignalId,
    'sleep' | 'restingHr' | 'steps' | 'walkingSpeed' | 'stepLengthCm' | 'walkingAsymmetry'
  >;
  label: string;
  cluster: PersonalDeviationClusterId;
  observation: 'today' | 'recent';
  minimumAbsolute: number;
  mildRelative: number;
  materialRelative: number;
}

export interface PersonalDeviationSignal {
  id: SignalDefinition['id'];
  label: string;
  cluster: PersonalDeviationClusterId;
  observation: 'today' | 'recent';
  state: PersonalDeviationSignalState;
  direction: Exclude<PersonalDeviationDirection, 'mixed'>;
  robustDistance: number | null;
  relativeDeviation: number | null;
  persistent: boolean;
  baselineDays: number;
  observedDays: number;
  detail: string;
}

export interface PersonalDeviationCluster {
  id: PersonalDeviationClusterId;
  label: string;
  state: 'usual' | 'mild' | 'shifted' | 'insufficient';
  direction: PersonalDeviationDirection;
  signals: readonly PersonalDeviationSignal[];
  detail: string;
}

export interface PersonalDeviationRadar {
  state: 'ready' | 'insufficient' | 'unavailable';
  level: PersonalDeviationLevel;
  headline: string;
  detail: string;
  shiftedClusters: number;
  mildClusters: number;
  comparableClusters: number;
  clusters: readonly PersonalDeviationCluster[];
  caveat: string;
  calculationVersion: typeof PERSONAL_DEVIATION_RADAR_VERSION;
}

const BASELINE_MIN_DAYS = 14;
const ROBUST_MILD_Z = 1.5;
const ROBUST_SHIFT_Z = 2.5;
const MAD_SCALE = 1.4826;

const SIGNALS: readonly SignalDefinition[] = [
  {
    id: 'sleep',
    label: 'Sueño',
    cluster: 'sleep',
    observation: 'today',
    minimumAbsolute: 0.4,
    mildRelative: 0.06,
    materialRelative: 0.12,
  },
  {
    id: 'restingHr',
    label: 'FC en reposo',
    cluster: 'cardio',
    observation: 'today',
    minimumAbsolute: 3,
    mildRelative: 0.035,
    materialRelative: 0.07,
  },
  {
    id: 'steps',
    label: 'Actividad',
    cluster: 'activity',
    observation: 'recent',
    minimumAbsolute: 800,
    mildRelative: 0.15,
    materialRelative: 0.3,
  },
  {
    id: 'walkingSpeed',
    label: 'Velocidad al caminar',
    cluster: 'mobility',
    observation: 'recent',
    minimumAbsolute: 0.15,
    mildRelative: 0.04,
    materialRelative: 0.08,
  },
  {
    id: 'stepLengthCm',
    label: 'Longitud de paso',
    cluster: 'mobility',
    observation: 'recent',
    minimumAbsolute: 2,
    mildRelative: 0.03,
    materialRelative: 0.06,
  },
  {
    id: 'walkingAsymmetry',
    label: 'Asimetría al caminar',
    cluster: 'mobility',
    observation: 'recent',
    minimumAbsolute: 1,
    mildRelative: 0.15,
    materialRelative: 0.3,
  },
];

const CLUSTER_LABELS: Readonly<Record<PersonalDeviationClusterId, string>> = {
  sleep: 'Sueño',
  cardio: 'Cardio',
  activity: 'Actividad',
  mobility: 'Movilidad',
};

function center(stat: HealthBaselineSignal): number | null {
  return stat.median ?? stat.average;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function classifySignal(input: {
  definition: SignalDefinition;
  value: number | null;
  baseline: HealthBaselineSignal;
  observedDays: number;
}): Omit<PersonalDeviationSignal, 'persistent'> {
  const { definition, value, baseline, observedDays } = input;
  const baselineCenter = center(baseline);

  if (
    value === null ||
    baselineCenter === null ||
    baseline.days < BASELINE_MIN_DAYS ||
    observedDays === 0
  ) {
    return {
      id: definition.id,
      label: definition.label,
      cluster: definition.cluster,
      observation: definition.observation,
      state: 'insufficient',
      direction: 'unknown',
      robustDistance: null,
      relativeDeviation: null,
      baselineDays: baseline.days,
      observedDays,
      detail:
        baseline.days < BASELINE_MIN_DAYS
          ? `Base personal insuficiente: ${baseline.days}/${BASELINE_MIN_DAYS} días comparables.`
          : 'Sin evidencia comparable suficiente.',
    };
  }

  const delta = value - baselineCenter;
  const direction: PersonalDeviationSignal['direction'] =
    delta > 0 ? 'above' : delta < 0 ? 'below' : 'unknown';
  const relativeDeviation =
    baselineCenter === 0 ? null : round(delta / Math.abs(baselineCenter), 3);
  const absoluteDelta = Math.abs(delta);

  let robustDistance: number | null = null;
  if (baseline.mad !== null && baseline.mad > 0) {
    robustDistance = round(delta / (MAD_SCALE * baseline.mad), 2);
  }

  let state: PersonalDeviationSignalState = 'usual';
  if (absoluteDelta >= definition.minimumAbsolute) {
    if (robustDistance !== null) {
      const magnitude = Math.abs(robustDistance);
      if (magnitude >= ROBUST_SHIFT_Z) state = 'shifted';
      else if (magnitude >= ROBUST_MILD_Z) state = 'mild';
    } else if (relativeDeviation !== null) {
      const magnitude = Math.abs(relativeDeviation);
      if (magnitude >= definition.materialRelative) state = 'shifted';
      else if (magnitude >= definition.mildRelative) state = 'mild';
    } else {
      state = 'mild';
    }
  }

  const scope = definition.observation === 'today' ? 'Hoy' : 'Mediana de 7 días';
  const magnitudeDetail =
    robustDistance !== null
      ? `${Math.abs(robustDistance).toFixed(1)} MAD robustas de tu centro personal`
      : relativeDeviation !== null
        ? `${Math.round(Math.abs(relativeDeviation) * 100)}% respecto de tu centro personal`
        : 'respecto de tu centro personal';

  return {
    id: definition.id,
    label: definition.label,
    cluster: definition.cluster,
    observation: definition.observation,
    state,
    direction,
    robustDistance,
    relativeDeviation,
    baselineDays: baseline.days,
    observedDays,
    detail:
      state === 'usual'
        ? `${scope}: dentro de tu variación personal reciente.`
        : `${scope}: ${magnitudeDetail}, ${direction === 'above' ? 'por encima' : 'por debajo'} de tu patrón.`,
  };
}

function persistenceFor(
  definition: SignalDefinition,
  signal: Omit<PersonalDeviationSignal, 'persistent'>,
  health: HealthPageData,
): boolean {
  if (signal.state === 'insufficient' || signal.direction === 'unknown') return false;
  if (definition.observation === 'recent') return signal.state === 'shifted';

  const recent = health.signals.recent[definition.id];
  const recentValue = center(recent);
  const recentSignal = classifySignal({
    definition: { ...definition, observation: 'recent' },
    value: recentValue,
    baseline: health.signals.baseline[definition.id],
    observedDays: recent.days,
  });

  return (
    (recentSignal.state === 'mild' || recentSignal.state === 'shifted') &&
    recentSignal.direction === signal.direction
  );
}

function directionForSignals(
  signals: readonly PersonalDeviationSignal[],
): PersonalDeviationDirection {
  const directions = [
    ...new Set(
      signals
        .filter((signal) => signal.state === 'mild' || signal.state === 'shifted')
        .map((signal) => signal.direction)
        .filter((direction) => direction !== 'unknown'),
    ),
  ];

  if (directions.length === 0) return 'unknown';
  if (directions.length > 1) return 'mixed';
  return directions[0];
}

function buildCluster(
  id: PersonalDeviationClusterId,
  signals: readonly PersonalDeviationSignal[],
): PersonalDeviationCluster {
  const comparable = signals.filter((signal) => signal.state !== 'insufficient');
  if (comparable.length === 0) {
    return {
      id,
      label: CLUSTER_LABELS[id],
      state: 'insufficient',
      direction: 'unknown',
      signals,
      detail: 'Sin evidencia comparable suficiente para esta dimensión.',
    };
  }

  const shifted = comparable.filter((signal) => signal.state === 'shifted');
  const mild = comparable.filter((signal) => signal.state === 'mild');

  let state: PersonalDeviationCluster['state'] = 'usual';
  if (id === 'mobility' && comparable.length > 1) {
    if (shifted.length >= 2 || (shifted.length >= 1 && mild.length >= 1)) state = 'shifted';
    else if (shifted.length >= 1 || mild.length >= 1) state = 'mild';
  } else if (shifted.length >= 1) {
    state = 'shifted';
  } else if (mild.length >= 1) {
    state = 'mild';
  }

  const persistent = comparable.filter((signal) => signal.persistent).length;
  const direction = directionForSignals(comparable);

  return {
    id,
    label: CLUSTER_LABELS[id],
    state,
    direction,
    signals,
    detail:
      state === 'usual'
        ? 'Sin cambio material respecto de tu patrón personal.'
        : persistent > 0
          ? `${persistent} señal(es) muestran además un cambio sostenido en la ventana reciente.`
          : 'Cambio actual respecto de tu patrón, sin persistencia suficiente para afirmarlo como sostenido.',
  };
}

function headlineFor(level: PersonalDeviationLevel): string {
  if (level === 'usual') return 'Sin desviaciones multiseñal relevantes';
  if (level === 'mild') return 'Hay cambios leves respecto de tu patrón';
  if (level === 'moderate') return 'Varias dimensiones se apartaron de tu patrón';
  if (level === 'marked') return 'Hay un cambio multiseñal marcado respecto de tu patrón';
  return 'Todavía no hay evidencia suficiente para un radar personal';
}

export function buildPersonalDeviationRadar(health: HealthPageData): PersonalDeviationRadar {
  const caveat =
    'Detecta cambios respecto de tu propia historia. No diagnostica enfermedad, estrés, sobreentrenamiento ni otra causa.';

  if (!health.sourceAvailable) {
    return {
      state: 'unavailable',
      level: 'insufficient',
      headline: 'Radar personal no disponible',
      detail: 'No se pudo leer la fuente de salud necesaria para comparar contra tu patrón.',
      shiftedClusters: 0,
      mildClusters: 0,
      comparableClusters: 0,
      clusters: [],
      caveat,
      calculationVersion: PERSONAL_DEVIATION_RADAR_VERSION,
    };
  }

  const signals = SIGNALS.map((definition): PersonalDeviationSignal => {
    const baseline = health.signals.baseline[definition.id];
    const todayValue = health.signals.today?.values[definition.id] ?? null;
    const observed =
      definition.observation === 'today'
        ? {
            value: todayValue,
            days: todayValue === null ? 0 : 1,
          }
        : {
            value: center(health.signals.recent[definition.id]),
            days: health.signals.recent[definition.id].days,
          };

    const classified = classifySignal({
      definition,
      value: observed.value,
      baseline,
      observedDays: observed.days,
    });

    return {
      ...classified,
      persistent: persistenceFor(definition, classified, health),
    };
  });

  const clusters = (Object.keys(CLUSTER_LABELS) as PersonalDeviationClusterId[]).map((id) =>
    buildCluster(
      id,
      signals.filter((signal) => signal.cluster === id),
    ),
  );

  const comparable = clusters.filter((cluster) => cluster.state !== 'insufficient');
  const shifted = comparable.filter((cluster) => cluster.state === 'shifted').length;
  const mild = comparable.filter((cluster) => cluster.state === 'mild').length;

  let level: PersonalDeviationLevel;
  if (comparable.length < 2) level = 'insufficient';
  else if (shifted >= 3) level = 'marked';
  else if (shifted >= 2) level = 'moderate';
  else if (shifted >= 1 || mild >= 1) level = 'mild';
  else level = 'usual';

  const persistentClusters = comparable.filter((cluster) =>
    cluster.signals.some((signal) => signal.persistent),
  ).length;

  return {
    state: level === 'insufficient' ? 'insufficient' : 'ready',
    level,
    headline: headlineFor(level),
    detail:
      level === 'insufficient'
        ? `Hay ${comparable.length} dimensión(es) comparables; hacen falta al menos 2 para una lectura multiseñal.`
        : `${shifted} dimensión(es) con desvío material, ${mild} con cambio leve y ${persistentClusters} con persistencia reciente.`,
    shiftedClusters: shifted,
    mildClusters: mild,
    comparableClusters: comparable.length,
    clusters,
    caveat,
    calculationVersion: PERSONAL_DEVIATION_RADAR_VERSION,
  };
}
