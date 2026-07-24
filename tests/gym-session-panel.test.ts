import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const panelPath = path.join(process.cwd(), 'components', 'actions', 'GymSessionPanel.tsx');
const stylesPath = path.join(process.cwd(), 'components', 'actions', 'GymSessionPanel.module.scss');

const panel = readFileSync(panelPath, 'utf8');
const styles = readFileSync(stylesPath, 'utf8');

test('B1-GYM-UI-1. el panel móvil no ejecuta acciones de escritura', () => {
  assert.equal(panel.includes('runWriteAction'), false);
  assert.equal(panel.includes('@/app/actions/writes'), false);
  assert.ok(panel.includes('buildGymSessionCreatePayload'));
  assert.ok(panel.includes('No se escribió ningún dato'));
});

test('B1-GYM-UI-2. expone los controles contractuales de la sesión', () => {
  assert.ok(panel.includes('type="date"'));
  assert.equal((panel.match(/type="datetime-local"/g) ?? []).length, 2);
  assert.ok(panel.includes('Energía previa'));
  assert.ok(panel.includes('Notas de la sesión'));
  assert.ok(panel.includes('completed: event.target.checked'));
});

test('B1-GYM-UI-3. usa el modelo puro de la etapa 1', () => {
  assert.ok(panel.includes('createGymSessionDraft'));
  assert.ok(panel.includes('deriveGymSessionDraftState'));
  assert.ok(panel.includes('validateGymSessionDraft'));
});

test('B1-GYM-UI-4. los controles móviles respetan targets táctiles de 44 px', () => {
  assert.ok(styles.includes('min-height: 44px'));
  assert.ok(styles.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'));
  assert.equal(styles.includes('overflow-x: scroll'), false);
});
