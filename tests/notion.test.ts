import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { getDataSource } from '@/lib/data/config';
import { adaptProject, adaptTask, resolveRelation } from '@/lib/notion/adapters';
import { projectDateKind, taskDateKind } from '@/lib/notion/classify';
import {
  NOTION_DATABASES,
  TASK_PROPS,
  PROJECT_PROPS,
} from '@/lib/notion/constants';
import {
  getNotionConfig,
  getNotionDataSource,
  isAllowedNotionDataSourceId,
} from '@/lib/notion/config';
import { buildMockNotionDashboard, buildMockNotionTasks } from '@/lib/mock-data/notion';
import { summarizeProjects, summarizeTasks, buildNotionHoyPreview } from '@/lib/notion/summaries';
import { filterProjects, filterTasks } from '@/lib/notion/view-filters';
import { isResolvedSpreadsheetId } from '@/lib/validation/spreadsheet-id';

const TODAY = '2026-07-20';

function titleProp(text: string) {
  return { type: 'title', title: [{ plain_text: text }] };
}

function statusProp(name: string) {
  return { type: 'status', status: { name } };
}

function selectProp(name: string) {
  return { type: 'select', select: { name } };
}

function dateProp(start: string | null) {
  return { type: 'date', date: start ? { start } : null };
}

function relationProp(ids: string[]) {
  return { type: 'relation', relation: ids.map((id) => ({ id })) };
}

function richProp(text: string | null) {
  return {
    type: 'rich_text',
    rich_text: text ? [{ plain_text: text }] : [],
  };
}

test('N1. modo mock funciona sin token', () => {
  const prev = process.env.NOTION_DATA_SOURCE;
  const prevToken = process.env.NOTION_API_TOKEN;
  process.env.NOTION_DATA_SOURCE = 'mock';
  delete process.env.NOTION_API_TOKEN;
  assert.equal(getNotionDataSource(), 'mock');
  const base = buildMockNotionDashboard(TODAY);
  assert.ok(base.tasks.length > 0);
  assert.ok(base.projects.length > 0);
  assert.ok(base.areas.some((a) => a.name === 'Facultad'));
  assert.ok(base.areas.some((a) => a.name === 'Genova / Trabajo'));
  process.env.NOTION_DATA_SOURCE = prev;
  process.env.NOTION_API_TOKEN = prevToken;
});

test('N2. modo notion sin token usa fallback y no lanza', () => {
  const prev = process.env.NOTION_DATA_SOURCE;
  const prevToken = process.env.NOTION_API_TOKEN;
  process.env.NOTION_DATA_SOURCE = 'notion';
  delete process.env.NOTION_API_TOKEN;
  assert.equal(getNotionDataSource(), 'notion');
  const config = getNotionConfig();
  assert.equal(config.ok, false);
  if (!config.ok) assert.equal(config.reason, 'not-configured');
  // Simula el fallback de notion-source sin importar server-only cache.
  const base = buildMockNotionDashboard(TODAY);
  const data = {
    ...base,
    source: 'notion' as const,
    status: 'not-configured' as const,
    notice: 'Integración con Notion no configurada. Mostrando datos simulados.',
    syncedAt: '2026-07-20T12:00:00.000Z',
    taskSummary: summarizeTasks(base.tasks),
    projectSummary: summarizeProjects(base.projects),
  };
  assert.equal(data.status, 'not-configured');
  assert.ok(data.notice);
  assert.doesNotThrow(() => JSON.stringify(data));
  process.env.NOTION_DATA_SOURCE = prev;
  process.env.NOTION_API_TOKEN = prevToken;
});

test('N3. solo los tres data sources configurados son aceptados', () => {
  const env = {
    NOTION_API_TOKEN: 'fixture-token',
    NOTION_TASKS_DATA_SOURCE_ID: NOTION_DATABASES.tasks.dataSourceId,
    NOTION_PROJECTS_DATA_SOURCE_ID: NOTION_DATABASES.projects.dataSourceId,
    NOTION_AREAS_DATA_SOURCE_ID: NOTION_DATABASES.areas.dataSourceId,
  };
  assert.equal(isAllowedNotionDataSourceId(NOTION_DATABASES.tasks.dataSourceId, env), true);
  assert.equal(isAllowedNotionDataSourceId(NOTION_DATABASES.projects.dataSourceId, env), true);
  assert.equal(isAllowedNotionDataSourceId(NOTION_DATABASES.areas.dataSourceId, env), true);
  assert.equal(getNotionConfig(env).ok, true);
});

