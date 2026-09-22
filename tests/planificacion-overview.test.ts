import assert from 'node:assert/strict';
import test from 'node:test';

import {
  selectAttentionTasks,
  selectPlanningAssessments,
  selectPlanningProjects,
  selectWeekTasks,
} from '@/lib/planning/overview';
import type { AssessmentProgressSnapshot } from '@/types/assessment-progress';
import type { NotionProject, NotionTask } from '@/types/notion';
import type { ProjectsIntelligenceProject } from '@/types/projects-intelligence';

function task(input: Partial<NotionTask> & Pick<NotionTask, 'id' | 'title'>): NotionTask {
  return {
    id: input.id,
    title: input.title,
    status: input.status ?? 'Pendiente',
    date: input.date ?? null,
    dateKind: input.dateKind ?? 'none',
    priority: input.priority ?? null,
    duration: input.duration ?? null,
    energy: input.energy ?? null,
    project: input.project ?? null,
    area: null,
    projectArea: null,
    blocker: input.blocker ?? null,
    note: null,
    domain: 'tasks',
  };
}

test('Planificacion keeps En espera projects out of daily project focus', () => {
  const base = {
    type: null,
    area: null,
    expectedResult: null,
    definitionOfDone: null,
    nextAction: null,
    lastAdvance: null,
    blocker: null,
    dueDate: null,
    reviewDate: null,
    ownership: null,
    piRecommendation: null,
    piConfidence: null,
    piReviewedAt: null,
    piSummary: null,
    relatedTaskCount: 0,
    openTaskCount: 0,
    blockedTaskCount: 0,
    relatedTasks: [],
    milestones: [],
    progress: { measurable: false, reason: 'no-milestones' },
    quality: {
      missingDefinitionOfDone: false,
      missingNextAction: false,
      blocked: false,
      staleReview: false,
      stalePiSnapshot: false,
      invalidMilestones: false,
      progressMeasurable: false,
      multipleNextActionCandidates: false,
    },
  } satisfies Omit<ProjectsIntelligenceProject, 'id' | 'name' | 'status'>;

  const projects = [
    { ...base, id: 'wait', name: 'Finance OS', status: 'En espera' },
    { ...base, id: 'active', name: 'Cliente', status: 'Activo' },
    { ...base, id: 'blocked', name: 'Bloqueado', status: 'Bloqueado' },
  ] as ProjectsIntelligenceProject[];

  assert.deepEqual(
    selectPlanningProjects(projects).map((project) => project.id),
    ['blocked', 'active'],
  );
});

test('task pressure is explainable: blocked, overdue, today, in progress, priority', () => {
  const tasks = [
    task({ id: 'high', title: 'Alta', priority: 'Alta' }),
    task({ id: 'today', title: 'Hoy', date: '2026-09-17', dateKind: 'today' }),
    task({ id: 'blocked', title: 'Bloqueada', status: 'Bloqueada' }),
    task({ id: 'overdue', title: 'Vencida', date: '2026-09-16', dateKind: 'overdue' }),
    task({ id: 'progress', title: 'En curso', status: 'En progreso' }),
    task({ id: 'done', title: 'Hecha', status: 'Hecha' }),
  ];

  assert.deepEqual(
    selectAttentionTasks(tasks, []).map((item) => item.id),
    ['blocked', 'overdue', 'today', 'progress', 'high'],
  );
});

test('week task selector treats Fecha as relevant date and uses a seven-day window', () => {
  const tasks = [
    task({ id: 'd0', title: 'Hoy', date: '2026-09-17' }),
    task({ id: 'd6', title: 'Día seis', date: '2026-09-23' }),
    task({ id: 'd7', title: 'Día siete', date: '2026-09-24' }),
  ];
  assert.deepEqual(
    selectWeekTasks(tasks, [], '2026-09-17').map((item) => item.id),
    ['d0', 'd6'],
  );
});



test('completed/cancelled project tasks do not enter planning pressure or week focus', () => {
  const project = (id: string, status: NotionProject['status']): NotionProject => ({
    id,
    name: id,
    status,
    area: null,
    expectedResult: null,
    nextAction: null,
    dueDate: null,
    dateKind: 'none',
    reviewDate: null,
    blocker: null,
    relatedTaskCount: 0,
    domain: 'projects',
  });

  const projects = [
    project('done-project', 'Completado'),
    project('cancelled-project', 'Cancelado'),
    project('active-project', 'Activo'),
  ];
  const relation = (id: string) => ({ id, name: id, available: true });

  const tasks = [
    task({
      id: 'done-task',
      title: 'Sombra completada',
      priority: 'Alta',
      date: '2026-09-17',
      dateKind: 'today',
      project: relation('done-project'),
    }),
    task({
      id: 'cancelled-task',
      title: 'Sombra cancelada',
      priority: 'Alta',
      date: '2026-09-18',
      dateKind: 'future',
      project: relation('cancelled-project'),
    }),
    task({
      id: 'active-task',
      title: 'Activa',
      priority: 'Alta',
      date: '2026-09-19',
      dateKind: 'future',
      project: relation('active-project'),
    }),
    task({
      id: 'standalone-task',
      title: 'Directa',
      priority: 'Alta',
      date: '2026-09-20',
      dateKind: 'future',
    }),
  ];

  assert.deepEqual(
    selectAttentionTasks(tasks, projects).map((item) => item.id),
    ['active-task', 'standalone-task'],
  );
  assert.deepEqual(
    selectWeekTasks(tasks, projects, '2026-09-17').map((item) => item.id),
    ['active-task', 'standalone-task'],
  );
});

test('academic assessments stay separate and sort by verified date', () => {
  const basePayload = {
    type: 'parcial',
    status: 'active' as const,
    progressPercent: null,
    progressConfidence: 'low' as const,
    readinessBand: 'unknown' as const,
    remainingMinutesLow: null,
    remainingMinutesHigh: null,
    etaConfidence: 'low' as const,
    criticalGaps: [],
    nextBestActivity: null,
    scopeComplete: false,
    evidenceCount: 0,
  };
  const rows: AssessmentProgressSnapshot[] = [
    {
      snapshotId: '2',
      assessmentId: 'b',
      subjectId: 'DSI',
      assessmentDate: '2026-09-26',
      generatedAt: '2026-09-17T00:00:00Z',
      payload: { ...basePayload, name: 'DSI P2' },
    },
    {
      snapshotId: '1',
      assessmentId: 'a',
      subjectId: 'Redes',
      assessmentDate: '2026-09-20',
      generatedAt: '2026-09-17T00:00:00Z',
      payload: { ...basePayload, name: 'Redes P2' },
    },
  ];
  assert.deepEqual(
    selectPlanningAssessments(rows).map((item) => item.assessmentId),
    ['a', 'b'],
  );
});
