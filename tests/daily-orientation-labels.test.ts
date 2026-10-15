import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dateTypeLabel,
  evidenceStateLabel,
  lifeSignalLevelLabel,
  progressEffectLabel,
} from '@/components/planning/daily-orientation-labels';

test('evidence states are readable Spanish labels while internal values stay unchanged', () => {
  assert.deepEqual(
    ['VERIFIED', 'SUPPORTED', 'DECLARED', 'PARTIAL', 'UNVERIFIED', 'CONFLICT', 'UNKNOWN'].map(
      (value) => evidenceStateLabel(value as Parameters<typeof evidenceStateLabel>[0]),
    ),
    [
      'Verificado',
      'Respaldado',
      'Declarado',
      'Parcial',
      'Sin verificar',
      'En conflicto',
      'Sin confirmar',
    ],
  );
});

test('progress effects and upcoming date types never show technical enum strings', () => {
  assert.deepEqual(
    ['none', 'possible', 'verified', 'conflict', 'unknown'].map((value) =>
      progressEffectLabel(value as Parameters<typeof progressEffectLabel>[0]),
    ),
    [
      'Sin cambio de progreso',
      'Avance posible',
      'Avance verificado',
      'Avance en conflicto',
      'Avance sin confirmar',
    ],
  );
  assert.deepEqual(
    ['deadline', 'target', 'review', 'event', 'assessment', 'unknown'].map((value) =>
      dateTypeLabel(value as Parameters<typeof dateTypeLabel>[0]),
    ),
    ['Fecha límite', 'Fecha objetivo', 'Revisión', 'Evento', 'Evaluación', 'Tipo por confirmar'],
  );
});

test('life-signal levels are translated for the planning view', () => {
  assert.deepEqual(
    ['normal', 'notice', 'candidate-pattern', 'unknown'].map((value) =>
      lifeSignalLevelLabel(value as Parameters<typeof lifeSignalLevelLabel>[0]),
    ),
    ['Normal', 'A observar', 'Posible patrón', 'Sin confirmar'],
  );
});
