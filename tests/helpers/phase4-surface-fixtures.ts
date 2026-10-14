import type { ComponentProps } from 'react';
import type { PlanningWorkspaceV2 } from '@/components/planning/PlanningWorkspaceV2';
import type { AssessmentProgressSnapshot } from '@/types/assessment-progress';
import type { StudyCatalogRead, StudyCatalogSubject } from '@/types/study-catalog';

export const EVIDENCE_STATES = ['complete', 'partial', 'absent', 'stale', 'error'] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];
type WeekProps = ComponentProps<typeof PlanningWorkspaceV2>;

// Entirely synthetic DTOs. No source credentials, provider IDs or live readers.
export function surfaceFixture(state: EvidenceState) {
  const failed = state === 'error';
  const absent = state === 'absent';
  const partial = state === 'partial';
  const stale = state === 'stale';
  const date = '2026-10-14';
  const generatedAt = stale ? '2026-09-01T12:00:00Z' : `${date}T12:00:00Z`;
  const assessment: AssessmentProgressSnapshot = {
    snapshotId: 'qa-synthetic-snapshot',
    assessmentId: 'qa-synthetic-p1',
    subjectId: 'qa-synthetic-subject',
    assessmentDate: '2026-10-16',
    generatedAt,
    payload: {
      name: 'Evaluación sintética',
      type: 'parcial',
      status: 'active',
      progressPercent: partial ? null : 65,
      progressConfidence: 'medium',
      readinessBand: partial ? 'unknown' : 'developing',
      remainingMinutesLow: null,
      remainingMinutesHigh: null,
      etaConfidence: 'low',
      criticalGaps: [],
      nextBestActivity: 'Practicar recuperación sintética',
      scopeComplete: !partial,
      evidenceCount: 2,
    },
  };
  const subject: StudyCatalogSubject = {
    id: assessment.subjectId,
    name: 'Materia sintética',
    term: null,
    currentUnit: null,
    assessment: {
      id: assessment.assessmentId,
      status: 'active',
      date: assessment.assessmentDate,
      format: 'oral',
      scopeComplete: !partial,
    },
    structureStatus: partial ? 'partial' : 'resolved',
    sourceScopeStatus: null,
    conceptCount: 2,
    topics: [],
    readinessBand: 'developing',
    updated: date,
    studyRuntimeAvailable: false,
  };
  const catalog: StudyCatalogRead = {
    state: failed ? 'unavailable' : partial ? 'degraded' : 'ready',
    subjects: absent || failed ? [] : [subject],
    notice: partial ? 'Catálogo parcial sintético.' : null,
    sourceCommit: null,
  };
  const projects: WeekProps['projects'] = {
    source: 'notion',
    status: failed ? 'read-error' : absent ? 'empty' : 'ready',
    notice: null,
    syncedAt: generatedAt,
    targetDate: date,
    projects:
      absent || failed
        ? []
        : [
            {
              id: 'qa-synthetic-project',
              name: 'Proyecto sintético',
              status: 'Activo',
              type: 'Experimento',
              area: null,
              expectedResult: 'Resultado sintético',
              definitionOfDone: 'Evidencia sintética',
              nextAction: partial
                ? null
                : { id: 'qa-synthetic-task', name: 'Acción sintética', available: true },
              lastAdvance: null,
              blocker: null,
              dueDate: null,
              reviewDate: stale ? '2026-09-02' : null,
              ownership: null,
              piRecommendation: stale ? 'Mantener activo' : null,
              piConfidence: stale ? 0.5 : null,
              piReviewedAt: stale ? generatedAt : null,
              piSummary: null,
              relatedTaskCount: 0,
              openTaskCount: 0,
              blockedTaskCount: 0,
              relatedTasks: [],
              milestones: partial
                ? []
                : [
                    {
                      id: 'qa-synthetic-milestone',
                      name: 'Hito sintético',
                      projectId: 'qa-synthetic-project',
                      status: 'En progreso',
                      weight: 100,
                      completionCriteria: 'Prueba sintética',
                      evidence: null,
                      order: 1,
                      completedAt: null,
                      ownership: null,
                    },
                  ],
              progress: partial
                ? { measurable: false, reason: 'no-milestones' }
                : { measurable: true, percent: 0, completedWeight: 0, totalWeight: 100 },
              quality: {
                missingDefinitionOfDone: false,
                missingNextAction: partial,
                blocked: false,
                staleReview: stale,
                stalePiSnapshot: stale,
                invalidMilestones: false,
                progressMeasurable: !partial,
                multipleNextActionCandidates: false,
              },
            },
          ],
    summary: {
      total: absent || failed ? 0 : 1,
      active: absent || failed ? 0 : 1,
      waiting: 0,
      blocked: 0,
      completed: 0,
      cancelled: 0,
      progressMeasurable: partial ? 0 : 1,
      progressUnmeasurable: partial ? 1 : 0,
      withoutNextAction: partial ? 1 : 0,
      withoutDefinitionOfDone: 0,
    },
    quality: {
      missingDefinitionOfDone: 0,
      missingNextAction: partial ? 1 : 0,
      blocked: 0,
      staleReview: stale ? 1 : 0,
      stalePiSnapshot: stale ? 1 : 0,
      invalidMilestones: 0,
      multipleNextActionCandidates: 0,
    },
  };
  const orientation: WeekProps['orientation'] = {
    status: failed ? 'unavailable' : absent ? 'unavailable' : 'ready',
    readStatus: failed ? 'unavailable' : absent ? 'empty' : 'ready',
    notice: null,
    targetDate: date,
    generatedAt: absent || failed ? null : generatedAt,
    review: null,
    attention: [],
    upcoming: [],
    lifeSignals: [],
    minimum: [],
    notNow: [],
    quality: { unresolvedRefs: partial ? 1 : 0, dateConflicts: 0, invalidRows: 0 },
  };
  const assessments: WeekProps['assessments'] = {
    status: failed ? 'unavailable' : absent ? 'empty' : partial ? 'degraded' : 'ready',
    snapshots: absent || failed ? [] : [assessment],
    notice: partial ? 'Lectura académica parcial sintética: faltan filas.' : null,
    invalidRows: partial ? 1 : 0,
  };
  const week: WeekProps = {
    view: 'semana',
    orientation,
    assessments,
    studyCatalog: catalog,
    projects,
    taskCatalog: { tasks: [], areas: [], projects: [] },
    writable: false,
    dateSemanticsV2: false,
    dailyPlan: {
      status: 'unavailable',
      notice: null,
      targetDate: date,
      planGeneratedAt: null,
      contextSyncedAt: generatedAt,
      timezone: 'UTC',
      fixedCommitments: [],
      dateMarkers: [],
      must: [],
      should: [],
      could: [],
      notToday: [],
      suggestedBlocks: [],
      minimumViable: [],
      blockedTasks: [],
      health: null,
      pendingCount: 0,
      sources: [],
      quality: {
        unresolvedPlanRefs: 0,
        ambiguousTaskDates: 0,
        missingTaskDurations: 0,
        missingTaskPriorities: 0,
        calendarDateConflicts: 0,
      },
    },
    notion: {
      source: 'notion',
      status: failed ? 'read-error' : 'empty',
      notice: null,
      syncedAt: generatedAt,
      targetDate: date,
      tasks: [],
      projects: [],
      areas: [],
      taskSummary: {
        pending: 0,
        inProgress: 0,
        blocked: 0,
        done: 0,
        someday: 0,
        overdue: 0,
        dueToday: 0,
        total: 0,
      },
      projectSummary: {
        active: 0,
        waiting: 0,
        blocked: 0,
        completed: 0,
        cancelled: 0,
        overdue: 0,
        withoutNextAction: 0,
        total: 0,
      },
    },
  };
  if (state === 'complete') {
    week.orientation.upcoming = Array.from({ length: 5 }, (_, index) => ({
      kind: 'task',
      title: `Compromiso sintético ${index + 1}`,
      date: '2026-10-16',
      dateType: 'review',
      reason: 'Revisión sintética; no es un vencimiento.',
    }));
    week.notion.status = 'ready';
    week.notion.tasks = Array.from({ length: 5 }, (_, index) => ({
      id: `qa-synthetic-task-${index}`,
      title: `Tarea sintética ${index + 1}`,
      status: 'Pendiente',
      date: '2026-10-16',
      dateKind: 'future',
      dateType:
        index === 0 ? 'Deadline' : index === 1 ? 'Objetivo' : index === 2 ? 'Revisión' : null,
      priority: null,
      duration: null,
      energy: null,
      project: null,
      area: null,
      projectArea: null,
      blocker: null,
      note: null,
      domain: 'tasks',
    }));
    week.notion.taskSummary.pending = 5;
    week.notion.taskSummary.total = 5;
  }
  return {
    week,
    learning: { catalog, assessmentProgress: assessments },
    projects: { data: projects },
  };
}
