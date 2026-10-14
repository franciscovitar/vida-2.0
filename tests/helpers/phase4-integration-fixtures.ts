import { buildMockToday } from '@/lib/adapters/mock';
import { emptyCalendarTodayPreview } from '@/lib/calendar/summaries';
import type { HabitsV2View } from '@/lib/habits/v2-contract';
import { buildHoyNotionView } from '@/lib/notion/hoy';
import { summarizeProjects, summarizeTasks } from '@/lib/notion/summaries';
import { surfaceFixture, type EvidenceState } from './phase4-surface-fixtures';

export function integrationFixture(state: EvidenceState, date = '2026-10-14') {
  const fixture = surfaceFixture(state);
  fixture.week.notion.projects = fixture.week.projects.projects.map((project) => ({
    id: project.id,
    name: project.name,
    status: project.status,
    area: project.area,
    expectedResult: project.expectedResult,
    nextAction: project.nextAction?.name ?? null,
    dueDate: project.dueDate,
    dateKind: 'none',
    reviewDate: project.reviewDate,
    blocker: project.blocker,
    relatedTaskCount: project.relatedTaskCount,
    domain: 'projects',
  }));
  fixture.week.notion.projectSummary = summarizeProjects(fixture.week.notion.projects);
  if (fixture.week.notion.projects.length > 0) fixture.week.notion.status = 'ready';
  if (state === 'complete') {
    fixture.week.orientation.review = {
      date: '2026-10-13',
      headline: 'Revisión sintética sin cambio importante',
      items: [
        {
          domain: 'projects',
          activity: 'Revisar el hito sintético',
          evidenceState: 'VERIFIED',
          progressEffect: 'none',
          summary: 'El hito sintético sigue abierto; no se declara avance nuevo.',
        },
      ],
      uncertainties: [],
    };
  }
  fixture.week.dateSemanticsV2 = true; // Explicit fixture prop; runtime flags stay OFF.
  fixture.week.notion.taskSummary = summarizeTasks(fixture.week.notion.tasks, true);
  fixture.week.taskCatalog.tasks = fixture.week.notion.tasks.map((task) => ({
    key: task.id,
    title: task.title,
    status: task.status,
    date: task.date,
    dateType: task.dateType,
    priority: task.priority,
    duration: task.duration,
    energy: task.energy,
    areaKey: null,
    projectKey: null,
    areaName: null,
    projectName: null,
    blocker: null,
    note: null,
  }));
  const today = buildMockToday();
  today.targetDate = '2026-10-14';
  today.healthDate = today.targetDate;
  today.writable = false;
  today.calendar = emptyCalendarTodayPreview({
    source: 'google',
    status: state === 'error' || state === 'partial' ? 'network-error' : 'ready',
    notice: state === 'error' || state === 'partial' ? 'Calendar sintético no verificable.' : null,
  });
  today.notion = buildHoyNotionView(fixture.week.notion, today.calendar, true);
  const habits: HabitsV2View = {
    status: state === 'error' ? 'error' : state === 'absent' ? 'empty' : 'ready',
    notice:
      state === 'error'
        ? 'No se pudo leer la fuente sintética de hábitos.'
        : state === 'partial' || state === 'stale'
          ? 'Evidencia sintética de Gimnasio no verificable; sin confirmar.'
          : null,
    targetDate: date,
    today: today.targetDate,
    writable: false,
    items:
      state === 'absent' || state === 'error'
        ? []
        : [
            {
              habitId: 'qa-manual',
              name: 'Hábito manual sintético',
              icon: null,
              mode: 'manual',
              cadence: 'daily',
              target: 1,
              unit: 'vez',
              state: 'done',
              value: true,
              origin: 'log',
              automatic: false,
              active: true,
              weeklyCompleted: null,
              weeklyCoverageComplete: true,
            },
            {
              habitId: 'qa-derived',
              name: 'Gimnasio sintético',
              icon: null,
              mode: 'derived',
              cadence: 'weekly',
              target: 3,
              unit: 'sesiones',
              state: state === 'complete' ? 'done' : 'unavailable',
              value: state === 'complete' ? true : null,
              origin: state === 'complete' ? 'gym-session' : 'unavailable',
              automatic: true,
              active: true,
              weeklyCompleted: state === 'complete' ? 1 : 0,
              weeklyCoverageComplete: state === 'complete',
            },
          ],
  };
  return {
    ...fixture,
    today: { today, orientation: fixture.week.orientation },
    habits: { view: habits },
  };
}
