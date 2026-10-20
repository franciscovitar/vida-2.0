/**
 * Read-only presentation of source-owned next steps. No provider access, writes,
 * new progress calculation or inference from freeform conversations.
 */
import type { AssessmentProgressRead } from '@/types/assessment-progress';
import type { ProjectsIntelligenceData } from '@/types/projects-intelligence';

export type ContinuityState = 'ready' | 'stale' | 'degraded' | 'conflict' | 'unavailable';
export type ContinuitySource = 'projects-os' | 'university';

export interface ContinuityItem {
  id: string;
  title: string;
  source: ContinuitySource;
  nextAction: string | null;
  blocker: string | null;
  state: ContinuityState;
  asOf: string | null;
  /** A source timestamp is not proof that a task or milestone was completed. */
  sourceLabel: string;
}

export interface ContinuityView {
  projectSource: 'ready' | 'empty' | 'unavailable';
  academicSource: 'ready' | 'degraded' | 'empty' | 'unavailable';
  projects: ContinuityItem[];
  academic: ContinuityItem[];
}

const ACTIVE_TASK = new Set(['Pendiente', 'En progreso', 'Bloqueada']);
const DAY = 86_400_000;

function bounded(value: string | null | undefined, limit = 240): string | null {
  if (!value || !value.trim()) return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1).trimEnd()}…`;
}

function ageState(value: string | null, now: Date): 'recent' | 'stale' | 'unknown' {
  if (!value || !Number.isFinite(now.getTime())) return 'unknown';
  // Notion Último avance is an Argentine civil date, not a task update timestamp.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const timestamp = Date.parse(`${value}T12:00:00Z`);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value)
      return 'unknown';
    const localToday = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'America/Argentina/Cordoba',
    }).format(now);
    // A source claiming future progress cannot be certified as current.
    if (value > localToday) return 'unknown';
    return now.getTime() - timestamp > 7 * DAY ? 'stale' : 'recent';
  }
  // Academic snapshot times must have an explicit offset; local/unqualified
  // strings and future generatedAt values are not valid freshness evidence.
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) return 'unknown';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now.getTime() + 5 * 60_000) return 'unknown';
  return now.getTime() - timestamp > 7 * DAY ? 'stale' : 'recent';
}

export function buildSessionContinuityView(
  projects: ProjectsIntelligenceData | null,
  assessments: AssessmentProgressRead | null,
  now: Date = new Date(),
): ContinuityView {
  const projectSource =
    !projects || (projects.status !== 'ready' && projects.status !== 'empty')
      ? 'unavailable'
      : projects.status;
  const academicSource =
    !assessments || !['ready', 'degraded', 'empty'].includes(assessments.status)
      ? 'unavailable'
      : (assessments.status as 'ready' | 'degraded' | 'empty');

  const projectItems: ContinuityItem[] =
    projectSource !== 'ready' || !projects
      ? []
      : projects.projects
          .filter((project) => ['Activo', 'En espera', 'Bloqueado'].includes(project.status))
          .map((project) => {
            const relation = project.nextAction;
            const linkedTask = relation?.available
              ? project.relatedTasks.find((task) => task.id === relation.id)
              : null;
            const hasConflict =
              project.quality.multipleNextActionCandidates ||
              Boolean(
                linkedTask &&
                (linkedTask.project?.id !== project.id || !ACTIVE_TASK.has(linkedTask.status)),
              );
            const linkedValid =
              !hasConflict &&
              relation?.available &&
              linkedTask &&
              linkedTask.project?.id === project.id &&
              ACTIVE_TASK.has(linkedTask.status);
            const nextAction = linkedValid ? bounded(linkedTask.title) : null;
            const blocker =
              bounded(project.blocker) ??
              (linkedValid && linkedTask?.status === 'Bloqueada'
                ? 'La tarea está bloqueada.'
                : null);
            const age = ageState(project.lastAdvance, now);
            // A blocker by itself is not proof that an unresolved/missing task
            // relation contains a verified next action. Keep the blocker visible,
            // but do not claim a recorded next step.
            const state: ContinuityState = hasConflict
              ? 'conflict'
              : !nextAction
                ? 'unavailable'
                : age !== 'recent'
                  ? 'stale'
                  : 'ready';
            return {
              id: `project:${project.id}`,
              title: bounded(project.name, 180) ?? 'Proyecto sin título',
              source: 'projects-os' as const,
              nextAction,
              blocker,
              state,
              asOf: project.lastAdvance,
              sourceLabel: 'Notion · Proyectos / Tareas',
            };
          });

  const academicItems: ContinuityItem[] =
    academicSource === 'unavailable' || !assessments
      ? []
      : assessments.snapshots
          .filter((snapshot) => ['active', 'planned'].includes(snapshot.payload.status))
          .map((snapshot) => {
            const action = bounded(snapshot.payload.nextBestActivity);
            const age = ageState(snapshot.generatedAt, now);
            const state: ContinuityState = !action
              ? 'unavailable'
              : academicSource === 'degraded'
                ? 'degraded'
                : age !== 'recent'
                  ? 'stale'
                  : 'ready';
            return {
              id: `assessment:${snapshot.assessmentId}`,
              title:
                bounded(`${snapshot.subjectId.toUpperCase()} · ${snapshot.payload.name}`, 180) ??
                'Evaluación',
              source: 'university' as const,
              nextAction: action,
              blocker: null,
              state,
              asOf: snapshot.generatedAt,
              sourceLabel: 'Sheets · Assessment Progress',
            };
          });

  const priority: Record<ContinuityState, number> = {
    ready: 0,
    degraded: 1,
    stale: 2,
    conflict: 3,
    unavailable: 4,
  };
  const order = (a: ContinuityItem, b: ContinuityItem): number =>
    priority[a.state] - priority[b.state] || a.title.localeCompare(b.title, 'es');

  return {
    projectSource,
    academicSource,
    projects: projectItems.sort(order),
    academic: academicItems.sort(order),
  };
}
