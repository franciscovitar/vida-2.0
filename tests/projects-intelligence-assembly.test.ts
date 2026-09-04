import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { NotionReadPort, NotionRawPage } from '@/lib/notion/client';
import type { ProjectsIntelligenceNotionConfig } from '@/lib/notion/config';
import { loadProjectsIntelligenceFromPort } from '@/lib/notion/projects-intelligence';

const CONFIG: ProjectsIntelligenceNotionConfig = {
  token: 'fixture-token',
  projectsDataSourceId: 'ds-projects',
  tasksDataSourceId: 'ds-tasks',
  milestonesDataSourceId: 'ds-milestones',
};

function titleProp(text: string) {
  return { type: 'title', title: [{ plain_text: text }] };
}
function selectProp(name: string) {
  return { type: 'select', select: { name } };
}
function statusProp(name: string) {
  return { type: 'status', status: { name } };
}
function numberProp(value: number | null) {
  return { type: 'number', number: value };
}
function relationProp(ids: string[]) {
  return { type: 'relation', relation: ids.map((id) => ({ id })) };
}

function fakePort(
  pages: Record<'ds-projects' | 'ds-milestones' | 'ds-tasks', NotionRawPage[]>,
): NotionReadPort {
  return {
    async queryDataSource(dataSourceId: string) {
      const key = dataSourceId as keyof typeof pages;
      return { ok: true, pages: pages[key] ?? [] };
    },
  };
}

test('PI-AS1. hitos y tareas se agrupan por proyecto; lo no relacionado no cuenta', async () => {
  const projects: NotionRawPage[] = [
    {
      id: 'proj-a',
      properties: { Proyecto: titleProp('Proyecto A'), Estado: selectProp('Activo') },
    },
    {
      id: 'proj-b',
      properties: { Proyecto: titleProp('Proyecto B'), Estado: selectProp('Activo') },
    },
  ];

  const milestones: NotionRawPage[] = [
    {
      id: 'm-a1',
      properties: {
        Hito: titleProp('Hito A1'),
        Proyecto: relationProp(['proj-a']),
        Estado: selectProp('Completado'),
        Peso: numberProp(60),
      },
    },
    {
      id: 'm-a2',
      properties: {
        Hito: titleProp('Hito A2'),
        Proyecto: relationProp(['proj-a']),
        Estado: selectProp('Pendiente'),
        Peso: numberProp(40),
      },
    },
    {
      id: 'm-b1',
      properties: {
        Hito: titleProp('Hito B1, no relacionado con A'),
        Proyecto: relationProp(['proj-b']),
        Estado: selectProp('Completado'),
        Peso: numberProp(100),
      },
    },
    {
      id: 'm-orphan',
      properties: {
        Hito: titleProp('Hito huérfano'),
        Estado: selectProp('Completado'),
        Peso: numberProp(999),
      },
    },
  ];

  const tasks: NotionRawPage[] = [
    {
      id: 't-a1',
      properties: {
        Tarea: titleProp('Tarea A1'),
        Estado: statusProp('Pendiente'),
        Proyecto: relationProp(['proj-a']),
      },
    },
    {
      id: 't-a2',
      properties: {
        Tarea: titleProp('Tarea A2'),
        Estado: statusProp('Bloqueada'),
        Proyecto: relationProp(['proj-a']),
      },
    },
    {
      id: 't-a3',
      properties: {
        Tarea: titleProp('Tarea A3 hecha'),
        Estado: statusProp('Hecha'),
        Proyecto: relationProp(['proj-a']),
      },
    },
    {
      id: 't-b1',
      properties: {
        Tarea: titleProp('Tarea B1, no relacionada con A'),
        Estado: statusProp('Pendiente'),
        Proyecto: relationProp(['proj-b']),
      },
    },
    {
      id: 't-orphan',
      properties: {
        Tarea: titleProp('Tarea sin proyecto'),
        Estado: statusProp('Pendiente'),
      },
    },
  ];

  const port = fakePort({
    'ds-projects': projects,
    'ds-milestones': milestones,
    'ds-tasks': tasks,
  });
  const result = await loadProjectsIntelligenceFromPort(port, CONFIG, '2026-07-20', 'sync');
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const projectA = result.data.projects.find((p) => p.id === 'proj-a');
  const projectB = result.data.projects.find((p) => p.id === 'proj-b');
  assert.ok(projectA);
  assert.ok(projectB);

  // Proyecto A: solo sus dos hitos relacionados, el hito huérfano y el de B no cuentan.
  assert.equal(projectA!.milestones.length, 2);
  assert.ok(projectA!.milestones.every((m) => m.projectId === 'proj-a'));
  assert.equal(projectA!.progress.measurable, true);
  if (projectA!.progress.measurable) assert.equal(projectA!.progress.percent, 60);

  // Proyecto A: conteo de tareas correcto; la tarea de B y la huérfana no cuentan.
  assert.equal(projectA!.relatedTaskCount, 3);
  assert.equal(projectA!.openTaskCount, 1); // Pendiente
  assert.equal(projectA!.blockedTaskCount, 1); // Bloqueada
  assert.ok(projectA!.relatedTasks.every((t) => t.project?.id === 'proj-a'));

  // Proyecto B: no ve los hitos/tareas de A.
  assert.equal(projectB!.milestones.length, 1);
  assert.equal(projectB!.relatedTaskCount, 1);
  if (projectB!.progress.measurable) assert.equal(projectB!.progress.percent, 100);

  assert.equal(result.data.status, 'ready');
  assert.equal(result.data.summary.total, 2);
});

test('PI-AS2. proyecto sin hitos ni tareas relacionadas queda en cero, no medible', async () => {
  const projects: NotionRawPage[] = [
    {
      id: 'proj-lonely',
      properties: { Proyecto: titleProp('Proyecto solo'), Estado: selectProp('Activo') },
    },
  ];
  const port = fakePort({ 'ds-projects': projects, 'ds-milestones': [], 'ds-tasks': [] });
  const result = await loadProjectsIntelligenceFromPort(port, CONFIG, '2026-07-20', 'sync');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const project = result.data.projects[0];
  assert.equal(project.relatedTaskCount, 0);
  assert.equal(project.openTaskCount, 0);
  assert.equal(project.blockedTaskCount, 0);
  assert.equal(project.milestones.length, 0);
  assert.equal(project.progress.measurable, false);
  if (!project.progress.measurable) assert.equal(project.progress.reason, 'no-milestones');
});

test('PI-AS3. respuesta completa es serializable sin secretos', async () => {
  const projects: NotionRawPage[] = [
    {
      id: 'proj-a',
      properties: { Proyecto: titleProp('Proyecto A'), Estado: selectProp('Activo') },
    },
  ];
  const port = fakePort({ 'ds-projects': projects, 'ds-milestones': [], 'ds-tasks': [] });
  const result = await loadProjectsIntelligenceFromPort(port, CONFIG, '2026-07-20', 'sync');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.doesNotThrow(() => JSON.stringify(result.data));
  const serialized = JSON.stringify(result.data);
  assert.ok(!serialized.includes('fixture-token'));
  assert.ok(!serialized.includes(CONFIG.projectsDataSourceId));
});
