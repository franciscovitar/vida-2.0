import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const continuity = readFileSync('app/(app)/planificacion/en-que-quede/page.tsx', 'utf8');
const planning = readFileSync('app/(app)/planificacion/page.tsx', 'utf8');

test('En qué quedé is independently available only through authenticated read-only data', () => {
  assert.match(continuity, /await requireAuthorizedSession\(\)/);
  assert.doesNotMatch(continuity, /isDailyPlanningV2UiEnabled/);
  assert.match(continuity, /getProjectsIntelligence\(\)/);
  assert.match(continuity, /getAssessmentProgressForLearningV2\(\)/);
  assert.match(continuity, /buildSessionContinuityView\(/);
});

test('Planning V1 links to continuity without activating Planning V2', () => {
  assert.match(planning, /if \(isDailyPlanningV2UiEnabled\(\)\)/);
  const legacy = planning.slice(planning.indexOf('const taskCatalog ='));
  assert.match(legacy, /href="\/planificacion\/en-que-quede"/);
  assert.match(legacy, /<PlanningWorkspace/);
});
