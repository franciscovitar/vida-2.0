import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { runBlock1FinalQa } from '@/scripts/block-1-final-qa';

const root = process.cwd();

function source(...parts: string[]): string {
  return readFileSync(path.join(root, ...parts), 'utf8');
}

const workspaces = [
  source('components', 'actions', 'GymSessionPanel.tsx'),
  source('components', 'tasks', 'TaskPlanningWorkspace.tsx'),
  source('components', 'projects', 'ProjectReviewWorkspace.tsx'),
  source('components', 'inbox', 'InboxPlanningWorkspace.tsx'),
  source('components', 'reviews', 'ReviewWorkspace.tsx'),
];

const styles = [
  source('components', 'actions', 'GymSessionPanel.module.scss'),
  source('components', 'tasks', 'TaskPlanningWorkspace.module.scss'),
  source('components', 'projects', 'ProjectReviewWorkspace.module.scss'),
  source('components', 'inbox', 'InboxPlanningWorkspace.module.scss'),
  source('components', 'reviews', 'ReviewWorkspace.module.scss'),
];

const storage = source('lib', 'local-drafts', 'storage.ts');
const hook = source('lib', 'local-drafts', 'use-local-draft-backup.ts');
const status = source('components', 'local-drafts', 'LocalDraftStatus.tsx');

test('B1-QA-1. la auditoría integral termina con todos los controles aprobados', () => {
  const checks = runBlock1FinalQa(root);
  assert.equal(checks.length, 14);
  assert.deepEqual(
    checks.filter((check) => !check.ok),
    [],
  );
});

test('B1-QA-2. los cinco módulos usan persistencia local tipada', () => {
  for (const workspace of workspaces) {
    assert.match(workspace, /useLocalDraftBackup/);
    assert.match(workspace, /LocalDraftStatus/);
  }
});

test('B1-QA-3. cada módulo usa una clave de almacenamiento distinta', () => {
  const joined = workspaces.join('\n');
  for (const key of ['gym', 'tasks', 'projects', 'inbox', 'reviews']) {
    assert.equal((joined.match(new RegExp(`LOCAL_DRAFT_KEYS\\.${key}`, 'g')) ?? []).length, 1);
  }
});

test('B1-QA-4. todos los respaldos declaran validación y criterio de contenido', () => {
  for (const workspace of workspaces) {
    assert.match(workspace, /validate:/);
    assert.match(workspace, /hasContent:/);
  }
});

test('B1-QA-5. ningún workspace ejecuta escrituras o fetch directo', () => {
  for (const workspace of workspaces) {
    assert.equal(workspace.includes('runWriteAction'), false);
    assert.equal(workspace.includes('@/app/actions/writes'), false);
    assert.equal(workspace.includes('fetch('), false);
  }
});

test('B1-QA-6. los componentes cliente no contienen secretos ni process.env', () => {
  for (const workspace of workspaces) {
    assert.equal(workspace.includes('process.env'), false);
    assert.equal(workspace.includes('NOTION_API_TOKEN'), false);
    assert.equal(workspace.includes('GOOGLE_PRIVATE_KEY'), false);
    assert.equal(workspace.includes('AUTH_SECRET'), false);
  }
});

test('B1-QA-7. el formato local tiene versión, límite y vencimiento', () => {
  assert.match(storage, /LOCAL_DRAFT_VERSION = 1/);
  assert.match(storage, /30 \* 24 \* 60 \* 60 \* 1_000/);
  assert.match(storage, /LOCAL_DRAFT_MAX_LENGTH = 250_000/);
});

test('B1-QA-8. un borrador inválido o vencido se elimina de localStorage', () => {
  assert.match(storage, /expiresAt <= now/);
  assert.match(storage, /if \(!validate\(envelope\.payload\)\)/);
  assert.match(storage, /if \(!result\.ok\) storage\.removeItem\(storageKey\)/);
});

test('B1-QA-9. restauración y autoguardado están diferidos y cancelables', () => {
  assert.match(hook, /window\.setTimeout\(\(\) =>/);
  assert.match(hook, /\}, 0\)/);
  assert.match(hook, /\}, 300\)/);
  assert.match(hook, /window\.clearTimeout\(timer\)/);
});

test('B1-QA-10. la copia local puede eliminarse desde la interfaz', () => {
  assert.match(hook, /const clear = useCallback/);
  assert.match(hook, /removeLocalDraft\(storage, key\)/);
  assert.match(status, /Eliminar copia local/);
});

test('B1-QA-11. gimnasio rechaza respaldos de otra rutina o día', () => {
  const gym = workspaces[0]!;
  assert.match(gym, /value\.routineKey === routine\?\.name/);
  assert.match(gym, /days\.some\(\(day\) => day\.key === value\.workoutDayKey\)/);
});

test('B1-QA-12. la interfaz informa límites de privacidad del navegador', () => {
  assert.match(status, /No está cifrado/);
  assert.match(status, /no se sincroniza/);
  assert.match(status, /no modifica Notion, Sheets ni Calendar/);
});

test('B1-QA-13. responsive conserva targets de 44 px sin scroll horizontal forzado', () => {
  for (const stylesheet of styles) {
    assert.match(stylesheet, /min-height: 44px/);
    assert.equal(stylesheet.includes('overflow-x: scroll'), false);
  }
});

test('B1-QA-14. package y documentación incluyen el cierre reproducible', () => {
  const packageJson = source('package.json');
  const documentation = source('docs', 'BLOCK-1-FINAL-QA.md');

  assert.match(packageJson, /"qa:block1": "tsx scripts\/block-1-final-qa\.ts"/);
  assert.match(documentation, /Preview de Vercel/);
  assert.match(documentation, /390 × 844/);
  assert.match(documentation, /WRITE_ACTIONS_ENABLED=false/);
  assert.match(documentation, /OPENCLAW_API_ENABLED=false/);
});
