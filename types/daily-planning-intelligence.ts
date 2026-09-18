import type {
  CalendarEvent,
  CalendarIntegrationStatus,
  CalendarDataSourceMode,
} from '@/types/calendar';
import type { NotionRelation, NotionTask } from '@/types/notion';
import type {
  ProjectIntelligenceSourceStatus,
  ProjectProgress,
  ProjectsIntelligenceProjectStatus,
  ProjectsIntelligenceProjectType,
} from '@/types/projects-intelligence';
import type {
  AssessmentProgressReadStatus,
  AssessmentProgressSnapshot,
} from '@/types/assessment-progress';

export type DailyPlanningStatus = 'ready' | 'degraded' | 'empty' | 'unavailable';

export type DailyPlanningNotionSourceStatus = ProjectIntelligenceSourceStatus;
export type DailyPlanningCalendarSourceStatus = Exclude<CalendarIntegrationStatus, 'mock'>;
export type DailyPlanningHealthSourceStatus = 'ready' | 'limited' | 'unavailable';
export type DailyPlanningHealthState = 'NORMAL' | 'CUIDADO' | 'RECUPERACIÓN' | 'INSUFICIENTE';
export type DailyPlanningHealthConfidence = 'ALTA' | 'MEDIA' | 'BAJA';

export interface DailyPlanningHealthContext {
  /** Estado derivado; nunca incluye biometría cruda ni evidencia detallada. */
  state: DailyPlanningHealthState;
  confidence: DailyPlanningHealthConfidence;
  headline: string;
  /**
   * false cuando Salud no tiene evidencia suficiente para informar capacidad.
   * Incluso true es contexto: no decide prioridades ni agenda por sí solo.
   */
  canInformCapacity: boolean;
}

export interface DailyPlanningSourceState<Status extends string> {
  status: Status;
  /** true cuando la lectura fue válida aunque el conjunto esté vacío. */
  available: boolean;
  notice: string | null;
}

export type DailyPlanningTaskDateSemantics = 'none' | 'relevant-date-unspecified';

export interface DailyPlanningTask extends NotionTask {
  /**
   * `Fecha` no distingue deadline vs día planeado en el schema actual.
   * Nunca se eleva a deadline duro por el nombre del campo.
   */
  dateSemantics: DailyPlanningTaskDateSemantics;
  relationUnavailable: boolean;
}

export interface DailyPlanningProject {
  id: string;
  name: string;
  status: ProjectsIntelligenceProjectStatus;
  type: ProjectsIntelligenceProjectType | null;
  nextAction: NotionRelation | null;
  lastAdvance: string | null;
  blocker: string | null;
  dueDate: string | null;
  reviewDate: string | null;
  /** null = Hitos no estuvo disponible; no significa 0%. */
  progress: ProjectProgress | null;
  milestoneCount: number | null;
}

export type DailyPlanningCalendarRole = 'capacity-block' | 'date-marker' | 'informational';

export type DailyPlanningCalendarProvenance =
  'user-confirmed' | 'official-source' | 'schedule-derived' | 'probable' | 'unknown';

export interface DailyPlanningCalendarEvidence {
  provenance: DailyPlanningCalendarProvenance;
  /** Fecha mencionada explícitamente en la descripción, si existe y puede normalizarse. */
  describedDate: string | null;
  /** true cuando describedDate contradice la fecha del evento. */
  dateConflict: boolean;
}

export interface DailyPlanningCalendarEvent extends CalendarEvent {
  /**
   * Un all-day nunca se transforma en 24 h ocupadas por este reader.
   * Los timed+opaque son bloques de capacidad; los all-day son marcadores de fecha.
   */
  planningRole: DailyPlanningCalendarRole;
  evidence: DailyPlanningCalendarEvidence;
}

export interface DailyPlanningQuality {
  tasksWithAmbiguousDate: number;
  tasksMissingDuration: number;
  tasksMissingPriority: number;
  blockedTasksWithoutDetail: number;
  unresolvedTaskRelations: number;
  projectsWithoutProgressSource: number;
  calendarDateConflicts: number;
  assessmentsWithoutDate?: number;
  assessmentsWithoutMeasuredProgress?: number;
}

export interface DailyPlanningSources {
  tasks: DailyPlanningSourceState<DailyPlanningNotionSourceStatus>;
  projects: DailyPlanningSourceState<DailyPlanningNotionSourceStatus>;
  milestones: DailyPlanningSourceState<DailyPlanningNotionSourceStatus>;
  calendar: DailyPlanningSourceState<DailyPlanningCalendarSourceStatus> & {
    mode: CalendarDataSourceMode;
  };
  assessments?: DailyPlanningSourceState<AssessmentProgressReadStatus>;
  /** Fuente no bloqueante: Planificación sigue operativa si Salud falla. */
  health?: DailyPlanningSourceState<DailyPlanningHealthSourceStatus>;
}

/**
 * Contexto factual read-only. No contiene ranking Must/Should/Could ni horarios
 * generados: ese razonamiento pertenece a la capa de intelligence posterior.
 */
export interface DailyPlanningContext {
  status: DailyPlanningStatus;
  targetDate: string;
  horizonEnd: string;
  syncedAt: string;
  timezone: string;
  sources: DailyPlanningSources;
  /** Solo tareas abiertas/operativas; `Hecha` queda fuera del contexto diario. */
  tasks: readonly DailyPlanningTask[];
  projects: readonly DailyPlanningProject[];
  calendarEvents: readonly DailyPlanningCalendarEvent[];
  /** Evaluaciones activas/planificadas; resumen acotado, no evidencia cruda. */
  assessments?: readonly AssessmentProgressSnapshot[];
  /**
   * Contexto sanitario mínimo y derivado. No contiene métricas crudas y no posee
   * prioridad de proyecto ni autoridad para reordenar la agenda.
   */
  health?: DailyPlanningHealthContext | null;
  quality: DailyPlanningQuality;
}
