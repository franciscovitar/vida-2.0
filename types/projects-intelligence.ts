/**
 * Contratos planos de Projects Intelligence (lectura, V1).
 * Solo tipos JSON-serializables; sin cliente ni secretos.
 *
 * Separado deliberadamente de `types/notion.ts`: es un DTO nuevo y acotado,
 * no una extensión del dashboard genérico de Hoy/Tareas/Proyectos.
 */
import type { NotionProjectStatus, NotionRelation, NotionTask } from '@/types/notion';

export type ProjectsIntelligenceSourceMode = 'mock' | 'notion';

/**
 * Estado de la fuente Projects Intelligence. A diferencia de
 * `NotionIntegrationStatus`, no existe un valor `'mock'`: el modo mock se
 * expresa únicamente vía `source`, nunca disfrazado de estado real.
 */
export type ProjectIntelligenceSourceStatus =
  | 'ready'
  | 'not-configured'
  | 'auth-error'
  | 'permission-error'
  | 'missing-data-source'
  | 'missing-property'
  | 'rate-limited'
  | 'network-error'
  | 'empty'
  | 'read-error';

export type ProjectsIntelligenceProjectStatus = NotionProjectStatus;

/** Enum cerrado verificado contra el schema canónico de `Hitos de proyecto`. */
export type ProjectsIntelligenceMilestoneStatus =
  'Pendiente' | 'En progreso' | 'Hecho' | 'Descartado';

/** Enum cerrado verificado contra el schema canónico de `Tipo` en Proyectos. */
export type ProjectsIntelligenceProjectType =
  'Problema propio' | 'Idea' | 'Oportunidad' | 'Obligatorio' | 'Experimento' | 'Mejora de sistema';

/** Enum cerrado verificado contra el schema canónico de `PI Recomendación`. */
export type ProjectsIntelligencePiRecommendation =
  'Hacer ahora' | 'Mantener activo' | 'Investigar' | 'Esperar' | 'Cancelar propuesto';

export interface ProjectsIntelligenceMilestone {
  id: string;
  name: string;
  /** Id de la página de Proyecto relacionada; `null` si la relación falta. */
  projectId: string | null;
  /** `null` = `Estado` ausente o valor no reconocido (nunca se asume un estado incompleto conocido). */
  status: ProjectsIntelligenceMilestoneStatus | null;
  /** Peso declarado. `null` = propiedad ausente (no se coacciona a cero). */
  weight: number | null;
  completionCriteria: string | null;
  evidence: string | null;
  order: number | null;
  completedAt: string | null;
  ownership: string | null;
}

/**
 * Progreso determinístico por hitos. Discriminado explícitamente: nunca usa
 * `null`/`0` de forma ambigua para "no medible".
 */
export type ProjectProgress =
  | {
      measurable: true;
      percent: number;
      completedWeight: number;
      totalWeight: number;
    }
  | {
      measurable: false;
      reason:
        'no-milestones' | 'missing-weight' | 'invalid-weight' | 'invalid-total' | 'invalid-status';
    };

/**
 * Señales de calidad de datos transparentes por proyecto. Deliberadamente no
 * hay un score único ("Project Health 83"): cada señal es explícita y
 * verificable de forma independiente.
 */
export interface ProjectsIntelligenceProjectQuality {
  missingDefinitionOfDone: boolean;
  /** `Próxima acción` sin relación presente, o presente pero sin Tarea resoluble. */
  missingNextAction: boolean;
  /** Estado `Bloqueado` o texto de bloqueo presente. */
  blocked: boolean;
  /** Fecha de revisión pasada (heurística de frescura, no verdad canónica). */
  staleReview: boolean;
  /** Snapshot PI no revisado en `PI_SNAPSHOT_STALE_AFTER_DAYS` días (heurística). */
  stalePiSnapshot: boolean;
  /** Progreso no medible por datos de hitos malformados (peso inválido, estado inválido o total != 100). */
  invalidMilestones: boolean;
  progressMeasurable: boolean;
  /** `Próxima acción` tenía más de una relación candidata; solo se conservó la primera. */
  multipleNextActionCandidates: boolean;
}

export interface ProjectsIntelligenceProject {
  id: string;
  name: string;
  status: ProjectsIntelligenceProjectStatus;
  type: ProjectsIntelligenceProjectType | null;
  /**
   * Relación de Área. Este lector no consulta Áreas: `name` permanece `null`
   * y `available` en `false` aun cuando exista relación. No se fabrica un
   * nombre de área sin resolución canónica.
   */
  area: NotionRelation | null;
  expectedResult: string | null;
  definitionOfDone: string | null;
  /**
   * `Próxima acción` es una relación canónica a Tareas, no texto libre. Se
   * resuelve contra las Tareas ya cargadas en esta misma lectura; nunca se
   * fabrica un nombre. Si hay más de una relación candidata se conserva solo
   * la primera (ver `quality.multipleNextActionCandidates`).
   */
  nextAction: NotionRelation | null;
  /** Propiedad `Último avance` (DATE). */
  lastAdvance: string | null;
  blocker: string | null;
  dueDate: string | null;
  reviewDate: string | null;
  ownership: string | null;
  /** Snapshot canónico ya persistido en Notion (SELECT). Nunca generado en TypeScript. */
  piRecommendation: ProjectsIntelligencePiRecommendation | null;
  /** Snapshot canónico ya persistido en Notion (NUMBER). Nunca generado en TypeScript. */
  piConfidence: number | null;
  piReviewedAt: string | null;
  /** Snapshot canónico ya persistido en Notion. Nunca generado en TypeScript. */
  piSummary: string | null;
  relatedTaskCount: number;
  openTaskCount: number;
  blockedTaskCount: number;
  /** Tareas relacionadas completas (sin ranking subjetivo aplicado en V1). */
  relatedTasks: readonly NotionTask[];
  milestones: readonly ProjectsIntelligenceMilestone[];
  progress: ProjectProgress;
  quality: ProjectsIntelligenceProjectQuality;
}

export interface ProjectsIntelligenceSummary {
  total: number;
  active: number;
  waiting: number;
  blocked: number;
  completed: number;
  cancelled: number;
  progressMeasurable: number;
  progressUnmeasurable: number;
  withoutNextAction: number;
  withoutDefinitionOfDone: number;
}

/** Recuento agregado de señales de calidad de datos sobre el portafolio. */
export interface ProjectsIntelligenceQualitySummary {
  missingDefinitionOfDone: number;
  missingNextAction: number;
  blocked: number;
  staleReview: number;
  stalePiSnapshot: number;
  invalidMilestones: number;
  multipleNextActionCandidates: number;
}

export interface ProjectsIntelligenceData {
  source: ProjectsIntelligenceSourceMode;
  status: ProjectIntelligenceSourceStatus;
  notice: string | null;
  syncedAt: string;
  targetDate: string;
  projects: readonly ProjectsIntelligenceProject[];
  summary: ProjectsIntelligenceSummary;
  quality: ProjectsIntelligenceQualitySummary;
}
