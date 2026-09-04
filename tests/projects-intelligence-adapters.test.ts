import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MILESTONE_PROPS, PROJECT_INTELLIGENCE_PROPS } from '@/lib/notion/constants';
import {
  adaptMilestone,
  adaptProjectIntelligenceBase,
} from '@/lib/notion/projects-intelligence-adapters';

function titleProp(text: string) {
  return { type: 'title', title: [{ plain_text: text }] };
}

function richProp(text: string | null) {
  return { type: 'rich_text', rich_text: text ? [{ plain_text: text }] : [] };
}

function selectProp(name: string) {
  return { type: 'select', select: { name } };
}

function dateProp(start: string | null) {
  return { type: 'date', date: start ? { start } : null };
}

function relationProp(ids: string[]) {
  return { type: 'relation', relation: ids.map((id) => ({ id })) };
}

function numberProp(value: number | null) {
  return { type: 'number', number: value };
}

test('PI-A1. todos los campos nuevos de Proyecto se parsean', () => {
  const page = {
    id: 'proj-1',
    properties: {
      [PROJECT_INTELLIGENCE_PROPS.title]: titleProp('Vida 2.0 web'),
      [PROJECT_INTELLIGENCE_PROPS.status]: selectProp('Activo'),
      [PROJECT_INTELLIGENCE_PROPS.type]: selectProp('Producto'),
      [PROJECT_INTELLIGENCE_PROPS.definitionOfDone]: richProp('Dashboard usable en Production.'),
      [PROJECT_INTELLIGENCE_PROPS.lastAdvance]: richProp('Se cerró el adaptador de hitos.'),
      [PROJECT_INTELLIGENCE_PROPS.ownership]: richProp('vida2-web-01'),
      [PROJECT_INTELLIGENCE_PROPS.piRecommendation]: richProp('Continuar: próxima acción clara.'),
      [PROJECT_INTELLIGENCE_PROPS.piConfidence]: richProp('Alta'),
      [PROJECT_INTELLIGENCE_PROPS.piReviewedAt]: dateProp('2026-07-18'),
      [PROJECT_INTELLIGENCE_PROPS.piSummary]: richProp('Proyecto activo, sin bloqueos.'),
    },
  };

  const project = adaptProjectIntelligenceBase(page);
  assert.equal(project.name, 'Vida 2.0 web');
  assert.equal(project.status, 'Activo');
  assert.equal(project.type, 'Producto');
  assert.equal(project.definitionOfDone, 'Dashboard usable en Production.');
  assert.equal(project.lastAdvance, 'Se cerró el adaptador de hitos.');
  assert.equal(project.ownership, 'vida2-web-01');
  assert.equal(project.piRecommendation, 'Continuar: próxima acción clara.');
  assert.equal(project.piConfidence, 'Alta');
  assert.equal(project.piReviewedAt, '2026-07-18');
  assert.equal(project.piSummary, 'Proyecto activo, sin bloqueos.');
});

test('PI-A2. campos opcionales ausentes quedan en null', () => {
  const page = {
    id: 'proj-2',
    properties: {
      [PROJECT_INTELLIGENCE_PROPS.title]: titleProp('Proyecto mínimo'),
    },
  };

  const project = adaptProjectIntelligenceBase(page);
  assert.equal(project.type, null);
  assert.equal(project.definitionOfDone, null);
  assert.equal(project.lastAdvance, null);
  assert.equal(project.ownership, null);
  assert.equal(project.piRecommendation, null);
  assert.equal(project.piConfidence, null);
  assert.equal(project.piReviewedAt, null);
  assert.equal(project.piSummary, null);
  assert.equal(project.area, null);
  // Estado desconocido/ausente cae al default seguro, igual que el adaptador genérico.
  assert.equal(project.status, 'Activo');
});

test('PI-A3. relación de Área no se resuelve (no se consulta Áreas)', () => {
  const page = {
    id: 'proj-3',
    properties: {
      [PROJECT_INTELLIGENCE_PROPS.title]: titleProp('Con área'),
      [PROJECT_INTELLIGENCE_PROPS.area]: relationProp(['area-1']),
    },
  };
  const project = adaptProjectIntelligenceBase(page);
  assert.ok(project.area);
  assert.equal(project.area?.id, 'area-1');
  assert.equal(project.area?.name, null);
  assert.equal(project.area?.available, false);
});

