/**
 * Block 3 — catálogos opacos UI + contratos de emisores de tareas.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { opaqueKey } from '@/lib/actions/opaque';
import { buildTaskWriteCatalogs } from '@/lib/actions/task-write-catalog';
import type { NotionArea, NotionProject, NotionTask } from '@/types/notion';

const root = process.cwd();

function source(...parts: string[]): string {
  return readFileSync(path.join(root, ...parts), 'utf8');
}

const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const AREA_ID = '11111111-1111-1111-1111-111111111111';
const PROJ_ID = '22222222-2222-2222-2222-222222222222';
const TASK_ID = '33333333-3333-3333-3333-333333333333';

test('B3-CAT-01. WritePanels has no area.salud or manual key inputs', () => {
  const panel = source('components', 'actions', 'WritePanels.tsx');
  assert.equal(panel.includes('area.salud'), false);
  assert.equal(panel.includes('Área (clave)'), false);
  assert.equal(panel.includes('Clave de tarea'), false);
  assert.equal(panel.includes("useState('area."), false);
  assert.match(panel, /areaOptions/);
  assert.match(panel, /taskOptions/);
  assert.match(panel, /No hay áreas autorizadas disponibles/);
});

test('B3-CAT-02. buildTaskWriteCatalogs emits opaque keys only', () => {
  const areas: NotionArea[] = [
    {
      id: AREA_ID,
      name: 'Salud',
      status: 'Activa',
      purpose: null,
      reviewDate: null,
      relatedProjectCount: 0,
      relatedTaskCount: 0,
      domain: 'health',
    },
    {
      id: UUID,
      name: 'Pausa',
      status: 'En pausa',
      purpose: null,
      reviewDate: null,
      relatedProjectCount: 0,
      relatedTaskCount: 0,
      domain: 'neutral',
    },
  ];
  const projects: NotionProject[] = [
    {
      id: PROJ_ID,
      name: 'QA Bloque 3',
      status: 'Activo',
      area: { id: AREA_ID, name: 'Salud', available: true },
      expectedResult: null,
      nextAction: null,
      dueDate: null,
      dateKind: 'none',
      reviewDate: null,
      blocker: null,
      relatedTaskCount: 0,
      domain: 'health',
    },
  ];
  const tasks: NotionTask[] = [
    {
      id: TASK_ID,
      title: 'Tarea QA',
      status: 'Pendiente',
      date: null,
      dateKind: 'none',
      priority: 'Media',
      duration: null,
      energy: null,
      project: { id: PROJ_ID, name: 'QA Bloque 3', available: true },
      area: { id: AREA_ID, name: 'Salud', available: true },
      projectArea: null,
      blocker: null,
      note: null,
      domain: 'health',
    },
  ];

  const catalogs = buildTaskWriteCatalogs({ areas, projects, tasks });
  assert.equal(catalogs.areas.length, 1);
  assert.equal(catalogs.areas[0]?.key, opaqueKey('area', AREA_ID));
  assert.equal(catalogs.areas[0]?.name, 'Salud');
  assert.equal(catalogs.projects.length, 1);
  assert.equal(catalogs.projects[0]?.areaKey, opaqueKey('area', AREA_ID));
  assert.equal(catalogs.tasks.length, 1);
  assert.equal(catalogs.tasks[0]?.key, opaqueKey('task', TASK_ID));

  const serialized = JSON.stringify(catalogs);
  assert.equal(serialized.includes(AREA_ID), false);
  assert.equal(serialized.includes(PROJ_ID), false);
  assert.equal(serialized.includes(TASK_ID), false);
  assert.equal(serialized.includes('area.salud'), false);
});

test('B3-CAT-03. empty active areas yield empty create catalog', () => {
  const catalogs = buildTaskWriteCatalogs({
    areas: [
      {
        id: AREA_ID,
        name: 'Salud',
        status: 'Inactiva',
        purpose: null,
        reviewDate: null,
        relatedProjectCount: 0,
        relatedTaskCount: 0,
        domain: 'health',
      },
    ],
    projects: [],
    tasks: [],
  });
  assert.deepEqual(catalogs.areas, []);
  assert.deepEqual(catalogs.projects, []);
});

test('B3-CAT-04. project without available area relation is excluded', () => {
  const catalogs = buildTaskWriteCatalogs({
    areas: [
      {
        id: AREA_ID,
        name: 'Salud',
        status: 'Activa',
        purpose: null,
        reviewDate: null,
        relatedProjectCount: 0,
        relatedTaskCount: 0,
        domain: 'health',
      },
    ],
    projects: [
      {
        id: PROJ_ID,
        name: 'Huérfano',
        status: 'Activo',
        area: { id: AREA_ID, name: 'Salud', available: false },
        expectedResult: null,
        nextAction: null,
        dueDate: null,
        dateKind: 'none',
        reviewDate: null,
        blocker: null,
        relatedTaskCount: 0,
        domain: 'health',
      },
    ],
    tasks: [],
  });
  assert.equal(catalogs.projects.length, 0);
});
