import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const source = (...parts: string[]) => readFileSync(path.join(root, ...parts), 'utf8');

const hook = source('lib', 'local-drafts', 'use-local-draft-backup.ts');
const storage = source('lib', 'local-drafts', 'storage.ts');
const status = source('components', 'local-drafts', 'LocalDraftStatus.tsx');
const statusStyles = source('components', 'local-drafts', 'LocalDraftStatus.module.scss');
const gym = source('components', 'actions', 'GymSessionPanel.tsx');
const tasks = source('components', 'tasks', 'TaskPlanningWorkspace.tsx');
const projects = source('components', 'projects', 'ProjectReviewWorkspace.tsx');
const inbox = source('components', 'inbox', 'InboxPlanningWorkspace.tsx');
const reviews = source('components', 'reviews', 'ReviewWorkspace.tsx');

test('B1-LOCAL-UI-1. la persistencia usa solo localStorage y no APIs externas', () => {
  assert.match(hook, /window\.localStorage/);
  assert.equal(hook.includes('fetch('), false);
  assert.equal(hook.includes('runWriteAction'), false);
  assert.equal(hook.includes('skipInitialSaveRef'), false);
  assert.match(hook, /lastSerializedRef\.current = JSON\.stringify\(result\.value\)/);
  assert.equal(storage.includes('Notion'), false);
});

test('B1-LOCAL-UI-2. gimnasio restaura solo una rutina y día compatibles', () => {
  assert.match(gym, /LOCAL_DRAFT_KEYS\.gym/);
  assert.match(gym, /value\.routineKey === routine\?\.name/);
  assert.match(gym, /days\.some\(\(day\) => day\.key === value\.workoutDayKey\)/);
  assert.match(gym, /hasGymDraftContent/);
});

test('B1-LOCAL-UI-3. tareas conserva borradores y revisiones de estado', () => {
  assert.match(tasks, /LOCAL_DRAFT_KEYS\.tasks/);
  assert.match(tasks, /drafts, statusReviews/);
  assert.match(tasks, /isTaskWorkspaceBackup/);
});

test('B1-LOCAL-UI-4. proyectos conserva solo revisiones validadas', () => {
  assert.match(projects, /LOCAL_DRAFT_KEYS\.projects/);
  assert.match(projects, /isProjectReviewBackup/);
  assert.match(projects, /reviews\.length > 0/);
});

test('B1-LOCAL-UI-5. bandeja conserva estado pendiente o revisado', () => {
  assert.match(inbox, /LOCAL_DRAFT_KEYS\.inbox/);
  assert.match(inbox, /isBoolean\(value\.reviewed\)/);
  assert.match(inbox, /setCaptures\(value\)/);
});

test('B1-LOCAL-UI-6. centro de revisión conserva criterios y revisiones manuales', () => {
  assert.match(reviews, /LOCAL_DRAFT_KEYS\.reviews/);
  assert.match(reviews, /proposalDecisions, reviews/);
  assert.match(reviews, /isReviewBackup/);
});

test('B1-LOCAL-UI-7. el aviso declara plazo, cifrado y ausencia de sincronización', () => {
  assert.match(status, /30 días/);
  assert.match(status, /No está cifrado/);
  assert.match(status, /no se sincroniza/);
  assert.match(status, /Notion, Sheets ni Calendar/);
  assert.match(statusStyles, /min-height: 44px/);
});
