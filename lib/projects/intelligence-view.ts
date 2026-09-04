/**
 * Modelo de vista puro para el panel Projects Intelligence (`/proyectos`, V1).
 *
 * Traduce el DTO de lectura (`ProjectsIntelligenceData`) a una forma lista
 * para renderizar: agrupaciones deterministas, etiquetas de progreso/hitos y
 * el snapshot PI ya persistido. No recalcula progreso, no resuelve
 * relaciones y no genera recomendaciones: todo el valor viene de
 * `lib/notion/projects-intelligence*.ts`. Esta capa solo decide cómo
 * mostrarlo.
 */
import { formatShortDay } from '@/lib/adapters/dates';
import type { NotionRelation } from '@/types/notion';
import type {
  ProjectIntelligenceSourceStatus,
  ProjectProgress,
  ProjectsIntelligenceData,
  ProjectsIntelligenceMilestone,
  ProjectsIntelligenceMilestoneStatus,
  ProjectsIntelligencePiRecommendation,
  ProjectsIntelligenceProject,
  ProjectsIntelligenceProjectQuality,
  ProjectsIntelligenceProjectStatus,
  ProjectsIntelligenceProjectType,
  ProjectsIntelligenceQualitySummary,
  ProjectsIntelligenceSourceMode,
  ProjectsIntelligenceSummary,
} from '@/types/projects-intelligence';

/** Copys canónicos centralizados: la UI los importa en vez de reescribirlos. */
export const PROGRESS_VERIFIED_LABEL = 'Progreso verificado por hitos';
export const PROGRESS_UNMEASURABLE_LABEL = 'Progreso todavía no medible';
export const MILESTONE_WEIGHT_NOTE = 'Solo los hitos en Hecho aportan al porcentaje.';
export const NEXT_ACTION_MISSING_LABEL = 'Sin próxima acción definida';
export const NEXT_ACTION_UNRESOLVED_LABEL = 'Próxima acción no disponible';
export const MULTIPLE_NEXT_ACTION_WARNING = 'Hay más de una candidata en Próxima acción.';
export const PI_NO_SNAPSHOT_LABEL = 'Sin snapshot PI todavía.';
export const PI_STALE_LABEL = 'Snapshot pendiente de revisión';
export const FAIL_CLOSED_REASSURANCE =
  'Projects Intelligence no está disponible. No se muestran proyectos simulados.';
export const QUALITY_ALL_CLEAR_MESSAGE = 'Sin problemas de calidad detectados en el portfolio.';
export const MILESTONE_UNKNOWN_STATUS_LABEL = 'Estado no reconocido';

export const PROGRESS_REASON_LABELS: Readonly<
  Record<Extract<ProjectProgress, { measurable: false }>['reason'], string>
> = {
  'no-milestones': 'Sin hitos definidos',
  'missing-weight': 'Hay hitos sin peso',
  'invalid-weight': 'Hay pesos inválidos',
  'invalid-total': 'Los pesos no suman 100',
  'invalid-status': 'Hay estados de hito inválidos',
};

export interface ProgressView {
  measurable: boolean;
  percent: number | null;
  percentLabel: string | null;
  completedWeight: number | null;
  totalWeight: number | null;
  reasonLabel: string | null;
}

