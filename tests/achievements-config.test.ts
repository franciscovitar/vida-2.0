import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getAchievementsReadConfig, isAchievementsReadEnabled } from '../lib/achievements/config.ts';

const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const env = { ACHIEVEMENTS_V1_READ_ENABLED: 'true', NOTION_API_TOKEN: 'synthetic', NOTION_ACHIEVEMENTS_DATA_SOURCE_ID: id };

test('default denies achievements', () => {
  assert.equal(isAchievementsReadEnabled({}), false);
  assert.equal(getAchievementsReadConfig({}), null);
});
test('requires exact true flag', () => {
  assert.equal(getAchievementsReadConfig({ ...env, ACHIEVEMENTS_V1_READ_ENABLED: 'TRUE' }), null);
});
test('valid explicitly allowed source stays bounded to unique ID', () => {
  assert.deepEqual(getAchievementsReadConfig(env), { token: 'synthetic', dataSourceId: id });
});
test('missing token or ID is not a valid source', () => {
  assert.equal(getAchievementsReadConfig({ ...env, NOTION_API_TOKEN: '' }), null);
  assert.equal(getAchievementsReadConfig({ ...env, NOTION_ACHIEVEMENTS_DATA_SOURCE_ID: '' }), null);
});
test('invalid ID fails closed', () => {
  assert.equal(getAchievementsReadConfig({ ...env, NOTION_ACHIEVEMENTS_DATA_SOURCE_ID: 'fake-id' }), null);
});
test('prohibits reusing tasks/projects/areas/milestones source', () => {
  for (const key of ['NOTION_TASKS_DATA_SOURCE_ID', 'NOTION_PROJECTS_DATA_SOURCE_ID', 'NOTION_AREAS_DATA_SOURCE_ID', 'NOTION_MILESTONES_DATA_SOURCE_ID']) {
    assert.equal(getAchievementsReadConfig({ ...env, [key]: id.toUpperCase() }), null);
  }
});
