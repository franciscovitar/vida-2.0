import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { composeAreaDashboard } from '@/lib/areas/compose';
import { buildAreaIntegrityWarnings } from '@/lib/areas/integrity';
import { buildMockNotionDashboard } from '@/lib/mock-data/notion';
import { taskDateKind } from '@/lib/notion/classify';
import { buildHoyNotionView, suggestNextActions } from '@/lib/notion/hoy';
import { buildNotionHoyPreview, summarizeProjects, summarizeTasks } from '@/lib/notion/summaries';
import {
  deriveTaskDateAttention,
  deriveTaskDateSemantics,
  deriveTaskDateState,
  taskDateDisplayKindV2,
  taskDateLabelV2,
} from '@/lib/notion/task-date-semantics';
import { selectAttentionTasks } from '@/lib/planning/overview';
import type { NotionDashboardData, NotionTask, NotionTaskDateType } from '@/types/notion';

const TODAY = '2026-10-13';
const base = buildMockNotionDashboard(TODAY);
const area = base.areas.find((item) => item.name === 'Facultad')!;
assert.ok(area);

function task(
  id: string,
  dateType: NotionTaskDateType | null,
  date = '2026-10-12',
  status: NotionTask['status'] = 'Pendiente',
): NotionTask {
  const dateSemantics = deriveTaskDateSemantics(date, dateType);
  const dateState = deriveTaskDateState(date, TODAY);
  return {
    id,
    title: id,
    status,
    date,
    dateType,
    dateKind: taskDateKind(status, date, TODAY),
    dateSemantics,
    dateState,
    dateAttention: deriveTaskDateAttention(status, dateSemantics, dateState),
    priority: 'Alta',
    duration: null,
    energy: null,
    project: null,
    area: { id: area.id, name: area.name, available: true },
    projectArea: null,
    blocker: null,
    note: null,
    domain: 'tasks',
  };
}

function matrix(date = '2026-10-12'): NotionTask[] {
  return [
    task('deadline', 'Deadline', date),
    task('target', 'Objetivo', date),
    task('review', 'Revisión', date),
    task('legacy', null, date),
  ];
}

function dashboard(tasks: NotionTask[]): NotionDashboardData {
  return {
    ...base,
    source: 'mock',
    status: 'mock',
    notice: null,
    syncedAt: '2026-10-13T12:00:00Z',
    targetDate: TODAY,
    projects: [],
    tasks,
    taskSummary: summarizeTasks(tasks, false),
    projectSummary: summarizeProjects([]),
  };
}

test('V2 overdue counters and Hoy previews count only Deadline; V1 remains unchanged', () => {
  const tasks = matrix();
  assert.equal(summarizeTasks(tasks, false).overdue, 4);
  assert.equal(summarizeTasks(tasks, true).overdue, 1);
  assert.deepEqual(
    buildNotionHoyPreview(dashboard(tasks), true).overdueTasks.map((item) => item.id),
    ['deadline'],
  );
  assert.deepEqual(
    buildHoyNotionView(dashboard(tasks), null, true).overdue.map((item) => item.id),
    ['deadline'],
  );
  assert.equal(buildHoyNotionView(dashboard(tasks), null, false).overdue.length, 4);
});

test('V2 due-today means Deadline today; Objetivo, Revisión and legacy dates are not due dates', () => {
  const tasks = matrix(TODAY);
  assert.equal(summarizeTasks(tasks, true).dueToday, 1);
  assert.equal(summarizeTasks(tasks, false).dueToday, 4);
  assert.deepEqual(
    buildNotionHoyPreview(dashboard(tasks), true).tasksDueToday.map((item) => item.id),
    ['deadline'],
  );
  assert.deepEqual(
    buildHoyNotionView(dashboard(tasks), null, true).dueToday.map((item) => item.id),
    ['deadline'],
  );
});

test('Hoy suggestions never describe target, review or ambiguous dates as overdue or due today', () => {
  for (const date of ['2026-10-12', TODAY]) {
    const actions = suggestNextActions(dashboard(matrix(date)), null, 8, true);
    assert.deepEqual(
      actions.map((item) => item.id),
      ['task:deadline'],
    );
  }
});

