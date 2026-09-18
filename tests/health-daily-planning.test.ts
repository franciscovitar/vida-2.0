import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  toDailyPlanningHealth,
  unavailableDailyPlanningHealth,
} from '@/lib/health/planning-context';
import type { HealthDailyBrief } from '@/lib/health/intelligence';

function brief(
  overrides: Partial<HealthDailyBrief> = {},
): HealthDailyBrief {
  return {
    date: '2026-09-18',
    state: 'RECUPERACIÓN',
    headline: 'Varias señales están por debajo de tu normal',
    confidence: 'ALTA',
    confidenceDetail: '2 de 2 señales núcleo hoy',
    evidence: ['Sueño total: 5,8 h.', 'FC en reposo: 62 ppm.'],
    uncertainties: [],
    recommendations: ['Aflojar la carga hoy.'],
    limits: ['No realiza diagnósticos clínicos.'],
    engineVersion: 'health-intelligence-v1',
    ...overrides,
  };
}

test('HDP1. Daily Planning recibe sólo campos derivados mínimos, sin biometría ni evidencia', () => {
  const read = toDailyPlanningHealth(brief());

  assert.equal(read.source.status, 'ready');
  assert.equal(read.source.available, true);
  assert.deepEqual(Object.keys(read.context ?? {}).sort(), [
    'canInformCapacity',
    'confidence',
    'headline',
    'state',
  ]);
  assert.equal(read.context?.state, 'RECUPERACIÓN');
  assert.equal(read.context?.confidence, 'ALTA');
  assert.equal(read.context?.canInformCapacity, true);

  const serialized = JSON.stringify(read);
  assert.doesNotMatch(serialized, /5,8|62 ppm|Sueño total|FC en reposo|Aflojar la carga/);
});

test('HDP2. evidencia insuficiente falla cerrado y no habilita ajuste de capacidad', () => {
  const read = toDailyPlanningHealth(
    brief({
      state: 'INSUFICIENTE',
      confidence: 'BAJA',
      headline: 'No hay datos suficientes hoy',
    }),
  );

  assert.equal(read.source.status, 'limited');
  assert.equal(read.source.available, true);
  assert.equal(read.context?.canInformCapacity, false);
});

test('HDP3. fuente sanitaria no disponible no bloquea ni fabrica contexto', () => {
  const read = unavailableDailyPlanningHealth();

  assert.equal(read.source.status, 'unavailable');
  assert.equal(read.source.available, false);
  assert.equal(read.context, null);
});

test('HDP4. la UI declara explícitamente que Salud no posee prioridad ni agenda', () => {
  const panel = readFileSync(
    join(process.cwd(), 'components', 'dashboard', 'DailyPlanningPanel.tsx'),
    'utf8',
  );

  assert.match(panel, /Contexto de capacidad/);
  assert.match(panel, /no reordena prioridades ni agenda por sí solo/i);
  assert.match(panel, /evidencia no alcanza para ajustar capacidad/i);
});