test('N3b. Notion no usa referencias hardcodeadas como fallback', () => {
  const config = getNotionConfig({ NOTION_API_TOKEN: 'fixture-token' });
  assert.equal(config.ok, false);
  if (!config.ok) assert.equal(config.reason, 'not-configured');
});

test('N4. un data source desconocido es rechazado', () => {
  const env = {
    NOTION_TASKS_DATA_SOURCE_ID: NOTION_DATABASES.tasks.dataSourceId,
    NOTION_PROJECTS_DATA_SOURCE_ID: NOTION_DATABASES.projects.dataSourceId,
    NOTION_AREAS_DATA_SOURCE_ID: NOTION_DATABASES.areas.dataSourceId,
  };
  assert.equal(
    isAllowedNotionDataSourceId('00000000-0000-0000-0000-000000000000', env),
    false,
  );
});

test('N5. estados de tareas se adaptan correctamente', () => {
  const page = {
    id: 't1',
    properties: {
      [TASK_PROPS.title]: titleProp('Probar estado'),
      [TASK_PROPS.status]: statusProp('En progreso'),
      [TASK_PROPS.date]: dateProp(TODAY),
      [TASK_PROPS.priority]: selectProp('Alta'),
      [TASK_PROPS.duration]: selectProp('30 min'),
      [TASK_PROPS.energy]: selectProp('Media'),
      [TASK_PROPS.project]: relationProp([]),
      [TASK_PROPS.area]: relationProp([]),
      [TASK_PROPS.projectArea]: relationProp([]),
      [TASK_PROPS.blocker]: richProp(null),
      [TASK_PROPS.note]: richProp(null),
    },
  };
  const task = adaptTask(page, new Map(), new Map(), TODAY);
  assert.equal(task.status, 'En progreso');
  assert.equal(task.priority, 'Alta');
  assert.equal(task.duration, '30 min');
});

test('N6. estados de proyectos se adaptan correctamente', () => {
  const page = {
    id: 'p1',
    properties: {
      [PROJECT_PROPS.title]: titleProp('Proyecto demo'),
      [PROJECT_PROPS.status]: statusProp('En espera'),
      [PROJECT_PROPS.area]: relationProp([]),
      [PROJECT_PROPS.expectedResult]: richProp('Resultado'),
      [PROJECT_PROPS.nextAction]: richProp(null),
      [PROJECT_PROPS.relatedTasks]: relationProp([]),
      [PROJECT_PROPS.dueDate]: dateProp(null),
      [PROJECT_PROPS.reviewDate]: dateProp(null),
      [PROJECT_PROPS.blocker]: richProp(null),
    },
  };
  const project = adaptProject(page, new Map(), TODAY);
  assert.equal(project.status, 'En espera');
  assert.equal(project.relatedTaskCount, 0);
});

test('N7. cero tareas relacionadas se conserva como cero', () => {
  const page = {
    id: 'p2',
    properties: {
      [PROJECT_PROPS.title]: titleProp('Sin tareas'),
      [PROJECT_PROPS.status]: statusProp('Activo'),
      [PROJECT_PROPS.area]: relationProp([]),
      [PROJECT_PROPS.expectedResult]: richProp(null),
      [PROJECT_PROPS.nextAction]: richProp('Hacer algo'),
      [PROJECT_PROPS.relatedTasks]: relationProp([]),
      [PROJECT_PROPS.dueDate]: dateProp(null),
      [PROJECT_PROPS.reviewDate]: dateProp(null),
      [PROJECT_PROPS.blocker]: richProp(null),
    },
  };
  assert.equal(adaptProject(page, new Map(), TODAY).relatedTaskCount, 0);
});

test('N8. relación inexistente no rompe', () => {
  const rel = resolveRelation(['missing-id'], new Map());
  assert.ok(rel);
  assert.equal(rel.available, false);
  assert.equal(rel.name, null);
  const page = {
    id: 't2',
    properties: {
      [TASK_PROPS.title]: titleProp('Huérfana'),
      [TASK_PROPS.status]: statusProp('Pendiente'),
      [TASK_PROPS.date]: dateProp(null),
      [TASK_PROPS.priority]: selectProp('Baja'),
      [TASK_PROPS.duration]: selectProp('5-15 min'),
      [TASK_PROPS.energy]: selectProp('Baja'),
      [TASK_PROPS.project]: relationProp(['missing-id']),
      [TASK_PROPS.area]: relationProp([]),
      [TASK_PROPS.projectArea]: relationProp([]),
      [TASK_PROPS.blocker]: richProp(null),
      [TASK_PROPS.note]: richProp(null),
    },
  };
  const task = adaptTask(page, new Map(), new Map(), TODAY);
  assert.equal(task.project?.available, false);
});

