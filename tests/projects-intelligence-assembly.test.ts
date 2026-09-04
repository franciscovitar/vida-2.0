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
        Estado: selectProp('Hecho'),
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
        Estado: selectProp('Hecho'),
        Peso: numberProp(100),
      },
    },
    {
      id: 'm-orphan',
      properties: {
        Hito: titleProp('Hito huérfano'),
        Estado: selectProp('Hecho'),
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
  assert.equal(project.nextAction, null);
  assert.equal(project.quality.missingNextAction, true);
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

test('PI-AS4. Próxima acción (relación) se resuelve contra la Tarea canónica ya cargada', async () => {
  const projects: NotionRawPage[] = [
    {
      id: 'proj-a',
      properties: {
        Proyecto: titleProp('Proyecto A'),
        Estado: selectProp('Activo'),
        'Próxima acción': relationProp(['task-a1']),
      },
    },
  ];
  const tasks: NotionRawPage[] = [
    {
      id: 'task-a1',
      properties: {
        Tarea: titleProp('Terminar el adaptador de hitos'),
        Estado: statusProp('Pendiente'),
        Proyecto: relationProp(['proj-a']),
      },
    },
  ];
  const port = fakePort({ 'ds-projects': projects, 'ds-milestones': [], 'ds-tasks': tasks });
  const result = await loadProjectsIntelligenceFromPort(port, CONFIG, '2026-07-20', 'sync');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const project = result.data.projects[0];
  assert.ok(project.nextAction);
  assert.equal(project.nextAction?.id, 'task-a1');
  assert.equal(project.nextAction?.name, 'Terminar el adaptador de hitos');
  assert.equal(project.nextAction?.available, true);
  assert.equal(project.quality.missingNextAction, false);
  assert.equal(project.quality.multipleNextActionCandidates, false);
});

test('PI-AS5. Próxima acción con relación que no resuelve a ninguna Tarea cargada cuenta como faltante', async () => {
  const projects: NotionRawPage[] = [
    {
      id: 'proj-a',
      properties: {
        Proyecto: titleProp('Proyecto A'),
        Estado: selectProp('Activo'),
        'Próxima acción': relationProp(['task-missing']),
      },
    },
  ];
  const port = fakePort({ 'ds-projects': projects, 'ds-milestones': [], 'ds-tasks': [] });
  const result = await loadProjectsIntelligenceFromPort(port, CONFIG, '2026-07-20', 'sync');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const project = result.data.projects[0];
  assert.ok(project.nextAction);
  assert.equal(project.nextAction?.id, 'task-missing');
  assert.equal(project.nextAction?.name, null);
  assert.equal(project.nextAction?.available, false);
  assert.equal(project.quality.missingNextAction, true);
});

test('PI-AS6. Próxima acción con más de una relación conserva solo la primera y marca la señal de calidad', async () => {
  const projects: NotionRawPage[] = [
    {
      id: 'proj-a',
      properties: {
        Proyecto: titleProp('Proyecto A'),
        Estado: selectProp('Activo'),
        'Próxima acción': relationProp(['task-first', 'task-second']),
      },
    },
  ];
  const tasks: NotionRawPage[] = [
    {
      id: 'task-first',
      properties: { Tarea: titleProp('Primera candidata'), Estado: statusProp('Pendiente') },
    },
    {
      id: 'task-second',
      properties: { Tarea: titleProp('Segunda candidata'), Estado: statusProp('Pendiente') },
    },
  ];
  const port = fakePort({ 'ds-projects': projects, 'ds-milestones': [], 'ds-tasks': tasks });
  const result = await loadProjectsIntelligenceFromPort(port, CONFIG, '2026-07-20', 'sync');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const project = result.data.projects[0];
  assert.equal(project.nextAction?.id, 'task-first');
  assert.equal(project.quality.multipleNextActionCandidates, true);
});

test('PI-AS7. Estado de Proyecto ausente o no reconocido nunca se convierte en Activo: falla cerrado', async () => {
  const withMissingStatus: NotionRawPage[] = [
    { id: 'proj-a', properties: { Proyecto: titleProp('Sin estado') } },
  ];
  const missing = await loadProjectsIntelligenceFromPort(
    fakePort({ 'ds-projects': withMissingStatus, 'ds-milestones': [], 'ds-tasks': [] }),
    CONFIG,
    '2026-07-20',
    'sync',
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, 'missing-property');

  const withUnknownStatus: NotionRawPage[] = [
    {
      id: 'proj-b',
      properties: { Proyecto: titleProp('Estado inventado'), Estado: selectProp('En curso') },
    },
  ];
  const unknown = await loadProjectsIntelligenceFromPort(
    fakePort({ 'ds-projects': withUnknownStatus, 'ds-milestones': [], 'ds-tasks': [] }),
    CONFIG,
    '2026-07-20',
    'sync',
  );
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.code, 'missing-property');
});

test('PI-AS8. progreso canónico real: 6 hitos de la Fase Projects Intelligence → 45%', async () => {
  const projects: NotionRawPage[] = [
    {
      id: 'proj-pi',
      properties: { Proyecto: titleProp('Projects Intelligence V1'), Estado: selectProp('Activo') },
    },
  ];
  const milestoneRows: Array<[string, string, number]> = [
    ['Contrato y diseño técnico V1', 'Hecho', 20],
    ['Canonicalizar Proyectos e Hitos en Notion', 'Hecho', 25],
    ['Activar runtime Projects OS + ChatGPT Project', 'Pendiente', 15],
    ['Implementar lector e intelligence read-only', 'Pendiente', 15],
    ['Implementar módulo Projects en Vida 2.0', 'Pendiente', 15],
    ['QA end-to-end y validación final', 'Pendiente', 10],
  ];
  const milestones: NotionRawPage[] = milestoneRows.map(([name, status, weight], index) => ({
    id: `m-${index}`,
    properties: {
      Hito: titleProp(name),
      Proyecto: relationProp(['proj-pi']),
      Estado: selectProp(status),
      Peso: numberProp(weight),
    },
  }));
  const port = fakePort({ 'ds-projects': projects, 'ds-milestones': milestones, 'ds-tasks': [] });
  const result = await loadProjectsIntelligenceFromPort(port, CONFIG, '2026-07-20', 'sync');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const project = result.data.projects[0];
  assert.equal(project.progress.measurable, true);
  if (project.progress.measurable) assert.equal(project.progress.percent, 45);
});
