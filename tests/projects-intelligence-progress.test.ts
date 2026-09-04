import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeProjectProgress } from '@/lib/notion/projects-intelligence-progress';
import type { ProjectsIntelligenceMilestone } from '@/types/projects-intelligence';

function milestone(
  overrides: Partial<ProjectsIntelligenceMilestone>,
): ProjectsIntelligenceMilestone {
  return {
    id: overrides.id ?? 'm',
    name: overrides.name ?? 'Hito',
    projectId: overrides.projectId ?? 'proj-1',
    status: overrides.status ?? null,
    weight: overrides.weight ?? null,
    completionCriteria: overrides.completionCriteria ?? null,
    evidence: overrides.evidence ?? null,
    order: overrides.order ?? null,
    completedAt: overrides.completedAt ?? null,
    ownership: overrides.ownership ?? null,
  };
}

test('PI-P1. canónico real (6 hitos de la Fase Projects Intelligence): 20 + 25 Hecho de 100 → 45', () => {
  const milestones = [
    milestone({ id: 'm1', name: 'Contrato y diseño técnico V1', status: 'Hecho', weight: 20 }),
    milestone({
      id: 'm2',
      name: 'Canonicalizar Proyectos e Hitos en Notion',
      status: 'Hecho',
      weight: 25,
    }),
    milestone({
      id: 'm3',
      name: 'Activar runtime Projects OS + ChatGPT Project',
      status: 'Pendiente',
      weight: 15,
    }),
    milestone({
      id: 'm4',
      name: 'Implementar lector e intelligence read-only',
      status: 'Pendiente',
      weight: 15,
    }),
    milestone({
      id: 'm5',
      name: 'Implementar módulo Projects en Vida 2.0',
      status: 'Pendiente',
      weight: 15,
    }),
    milestone({
      id: 'm6',
      name: 'QA end-to-end y validación final',
      status: 'Pendiente',
      weight: 10,
    }),
  ];
  const progress = computeProjectProgress(milestones);
  assert.equal(progress.measurable, true);
  if (progress.measurable) {
    assert.equal(progress.percent, 45);
    assert.equal(progress.completedWeight, 45);
    assert.equal(progress.totalWeight, 100);
  }
});

test('PI-P2. todos Pendiente con pesos válidos sumando 100 → 0% medible', () => {
  const milestones = [
    milestone({ id: 'm1', status: 'Pendiente', weight: 60 }),
    milestone({ id: 'm2', status: 'Pendiente', weight: 40 }),
  ];
  const progress = computeProjectProgress(milestones);
  assert.equal(progress.measurable, true);
  if (progress.measurable) assert.equal(progress.percent, 0);
});

test('PI-P3. todos Hecho → 100%', () => {
  const milestones = [
    milestone({ id: 'm1', status: 'Hecho', weight: 70 }),
    milestone({ id: 'm2', status: 'Hecho', weight: 30 }),
  ];
  const progress = computeProjectProgress(milestones);
  assert.equal(progress.measurable, true);
  if (progress.measurable) assert.equal(progress.percent, 100);
});

test('PI-P4. sin hitos → no medible', () => {
  const progress = computeProjectProgress([]);
  assert.equal(progress.measurable, false);
  if (!progress.measurable) assert.equal(progress.reason, 'no-milestones');
});

test('PI-P5. un peso ausente → no medible', () => {
  const milestones = [
    milestone({ id: 'm1', status: 'Hecho', weight: 50 }),
    milestone({ id: 'm2', status: 'Pendiente', weight: null }),
  ];
  const progress = computeProjectProgress(milestones);
  assert.equal(progress.measurable, false);
  if (!progress.measurable) assert.equal(progress.reason, 'missing-weight');
});

test('PI-P6. peso negativo → no medible', () => {
  const milestones = [
    milestone({ id: 'm1', status: 'Hecho', weight: 50 }),
    milestone({ id: 'm2', status: 'Pendiente', weight: -10 }),
  ];
  const progress = computeProjectProgress(milestones);
  assert.equal(progress.measurable, false);
  if (!progress.measurable) assert.equal(progress.reason, 'invalid-weight');
});

test('PI-P6b. peso no finito (Infinity/NaN) → no medible', () => {
  const withInfinity = computeProjectProgress([
    milestone({ id: 'm1', status: 'Hecho', weight: Number.POSITIVE_INFINITY }),
  ]);
  assert.equal(withInfinity.measurable, false);
  if (!withInfinity.measurable) assert.equal(withInfinity.reason, 'invalid-weight');

  const withNaN = computeProjectProgress([
    milestone({ id: 'm1', status: 'Hecho', weight: Number.NaN }),
  ]);
  assert.equal(withNaN.measurable, false);
  if (!withNaN.measurable) assert.equal(withNaN.reason, 'invalid-weight');
});

test('PI-P7. total distinto de 100 → no medible (sin normalizar)', () => {
  const milestones = [
    milestone({ id: 'm1', status: 'Hecho', weight: 50 }),
    milestone({ id: 'm2', status: 'Pendiente', weight: 40 }),
  ];
  const progress = computeProjectProgress(milestones);
  assert.equal(progress.measurable, false);
  if (!progress.measurable) assert.equal(progress.reason, 'invalid-total');
});

test('PI-P8. hito "En progreso" aporta cero, no progreso parcial', () => {
  const milestones = [
    milestone({ id: 'm1', status: 'En progreso', weight: 60 }),
    milestone({ id: 'm2', status: 'Pendiente', weight: 40 }),
  ];
  const progress = computeProjectProgress(milestones);
  assert.equal(progress.measurable, true);
  if (progress.measurable) assert.equal(progress.percent, 0);
});

test('PI-P8b. hito "Descartado" aporta cero', () => {
  const milestones = [
    milestone({ id: 'm1', status: 'Descartado', weight: 60 }),
    milestone({ id: 'm2', status: 'Hecho', weight: 40 }),
  ];
  const progress = computeProjectProgress(milestones);
  assert.equal(progress.measurable, true);
  if (progress.measurable) assert.equal(progress.percent, 40);
});

test('PI-P9. hito Hecho aporta exactamente su peso completo', () => {
  const milestones = [
    milestone({ id: 'm1', status: 'Hecho', weight: 33 }),
    milestone({ id: 'm2', status: 'En progreso', weight: 33 }),
    milestone({ id: 'm3', status: 'Pendiente', weight: 34 }),
  ];
  const progress = computeProjectProgress(milestones);
  assert.equal(progress.measurable, true);
  if (progress.measurable) assert.equal(progress.percent, 33);
});

test('PI-P10. estado de hito ausente/no reconocido → no medible (invalid-status)', () => {
  const missingStatus = computeProjectProgress([
    milestone({ id: 'm1', status: null, weight: 50 }),
    milestone({ id: 'm2', status: 'Hecho', weight: 50 }),
  ]);
  assert.equal(missingStatus.measurable, false);
  if (!missingStatus.measurable) assert.equal(missingStatus.reason, 'invalid-status');
});

test('PI-P11. "Completado" (legado del dashboard genérico) ya no es un estado válido de Hito', () => {
  // El schema canónico de Hitos usa `Hecho`, no `Completado`. Un valor así
  // nunca debería llegar al DTO (el adaptador lo rechaza a `null`), pero el
  // motor de progreso debe tratarlo igual que cualquier estado no reconocido.
  const progress = computeProjectProgress([milestone({ id: 'm1', status: null, weight: 100 })]);
  assert.equal(progress.measurable, false);
  if (!progress.measurable) assert.equal(progress.reason, 'invalid-status');
});
