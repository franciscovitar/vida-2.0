import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const source = (...parts: string[]) => readFileSync(path.join(root, ...parts), 'utf8');

const page = source('app', '(app)', 'compras', 'page.tsx');
const workspace = source(
  'components',
  'personal-shopping',
  'PersonalShoppingWorkspace.tsx',
);
const styles = source(
  'components',
  'personal-shopping',
  'PersonalShoppingWorkspace.module.scss',
);
const api = source('app', 'api', 'personal-shopping', 'route.ts');

test('shopping personal route is functional and links to the isolated household app', () => {
  assert.equal(page.includes('DocumentaryStableKeyPage'), false);
  assert.match(page, /href="\/hogar\/reposicion"/);
  assert.match(page, /Lista de casa · compartida/);
  assert.match(page, /getPersonalShoppingRuntime/);
});

test('shopping personal exposes the four decision states without merging household data', () => {
  for (const label of ['Comprar', 'Investigar', 'Reponer', 'Historial']) {
    assert.ok(workspace.includes(label));
  }
  assert.equal(workspace.includes('household-replenishment'), false);
  assert.equal(api.includes('household-replenishment'), false);
});

test('shopping capture remains low friction and details are not mandatory', () => {
  assert.match(workspace, /Captura rápida/);
  assert.match(workspace, /Precio, links y detalles pueden esperar/);
  assert.match(workspace, /action: 'add'/);
  assert.match(workspace, /crypto\.randomUUID\(\)/);
});

test('shopping touch targets and focus states are explicit', () => {
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /overflow-x: auto/);
});

test('shopping mutation API authenticates and has no Finance write dependency', () => {
  assert.match(api, /verifySession/);
  assert.match(api, /getPersonalShoppingRuntime/);
  assert.equal(api.includes('finance/store'), false);
  assert.equal(api.includes('FinanceLogger'), false);
});