test('PI-A4. PI Confianza acepta forma numérica sin fabricar significado', () => {
  const page = {
    id: 'proj-4',
    properties: {
      [PROJECT_INTELLIGENCE_PROPS.title]: titleProp('Confianza numérica'),
      [PROJECT_INTELLIGENCE_PROPS.piConfidence]: numberProp(0.8),
    },
  };
  const project = adaptProjectIntelligenceBase(page);
  assert.equal(project.piConfidence, '0.8');
});

test('PI-A5. Último avance acepta forma de fecha si no hay texto', () => {
  const page = {
    id: 'proj-5',
    properties: {
      [PROJECT_INTELLIGENCE_PROPS.title]: titleProp('Avance por fecha'),
      [PROJECT_INTELLIGENCE_PROPS.lastAdvance]: dateProp('2026-07-30'),
    },
  };
  const project = adaptProjectIntelligenceBase(page);
  assert.equal(project.lastAdvance, '2026-07-30');
});

test('PI-A6. relación de hito a proyecto se parsea', () => {
  const page = {
    id: 'milestone-1',
    properties: {
      [MILESTONE_PROPS.title]: titleProp('Diseño de datos'),
      [MILESTONE_PROPS.project]: relationProp(['proj-1']),
      [MILESTONE_PROPS.status]: selectProp('Completado'),
      [MILESTONE_PROPS.weight]: numberProp(20),
      [MILESTONE_PROPS.completionCriteria]: richProp('DTO revisado y testeado.'),
      [MILESTONE_PROPS.evidence]: richProp('PR #10 mergeado.'),
      [MILESTONE_PROPS.order]: numberProp(1),
      [MILESTONE_PROPS.completedAt]: dateProp('2026-07-10'),
      [MILESTONE_PROPS.ownership]: richProp('vida2-milestone-01'),
    },
  };

  const milestone = adaptMilestone(page);
  assert.equal(milestone.name, 'Diseño de datos');
  assert.equal(milestone.projectId, 'proj-1');
  assert.equal(milestone.status, 'Completado');
  assert.equal(milestone.weight, 20);
  assert.equal(milestone.completionCriteria, 'DTO revisado y testeado.');
  assert.equal(milestone.evidence, 'PR #10 mergeado.');
  assert.equal(milestone.order, 1);
  assert.equal(milestone.completedAt, '2026-07-10');
  assert.equal(milestone.ownership, 'vida2-milestone-01');
});

test('PI-A7. hito sin relación de proyecto queda con projectId null', () => {
  const page = {
    id: 'milestone-2',
    properties: {
      [MILESTONE_PROPS.title]: titleProp('Hito huérfano'),
    },
  };
  const milestone = adaptMilestone(page);
  assert.equal(milestone.projectId, null);
});

test('PI-A8. peso de hito malformado no se coacciona a cero', () => {
  const missingWeight = adaptMilestone({
    id: 'milestone-3',
    properties: { [MILESTONE_PROPS.title]: titleProp('Sin peso') },
  });
  assert.equal(missingWeight.weight, null);

  const negativeWeight = adaptMilestone({
    id: 'milestone-4',
    properties: {
      [MILESTONE_PROPS.title]: titleProp('Peso negativo'),
      [MILESTONE_PROPS.weight]: numberProp(-5),
    },
  });
  // El valor crudo se preserva tal cual; la invalidez se evalúa en el cálculo de progreso.
  assert.equal(negativeWeight.weight, -5);
});

test('PI-A9. valores de snapshot PI se preservan, nunca se generan', () => {
  const withoutSnapshot = adaptProjectIntelligenceBase({
    id: 'proj-6',
    properties: { [PROJECT_INTELLIGENCE_PROPS.title]: titleProp('Sin snapshot PI') },
  });
  assert.equal(withoutSnapshot.piRecommendation, null);
  assert.equal(withoutSnapshot.piSummary, null);
  assert.equal(withoutSnapshot.piConfidence, null);
  assert.equal(withoutSnapshot.piReviewedAt, null);
});
