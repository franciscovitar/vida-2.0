import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { NotionReadPort, NotionRawPage } from '@/lib/notion/client';
import type { ProjectsIntelligenceNotionConfig } from '@/lib/notion/config';
import {
  loadProjectsIntelligenceFromPort,
  loadProjectsIntelligenceUncached,
} from '@/lib/notion/projects-intelligence';
import { buildMockNotionProjects } from '@/lib/mock-data/notion';
import type { ProjectsIntelligenceData } from '@/types/projects-intelligence';

const CONFIG: ProjectsIntelligenceNotionConfig = {
  token: 'fixture-token',
  projectsDataSourceId: 'ds-projects',
  tasksDataSourceId: 'ds-tasks',
  milestonesDataSourceId: 'ds-milestones',
};

type PortResponse = { ok: true; pages: NotionRawPage[] } | { ok: false; code: string };

function fakePort(responses: Record<string, PortResponse>): NotionReadPort {
  return {
    async queryDataSource(dataSourceId: string) {
      const response = responses[dataSourceId];
      if (!response) return { ok: true, pages: [] };
      return response as Awaited<ReturnType<NotionReadPort['queryDataSource']>>;
    },
  };
}

/** Nombres de proyectos personales simulados que NUNCA deben aparecer en modo real fallido. */
const MOCK_PROJECT_NAMES = buildMockNotionProjects('2026-07-20').map((project) => project.name);

function assertNoMockData(data: ProjectsIntelligenceData) {
  assert.equal(data.projects.length, 0);
  for (const mockName of MOCK_PROJECT_NAMES) {
    assert.ok(
      !JSON.stringify(data).includes(mockName),
      `no debería aparecer el nombre de proyecto mock "${mockName}"`,
    );
  }
}

test('PI-FC1. fallo en Proyectos cierra la respuesta', async () => {
  const port = fakePort({ 'ds-projects': { ok: false, code: 'auth-error' } });
  const result = await loadProjectsIntelligenceFromPort(port, CONFIG, '2026-07-20', 'sync');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'auth-error');
});

test('PI-FC2. fallo en Hitos cierra la respuesta (aunque Proyectos funcione)', async () => {
  const port = fakePort({
    'ds-projects': { ok: true, pages: [] },
    'ds-milestones': { ok: false, code: 'permission-error' },
  });
  const result = await loadProjectsIntelligenceFromPort(port, CONFIG, '2026-07-20', 'sync');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'permission-error');
});

test('PI-FC3. fallo en Tareas cierra la respuesta', async () => {
  const port = fakePort({
    'ds-projects': { ok: true, pages: [] },
    'ds-milestones': { ok: true, pages: [] },
    'ds-tasks': { ok: false, code: 'rate-limited' },
  });
  const result = await loadProjectsIntelligenceFromPort(port, CONFIG, '2026-07-20', 'sync');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'rate-limited');
});

test('PI-FC4. no hay progreso fantasma cuando Hitos falla mientras Proyectos trae datos', async () => {
  const port = fakePort({
    'ds-projects': {
      ok: true,
      pages: [
        { id: 'p1', properties: { Proyecto: { type: 'title', title: [{ plain_text: 'X' }] } } },
      ],
    },
    'ds-milestones': { ok: false, code: 'network-error' },
  });
  const result = await loadProjectsIntelligenceFromPort(port, CONFIG, '2026-07-20', 'sync');
  assert.equal(result.ok, false);
  // Nunca se devuelven Proyectos con 0% falso por ausencia de Hitos.
  if (!result.ok) assert.equal(result.code, 'network-error');
});

test('PI-FC5. modo mock (fuente Notion inactiva) no muestra datos personales', async () => {
  const data = await loadProjectsIntelligenceUncached({
    getDataSource: () => 'mock',
  });
  assert.equal(data.source, 'mock');
  assertNoMockData(data);
});

test('PI-FC6. configuración ausente en modo real no muestra datos personales', async () => {
  const data = await loadProjectsIntelligenceUncached({
    getDataSource: () => 'notion',
    getConfig: () => ({ ok: false, reason: 'not-configured' }),
  });
  assert.equal(data.source, 'notion');
  assert.equal(data.status, 'not-configured');
  assertNoMockData(data);
});

test('PI-FC7. data source prohibido en modo real no muestra datos personales', async () => {
  const data = await loadProjectsIntelligenceUncached({
    getDataSource: () => 'notion',
    getConfig: () => ({ ok: false, reason: 'forbidden-data-source' }),
  });
  assert.equal(data.status, 'missing-data-source');
  assertNoMockData(data);
});

test('PI-FC8. auth-error en modo real no muestra datos personales', async () => {
  const data = await loadProjectsIntelligenceUncached({
    getDataSource: () => 'notion',
    getConfig: () => ({ ok: true, config: CONFIG }),
    createPort: () => fakePort({ 'ds-projects': { ok: false, code: 'auth-error' } }),
  });
  assert.equal(data.source, 'notion');
  assert.equal(data.status, 'auth-error');
  assertNoMockData(data);
});

test('PI-FC9. permission-error en modo real no muestra datos personales', async () => {
  const data = await loadProjectsIntelligenceUncached({
    getDataSource: () => 'notion',
    getConfig: () => ({ ok: true, config: CONFIG }),
    createPort: () =>
      fakePort({
        'ds-projects': { ok: true, pages: [] },
        'ds-milestones': { ok: false, code: 'permission-error' },
      }),
  });
  assert.equal(data.status, 'permission-error');
  assertNoMockData(data);
});

test('PI-FC10. rate-limited en modo real no muestra datos personales', async () => {
  const data = await loadProjectsIntelligenceUncached({
    getDataSource: () => 'notion',
    getConfig: () => ({ ok: true, config: CONFIG }),
    createPort: () =>
      fakePort({
        'ds-projects': { ok: true, pages: [] },
        'ds-milestones': { ok: true, pages: [] },
        'ds-tasks': { ok: false, code: 'rate-limited' },
      }),
  });
  assert.equal(data.status, 'rate-limited');
  assertNoMockData(data);
});

test('PI-FC11. excepción inesperada en el límite del loader no muestra datos personales', async () => {
  const data = await loadProjectsIntelligenceUncached({
    getDataSource: () => 'notion',
    getConfig: () => ({ ok: true, config: CONFIG }),
    createPort: () => {
      throw new Error('fallo de red inesperado');
    },
  });
  assert.equal(data.source, 'notion');
  assert.equal(data.status, 'read-error');
  assertNoMockData(data);
});

test('PI-FC12. proyectos vacíos en modo real es "empty", no un fallo silencioso con mocks', async () => {
  const data = await loadProjectsIntelligenceUncached({
    getDataSource: () => 'notion',
    getConfig: () => ({ ok: true, config: CONFIG }),
    createPort: () =>
      fakePort({
        'ds-projects': { ok: true, pages: [] },
        'ds-milestones': { ok: true, pages: [] },
        'ds-tasks': { ok: true, pages: [] },
      }),
  });
  assert.equal(data.status, 'empty');
  assertNoMockData(data);
});