function formatPercent(percent: number): string {
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

export function buildProgressView(progress: ProjectProgress): ProgressView {
  if (progress.measurable) {
    return {
      measurable: true,
      percent: progress.percent,
      percentLabel: formatPercent(progress.percent),
      completedWeight: progress.completedWeight,
      totalWeight: progress.totalWeight,
      reasonLabel: null,
    };
  }
  return {
    measurable: false,
    percent: null,
    percentLabel: null,
    completedWeight: null,
    totalWeight: null,
    reasonLabel: PROGRESS_REASON_LABELS[progress.reason],
  };
}

export type NextActionKind = 'resolved' | 'unresolved' | 'missing';

export interface NextActionView {
  kind: NextActionKind;
  label: string;
}

export function buildNextActionView(nextAction: NotionRelation | null): NextActionView {
  if (nextAction === null) {
    return { kind: 'missing', label: NEXT_ACTION_MISSING_LABEL };
  }
  if (!nextAction.available) {
    return { kind: 'unresolved', label: NEXT_ACTION_UNRESOLVED_LABEL };
  }
  return { kind: 'resolved', label: nextAction.name ?? NEXT_ACTION_UNRESOLVED_LABEL };
}

export interface MilestoneView {
  id: string;
  name: string;
  status: ProjectsIntelligenceMilestoneStatus | null;
  statusLabel: string;
  completed: boolean;
  weight: number | null;
  completionCriteria: string | null;
  evidence: string | null;
  completedAtLabel: string | null;
}

/** Orden ascendente por `order` solo si todos los hitos lo tienen; si no, orden de origen. */
export function buildMilestoneViews(
  milestones: readonly ProjectsIntelligenceMilestone[],
): MilestoneView[] {
  const hasFullOrder = milestones.every((milestone) => milestone.order !== null);
  const ordered = hasFullOrder
    ? [...milestones].sort((a, b) => (a.order as number) - (b.order as number))
    : milestones;

  return ordered.map((milestone) => ({
    id: milestone.id,
    name: milestone.name,
    status: milestone.status,
    statusLabel: milestone.status ?? MILESTONE_UNKNOWN_STATUS_LABEL,
    completed: milestone.status === 'Hecho',
    weight: milestone.weight,
    completionCriteria: milestone.completionCriteria,
    evidence: milestone.evidence,
    completedAtLabel: milestone.completedAt ? formatShortDay(milestone.completedAt) : null,
  }));
}

export interface PiSnapshotView {
  hasSnapshot: boolean;
  recommendation: ProjectsIntelligencePiRecommendation | null;
  confidence: number | null;
  reviewedAtLabel: string | null;
  summary: string | null;
  stale: boolean;
}

export function buildPiSnapshotView(
  project: Pick<
    ProjectsIntelligenceProject,
    'piRecommendation' | 'piConfidence' | 'piReviewedAt' | 'piSummary'
  >,
  stale: boolean,
): PiSnapshotView {
  const hasSnapshot =
    project.piRecommendation !== null ||
    project.piSummary !== null ||
    project.piConfidence !== null ||
    project.piReviewedAt !== null;

  return {
    hasSnapshot,
    recommendation: project.piRecommendation,
    confidence: project.piConfidence,
    reviewedAtLabel: project.piReviewedAt ? formatShortDay(project.piReviewedAt) : null,
    summary: project.piSummary,
    stale,
  };
}

export interface ProjectCardView {
  id: string;
  name: string;
  status: ProjectsIntelligenceProjectStatus;
  type: ProjectsIntelligenceProjectType | null;
  definitionOfDone: string | null;
  progress: ProgressView;
  nextAction: NextActionView;
  blocker: string | null;
  lastAdvanceLabel: string | null;
  dueDateLabel: string | null;
  reviewDateLabel: string | null;
  milestones: MilestoneView[];
  pi: PiSnapshotView;
  quality: ProjectsIntelligenceProjectQuality;
}

export function buildProjectCardView(project: ProjectsIntelligenceProject): ProjectCardView {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    type: project.type,
    definitionOfDone: project.definitionOfDone,
    progress: buildProgressView(project.progress),
    nextAction: buildNextActionView(project.nextAction),
    blocker: project.blocker,
    lastAdvanceLabel: project.lastAdvance ? formatShortDay(project.lastAdvance) : null,
    dueDateLabel: project.dueDate ? formatShortDay(project.dueDate) : null,
    reviewDateLabel: project.reviewDate ? formatShortDay(project.reviewDate) : null,
    milestones: buildMilestoneViews(project.milestones),
    pi: buildPiSnapshotView(project, project.quality.stalePiSnapshot),
    quality: project.quality,
  };
}

export interface QualityRow {
  key: keyof Omit<ProjectsIntelligenceQualitySummary, 'blocked'>;
  label: string;
  count: number;
}

const QUALITY_ROW_DEFS: ReadonlyArray<{ key: QualityRow['key']; label: string }> = [
  { key: 'missingDefinitionOfDone', label: 'Sin Definition of Done' },
  { key: 'missingNextAction', label: 'Sin próxima acción' },
  { key: 'staleReview', label: 'Revisiones vencidas' },
  { key: 'stalePiSnapshot', label: 'Snapshot PI pendiente de revisión' },
  { key: 'invalidMilestones', label: 'Hitos inválidos' },
  { key: 'multipleNextActionCandidates', label: 'Múltiples candidatas a próxima acción' },
];

/** El conteo de `blocked` ya se ve en la sección Bloqueados; no se repite acá. */
export function buildQualityRows(quality: ProjectsIntelligenceQualitySummary): QualityRow[] {
  return QUALITY_ROW_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    count: quality[def.key],
  }));
}

export interface ProjectsIntelligenceView {
  status: ProjectIntelligenceSourceStatus;
  source: ProjectsIntelligenceSourceMode;
  /** `true` cuando la fuente respondió de forma utilizable, incluso si el portfolio está vacío. */
  ready: boolean;
  isEmpty: boolean;
  unavailableMessage: string | null;
  syncedAt: string;
  targetDate: string;
  summary: ProjectsIntelligenceSummary;
  qualityRows: QualityRow[];
  qualityAllClear: boolean;
  focus: ProjectCardView[];
  waiting: ProjectCardView[];
  blocked: ProjectCardView[];
  avoidForNow: ProjectCardView[];
  history: ProjectCardView[];
}

export function buildProjectsIntelligenceView(
  data: ProjectsIntelligenceData,
): ProjectsIntelligenceView {
  // `empty` es un estado canónico válido de la fuente, no un fallo de integración.
  // Debe atravesar el guard de disponibilidad para que la UI renderice su estado vacío intencional.
  const ready = data.status === 'ready' || data.status === 'empty';
  const cards = data.status === 'ready' ? data.projects.map(buildProjectCardView) : [];
  const qualityRows = buildQualityRows(data.quality);

  return {
    status: data.status,
    source: data.source,
    ready,
    isEmpty: data.status === 'empty',
    unavailableMessage: ready ? null : data.notice,
    syncedAt: data.syncedAt,
    targetDate: data.targetDate,
    summary: data.summary,
    qualityRows,
    qualityAllClear: qualityRows.every((row) => row.count === 0),
    focus: cards.filter((card) => card.status === 'Activo'),
    waiting: cards.filter((card) => card.status === 'En espera'),
    blocked: cards.filter((card) => card.status === 'Bloqueado'),
    avoidForNow: cards.filter(
      (card) =>
        card.pi.recommendation === 'Esperar' || card.pi.recommendation === 'Cancelar propuesto',
    ),
    history: cards.filter((card) => card.status === 'Completado' || card.status === 'Cancelado'),
  };
}
