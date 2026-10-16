import type {
  DailyOrientationDateType,
  DailyOrientationEvidenceState,
  DailyOrientationLifeSignalLevel,
  DailyOrientationProgressEffect,
} from '@/types/daily-orientation-v2';

const EVIDENCE_LABELS: Record<DailyOrientationEvidenceState, string> = {
  VERIFIED: 'Verificado',
  SUPPORTED: 'Respaldado',
  DECLARED: 'Declarado',
  PARTIAL: 'Parcial',
  UNVERIFIED: 'Sin verificar',
  CONFLICT: 'En conflicto',
  UNKNOWN: 'Sin confirmar',
};

const PROGRESS_LABELS: Record<DailyOrientationProgressEffect, string> = {
  none: 'Sin cambio de progreso',
  possible: 'Avance posible',
  verified: 'Avance verificado',
  conflict: 'Avance en conflicto',
  unknown: 'Avance sin confirmar',
};

const DATE_TYPE_LABELS: Record<DailyOrientationDateType, string> = {
  deadline: 'Fecha límite',
  target: 'Fecha objetivo',
  review: 'Revisión',
  event: 'Evento',
  assessment: 'Evaluación',
  unknown: 'Tipo por confirmar',
};

const LIFE_LEVEL_LABELS: Record<DailyOrientationLifeSignalLevel, string> = {
  normal: 'Normal',
  notice: 'A observar',
  'candidate-pattern': 'Posible patrón',
  unknown: 'Sin confirmar',
};

export function evidenceStateLabel(value: DailyOrientationEvidenceState): string {
  return EVIDENCE_LABELS[value];
}

export function progressEffectLabel(value: DailyOrientationProgressEffect): string {
  return PROGRESS_LABELS[value];
}

export function dateTypeLabel(value: DailyOrientationDateType): string {
  return DATE_TYPE_LABELS[value];
}

export function lifeSignalLevelLabel(value: DailyOrientationLifeSignalLevel): string {
  return LIFE_LEVEL_LABELS[value];
}
