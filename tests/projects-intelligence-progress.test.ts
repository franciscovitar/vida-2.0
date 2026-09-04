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

test('PI-P1. canónico: 20 + 25 completados de 100 → 45', () => {
  const milestones = [
    milestone({ id: 'm1', status: 'Completado', weight: 20 }),
    milestone({ id: 'm2', status: 'Completado', weight: 25 }),
    milestone({ id: 'm3', status: 'Pendiente', weight: 15 }),
    milestone({ id: 'm4', status: 'Pendiente', weight: 15 }),
    milestone({ id: 'm5', status: 'Pendiente', weight: 15 }),
    milestone({ id: 'm6', status: 'Pendiente', weight: 10 }),
  ];
  const progress = computeProjectProgress(milestones);
  assert.equal(progress.measurable, true);
  if (progress.measurable) {
    assert.equal(progress.percent, 45);
    assert.equal(progress.completedWeight, 45);
    assert.equal(progress.totalWeight, 100);
  }
});

test('PI-P2. todos pendientes con pesos válidos sumando 100 → 0% medible', () => {
  const milestones = [
    milestone({ id: 'm1', status: 'Pendiente', weight: 60 }),
    milestone({ id: 'm2', status: 'Pendiente', weight: 40 }),
  ];
  const progress = computeProjectProgress(milestones);
  assert.equal(progress.measurable, true);
  if (progress.measurable) assert.equal(progress.percent, 0);
});

test('PI-P3. todos completados → 100%', () => {
  const milestones = [
    milestone({ id: 'm1', status: 'Completado', weight: 70 }),
    milestone({ id: 'm2', status: 'Completado', weight: 30 }),
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
    milestone({ id: 'm1', status: 'Completado', weight: 50 }),
    milestone({ id: 'm2', status: 'Pendiente', weight: null }),
  ];
  const progress = computeProjectProgress(milestones);
  assert.equal(progress.measurable, false);
  if (!progress.measurable) assert.equal(progress.reason, 'missing-weight');
});

test('PI-P6. peso negativo → no medible', () => {
  const milestones = [
    milestone({ id: 'm1', status: 'Completado', weight: 50 }),
    milestone({ id: 'm2', status: 'Pendiente', weight: -10 }),
  ];
  const progress = computeProjectProgress(milestones);
  assert.equal(progress.measurable, false);
  if (!progress.measurable) assert.equal(progress.reason, 'invalid-weight');
});

test('PI-P6b. peso no finito (Infinity/NaN) → no medible', () => {
  const withInfinity = computeProjectProgress([
    milestone({ id: 'm1', status: 'Completado', weight: Number.POSITIVE_INFINITY }),
  ]);
  assert.equal(withInfinity.measurable, false);
  if (!withInfinity.measurable) assert.equal(withInfinity.reason, 'invalid-weight');

  const withNaN = computeProjectProgress([
    milestone({ id: 'm1', status: 'Completado', weight: Number.NaN }),
  ]);
  assert.equal(withNaN.measurable, false);
  if (!withNaN.measurable) assert.equal(withNaN.reason, 'invalid-weight');
});

test('PI-P7. total distinto de 100 → no medible (sin normalizar)', () => {
  const milestones = [
    milestone({ id: 'm1', status: 'Completado', weight: 50 }),
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

test('PI-P9. hito completado aporta exactamente su peso completo', () => {
  const milestones = [
    milestone({ id: 'm1', status: 'Completado', weight: 33 }),
    milestone({ id: 'm2', status: 'En progreso', weight: 33 }),
    milestone({ id: 'm3', status: 'Pendiente', weight: 34 }),
  ];
  const progress = computeProjectProgress(milestones);
  assert.equal(progress.measurable, true);
  if (progress.measurable) assert.equal(progress.percent, 33);
});