test('V2 overview gives real deadlines priority without interpreting oldest ambiguous dates as overdue', () => {
  const tasks = [
    task('legacy', null, '2026-01-01'),
    task('target', 'Objetivo'),
    task('review', 'Revisión'),
    task('deadline', 'Deadline'),
  ];
  assert.equal(selectAttentionTasks(tasks, [], 8, false)[0]?.id, 'legacy');
  assert.equal(selectAttentionTasks(tasks, [], 8, true)[0]?.id, 'deadline');
  const neutral = [task('z-ambiguous', null), task('a-ambiguous', null, '2026-10-11')];
  assert.deepEqual(
    selectAttentionTasks(neutral, [], 8, true).map((item) => item.id),
    ['a-ambiguous', 'z-ambiguous'],
  );
});

test('area integrity and composition do not report non-Deadline dates as overdue in V2', () => {
  const tasks = matrix();
  const input = { area, areaNotionId: area.id, projects: [], tasks };
  assert.equal(
    buildAreaIntegrityWarnings({ ...input, dateSemanticsV2: false }).filter(
      (item) => item.code === 'overdue-pending-task',
    ).length,
    4,
  );
  assert.deepEqual(
    buildAreaIntegrityWarnings({ ...input, dateSemanticsV2: true })
      .filter((item) => item.code === 'overdue-pending-task')
      .map((item) => item.subject),
    ['deadline'],
  );
  const view = composeAreaDashboard({
    slug: 'facultad',
    notion: dashboard(tasks),
    calendarEvents: [],
    sheets: null,
    sources: [],
    northHint: null,
    allowMockMetrics: false,
    dateSemanticsV2: true,
  });
  assert.ok(view);
  assert.deepEqual(
    view.overdueTasks.map((item) => item.title),
    ['deadline'],
  );
  assert.ok(
    view.pendingTasks
      .filter((item) => item.title !== 'deadline')
      .every((item) => item.dateKind !== 'overdue'),
  );
});

test('TasksBoard V2 labels and styling distinguish overdue, review-needed and ambiguous dates', () => {
  const [deadline, target, review, legacy] = matrix();
  assert.match(taskDateLabelV2(deadline!), /Deadline.*vencida/);
  assert.match(taskDateLabelV2(target!), /Objetivo.*revisar/);
  assert.match(taskDateLabelV2(review!), /Revisión.*revisar/);
  assert.match(taskDateLabelV2(legacy!), /Fecha sin tipo/);
  for (const row of [target!, review!, legacy!]) {
    assert.doesNotMatch(taskDateLabelV2(row), /vencida/);
    assert.notEqual(taskDateDisplayKindV2(row), 'overdue');
  }
  const source = readFileSync('components/notion/TasksBoard.tsx', 'utf8');
  assert.match(source, /dateSemanticsV2 = false/);
  assert.match(source, /taskDateDisplayKindV2\(task\)/);
  assert.match(source, /taskDateLabelV2\(task\)/);
});

test('fixtures missing optional V2 fields remain ambiguous in V2, and preserve legacy classification in V1', () => {
  const old = task('old', null);
  delete old.dateType;
  delete old.dateSemantics;
  delete old.dateState;
  delete old.dateAttention;
  assert.equal(summarizeTasks([old], false).overdue, 1);
  assert.equal(summarizeTasks([old], true).overdue, 0);
  assert.match(taskDateLabelV2(old), /Fecha sin tipo/);
});

test('completed and someday tasks never gain V2 deadline pressure; no-date and future dates stay neutral', () => {
  for (const status of ['Hecha', 'Algún día'] as const) {
    assert.equal(
      summarizeTasks([task('closed', 'Deadline', '2026-10-12', status)], true).overdue,
      0,
    );
    assert.equal(summarizeTasks([task('closed', 'Deadline', TODAY, status)], true).dueToday, 0);
  }
  const future = task('future', 'Deadline', '2026-10-14');
  const none = { ...future, date: null };
  assert.equal(summarizeTasks([future, none], true).overdue, 0);
  assert.equal(taskDateLabelV2(none), 'Sin fecha');
});

test('V2 projections never mutate the legacy dateKind or source-owned DTO', () => {
  const tasks = matrix();
  const before = JSON.stringify(tasks);
  summarizeTasks(tasks, true);
  buildHoyNotionView(dashboard(tasks), null, true);
  tasks.forEach(taskDateLabelV2);
  assert.equal(JSON.stringify(tasks), before);
  assert.ok(tasks.every((item) => item.dateKind === 'overdue'));
});