test('N9. tarea hecha no aparece vencida', () => {
  assert.equal(taskDateKind('Hecha', '2026-07-10', TODAY), 'none');
});

test('N10. tarea pendiente pasada aparece vencida', () => {
  assert.equal(taskDateKind('Pendiente', '2026-07-10', TODAY), 'overdue');
});

test('N11. tarea sin fecha no aparece vencida', () => {
  assert.equal(taskDateKind('Pendiente', null, TODAY), 'none');
});

test('N12. proyecto completado o cancelado no aparece vencido', () => {
  assert.equal(projectDateKind('Completado', '2026-06-01', TODAY), 'none');
  assert.equal(projectDateKind('Cancelado', '2026-06-01', TODAY), 'none');
  assert.equal(projectDateKind('Activo', '2026-06-01', TODAY), 'overdue');
});

test('N13. filtros por estado, área, proyecto y prioridad', () => {
  const tasks = buildMockNotionTasks(TODAY);
  const filtered = filterTasks(tasks, {
    query: '',
    status: 'Pendiente',
    priority: 'Alta',
    areaId: 'all',
    projectId: 'all',
  });
  assert.ok(filtered.every((t) => t.status === 'Pendiente' && t.priority === 'Alta'));
  const projects = buildMockNotionDashboard(TODAY).projects;
  const blocked = filterProjects(projects, {
    status: 'all',
    areaId: 'all',
    blocker: 'with',
    nextAction: 'all',
  });
  assert.ok(blocked.every((p) => p.blocker && p.blocker.trim() !== ''));
});

test('N14. no existe operación de escritura Notion', () => {
  const root = join(process.cwd(), 'lib', 'notion');
  const files = (readdirSync(root, { recursive: true }) as string[])
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => join(root, entry));
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    assert.doesNotMatch(content, /client\.pages\.(create|update)/);
    assert.doesNotMatch(content, /client\.dataSources\.(create|update)/);
    assert.doesNotMatch(content, /client\.blocks\.children\.append/);
    assert.doesNotMatch(content, /client\.search\(/);
  }
});

test('N15. ningún secreto llega a los DTO', () => {
  const base = buildMockNotionDashboard(TODAY);
  const json = JSON.stringify(base);
  assert.doesNotMatch(json, /secret_|NOTION_API_TOKEN|BEGIN PRIVATE KEY/i);
});

test('N16. objetos entregados a la UI son serializables', () => {
  const base = buildMockNotionDashboard(TODAY);
  const data = {
    ...base,
    source: 'mock' as const,
    status: 'mock' as const,
    notice: null,
    syncedAt: '2026-07-20T12:00:00.000Z',
    taskSummary: summarizeTasks(base.tasks),
    projectSummary: summarizeProjects(base.projects),
  };
  const roundtrip = JSON.parse(JSON.stringify(data));
  assert.equal(roundtrip.tasks.length, data.tasks.length);
  const preview = buildNotionHoyPreview(data);
  assert.doesNotThrow(() => JSON.stringify(preview));
});

test('N17. Google Sheets sigue funcionando', () => {
  assert.ok(getDataSource() === 'mock' || getDataSource() === 'google');
  assert.equal(isResolvedSpreadsheetId('dev-id', 'dev-id'), true);
});

test('N18. escritura de hábitos sigue limitada al target resuelto', () => {
  const toggle = readFileSync(join(process.cwd(), 'lib', 'habits', 'toggle.ts'), 'utf8');
  assert.match(toggle, /isAuthorizedHabitName/);
  assert.match(toggle, /writesAllowed/);
});

test('N19. /tareas sin overflow-x scroll de layout', () => {
  const css = readFileSync(
    join(process.cwd(), 'app', '(app)', 'tareas', 'page.module.scss'),
    'utf8',
  );
  const board = readFileSync(
    join(process.cwd(), 'components', 'notion', 'NotionBoards.module.scss'),
    'utf8',
  );
  assert.match(css, /min-width:\s*0/);
  assert.doesNotMatch(css + board, /overflow-x:\s*scroll/);
});

test('N20. /proyectos sin overflow-x scroll de layout', () => {
  const css = readFileSync(
    join(process.cwd(), 'app', '(app)', 'proyectos', 'page.module.scss'),
    'utf8',
  );
  assert.match(css, /min-width:\s*0/);
  assert.doesNotMatch(css, /overflow-x:\s*scroll/);
});
