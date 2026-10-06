import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

function source(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), 'utf8');
}

test('Gym UX separa Resumen, Rutina, Progreso y Cardio en rutas estables', () => {
  const navigation = source('components/gym/GymNavigation.tsx');
  assert.match(navigation, /Resumen/);
  assert.match(navigation, /\/gimnasio\/rutina/);
  assert.match(navigation, /\/gimnasio\/progreso/);
  assert.match(navigation, /\/gimnasio\/cardio/);

  assert.match(source('app/(app)/gimnasio/page.tsx'), /current="summary"/);
  assert.match(source('app/(app)/gimnasio/rutina/page.tsx'), /current="routine"/);
  assert.match(source('app/(app)/gimnasio/progreso/page.tsx'), /current="progress"/);
  assert.match(source('app/(app)/gimnasio/cardio/page.tsx'), /current="cardio"/);
});

test('Gym Resumen usa una superficie corta y separa el dashboard de progreso', () => {
  const page = source('app/(app)/gimnasio/page.tsx');
  const dashboard = source('components/gym/GymDashboard.tsx');

  assert.match(page, /GymDashboardView/);
  assert.match(dashboard, /GymSummaryOverview/);
  assert.match(dashboard, /GymProgressDashboardView/);
  assert.match(dashboard, /GymCardioDashboardView/);
  assert.match(dashboard, /GymRoutineDashboardView/);
});

test('Gym mantiene la carga compartida como lectura derivada y sin nueva escritura', () => {
  const loader = source('lib/gym/page-data.ts');
  assert.match(loader, /loadGymDashboard/);
  assert.match(loader, /loadGymWeeklyCardio/);
  assert.equal(/create|update|delete|write/i.test(loader), false);
});
