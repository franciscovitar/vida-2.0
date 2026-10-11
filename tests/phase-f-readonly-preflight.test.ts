import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

const SCRIPT = join(process.cwd(), 'scripts/phase-f-readonly-preflight.mjs');

const SAFE_QA = {
  NODE_ENV: 'test',
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: 'vida-qa',
  DAILY_PLANNING_V2_UI_ENABLED: 'true',
  TODAY_COCKPIT_V2_UI_ENABLED: 'true',
  LEARNING_HUB_V2_UI_ENABLED: 'true',
  PROJECTS_E6_SIGNALS_ENABLED: 'true',
  GOOGLE_CALENDAR_DATA_SOURCE: 'google',
  DATA_SOURCE: 'google',
  GOOGLE_SHEETS_TARGET: 'dev',
  NOTION_DATA_SOURCE: 'notion',
  WRITE_ACTIONS_ENABLED: 'false',
  HABITS_V2_WRITES_ENABLED: 'false',
  HABITS_V2_UI_ENABLED: 'false',
  TASK_DATE_SEMANTICS_V2_ENABLED: 'false',
  OPENCLAW_API_ENABLED: 'false',
  GOOGLE_SHEETS_ALLOW_PROD_WRITES: 'false',
};

function run(overrides: Record<string, string> = {}) {
  // Explicit fixture; never inherit credentials from the test runner.
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...SAFE_QA, ...overrides },
    timeout: 10_000,
  });
}

test('F-PF1: QA read-only configuration passes without accessing secrets', () => {
  const result = run({ GOOGLE_CALENDAR_CLIENT_SECRET: 'SENSITIVE_SENTINEL_DO_NOT_PRINT' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /PASS: configuración compatible/);
  assert.doesNotMatch(result.stdout + result.stderr, /SENSITIVE_SENTINEL_DO_NOT_PRINT/);
});

test('F-PF2: reject Production, other branches and mock sources', () => {
  for (const [name, env] of [
    ['production', { VERCEL_ENV: 'production' }],
    ['other branch', { VERCEL_GIT_COMMIT_REF: 'main' }],
    ['Calendar mock', { GOOGLE_CALENDAR_DATA_SOURCE: 'mock' }],
    ['Sheets prod', { GOOGLE_SHEETS_TARGET: 'prod' }],
    ['Notion mock', { NOTION_DATA_SOURCE: 'mock' }],
  ] as const) {
    const result = run(env);
    assert.equal(result.status, 1, name);
    assert.match(result.stdout, /BLOCKED/, name);
  }
});

test('F-PF3: each V2 read-only surface must be intentionally opted in', () => {
  for (const flag of [
    'DAILY_PLANNING_V2_UI_ENABLED',
    'TODAY_COCKPIT_V2_UI_ENABLED',
    'LEARNING_HUB_V2_UI_ENABLED',
    'PROJECTS_E6_SIGNALS_ENABLED',
  ]) {
    const result = run({ [flag]: 'false' });
    assert.equal(result.status, 1, flag);
    assert.match(result.stdout, /BLOCKED/, flag);
  }
});

test('F-PF4: reject write, Habits V2 and unapproved task date switches', () => {
  for (const flag of [
    'WRITE_ACTIONS_ENABLED',
    'HABITS_V2_WRITES_ENABLED',
    'HABITS_V2_UI_ENABLED',
    'TASK_DATE_SEMANTICS_V2_ENABLED',
    'OPENCLAW_API_ENABLED',
    'GOOGLE_SHEETS_ALLOW_PROD_WRITES',
  ]) {
    const result = run({ [flag]: 'true' });
    assert.equal(result.status, 1, flag);
    assert.match(result.stdout, /BLOCKED/, flag);
  }
});
