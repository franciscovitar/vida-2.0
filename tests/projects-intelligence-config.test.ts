import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getNotionConfig,
  getProjectsIntelligenceNotionConfig,
  isAllowedProjectsIntelligenceDataSourceId,
} from '@/lib/notion/config';
import { NOTION_DATABASES } from '@/lib/notion/constants';

const PI_IDS = {
  projects: '40000000-0000-4000-8000-000000000001',
  tasks: '40000000-0000-4000-8000-000000000002',
  milestones: '40000000-0000-4000-8000-000000000003',
};

function baseEnv(): Record<string, string> {
  return {
    NOTION_API_TOKEN: 'fixture-token',
    NOTION_PROJECTS_DATA_SOURCE_ID: PI_IDS.projects,
    NOTION_TASKS_DATA_SOURCE_ID: PI_IDS.tasks,
    NOTION_MILESTONES_DATA_SOURCE_ID: PI_IDS.milestones,
  };
}

test('PI-C1. falta el env de hitos → not-configured', () => {
  const env = baseEnv();
  delete (env as Record<string, string | undefined>).NOTION_MILESTONES_DATA_SOURCE_ID;
  const result = getProjectsIntelligenceNotionConfig(env);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'not-configured');
});

test('PI-C2. ID de hitos malformado es rechazado', () => {
  const env = { ...baseEnv(), NOTION_MILESTONES_DATA_SOURCE_ID: 'not-a-uuid' };
  const result = getProjectsIntelligenceNotionConfig(env);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'forbidden-data-source');
});

test('PI-C3. ID de origen duplicado es rechazado', () => {
  const env = { ...baseEnv(), NOTION_MILESTONES_DATA_SOURCE_ID: PI_IDS.tasks };
  const result = getProjectsIntelligenceNotionConfig(env);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'forbidden-data-source');
});

test('PI-C4. getNotionConfig (genérico) no cambia de comportamiento', () => {
  const env = {
    NOTION_API_TOKEN: 'fixture-token',
    NOTION_TASKS_DATA_SOURCE_ID: NOTION_DATABASES.tasks.dataSourceId,
    NOTION_PROJECTS_DATA_SOURCE_ID: NOTION_DATABASES.projects.dataSourceId,
    NOTION_AREAS_DATA_SOURCE_ID: NOTION_DATABASES.areas.dataSourceId,
  };
  const result = getNotionConfig(env);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.config.tasksDataSourceId, NOTION_DATABASES.tasks.dataSourceId);
    assert.equal(result.config.projectsDataSourceId, NOTION_DATABASES.projects.dataSourceId);
    assert.equal(result.config.areasDataSourceId, NOTION_DATABASES.areas.dataSourceId);
  }
});

test('PI-C5. configuración PI válida con tres orígenes distintos', () => {
  const env = baseEnv();
  const result = getProjectsIntelligenceNotionConfig(env);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.config.token, 'fixture-token');
    assert.equal(result.config.projectsDataSourceId, PI_IDS.projects);
    assert.equal(result.config.tasksDataSourceId, PI_IDS.tasks);
    assert.equal(result.config.milestonesDataSourceId, PI_IDS.milestones);
  }
});

test('PI-C6. isAllowedProjectsIntelligenceDataSourceId acepta solo los tres IDs configurados', () => {
  const env = baseEnv();
  assert.equal(isAllowedProjectsIntelligenceDataSourceId(PI_IDS.projects, env), true);
  assert.equal(isAllowedProjectsIntelligenceDataSourceId(PI_IDS.tasks, env), true);
  assert.equal(isAllowedProjectsIntelligenceDataSourceId(PI_IDS.milestones, env), true);
  assert.equal(
    isAllowedProjectsIntelligenceDataSourceId('00000000-0000-0000-0000-000000000000', env),
    false,
  );
});

test('PI-C7. la allowlist PI no acepta IDs del dashboard genérico por defecto', () => {
  const env = baseEnv();
  assert.equal(
    isAllowedProjectsIntelligenceDataSourceId(NOTION_DATABASES.areas.dataSourceId, env),
    false,
  );
});

test('PI-C8. sin token → not-configured', () => {
  const env = { ...baseEnv() };
  delete (env as Record<string, string | undefined>).NOTION_API_TOKEN;
  const result = getProjectsIntelligenceNotionConfig(env);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'not-configured');
});

test('PI-C9. Projects Intelligence no usa referencias hardcodeadas como fallback', () => {
  const result = getProjectsIntelligenceNotionConfig({ NOTION_API_TOKEN: 'fixture-token' });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'not-configured');
});
