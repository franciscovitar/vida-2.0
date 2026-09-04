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

test('PI-A1. todos los campos nuevos de Proyecto se parsean (schema real verificado)', () => {
  const page = {
    id: 'proj-1',
    properties: {
      [PROJECT_INTELLIGENCE_PROPS.title]: titleProp('Vida 2.0 web'),
      [PROJECT_INTELLIGENCE_PROPS.status]: selectProp('Activo'),
      [PROJECT_INTELLIGENCE_PROPS.type]: selectProp('Mejora de sistema'),
      [PROJECT_INTELLIGENCE_PROPS.definitionOfDone]: richProp('Dashboard usable en Production.'),
      [PROJECT_INTELLIGENCE_PROPS.lastAdvance]: dateProp('2026-07-30'),
      [PROJECT_INTELLIGENCE_PROPS.ownership]: richProp('vida2-web-01'),
      [PROJECT_INTELLIGENCE_PROPS.piRecommendation]: selectProp('Mantener activo'),
      [PROJECT_INTELLIGENCE_PROPS.piConfidence]: numberProp(0.8),
      [PROJECT_INTELLIGENCE_PROPS.piReviewedAt]: dateProp('2026-07-18'),
      [PROJECT_INTELLIGENCE_PROPS.piSummary]: richProp('Proyecto activo, sin bloqueos.'),
    },
  };

  const project = adaptProjectIntelligenceBase(page);
  assert.equal(project.name, 'Vida 2.0 web');
  assert.equal(project.status, 'Activo');
  assert.equal(project.type, 'Mejora de sistema');
  assert.equal(project.definitionOfDone, 'Dashboard usable en Production.');
  assert.equal(project.lastAdvance, '2026-07-30');
  assert.equal(project.ownership, 'vida2-web-01');
  assert.equal(project.piRecommendation, 'Mantener activo');
  assert.equal(project.piConfidence, 0.8);
  assert.equal(project.piReviewedAt, '2026-07-18');
  assert.equal(project.piSummary, 'Proyecto activo, sin bloqueos.');
});

test('PI-A2. campos opcionales ausentes quedan en null; Estado ausente NO se convierte en Activo', () => {
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
  assert.deepEqual(project.nextActionTaskIds, []);
  // Estado ausente/no reconocido queda null: el ensamblado decide fallar
  // cerrado, el adaptador nunca fabrica 'Activo'.
  assert.equal(project.status, null);
});

test('PI-A2b. Estado con valor no reconocido también queda null, no se asume Activo', () => {
  const page = {
    id: 'proj-2b',
    properties: {
      [PROJECT_INTELLIGENCE_PROPS.title]: titleProp('Estado inventado'),
      [PROJECT_INTELLIGENCE_PROPS.status]: selectProp('En curso'),
    },
  };
  const project = adaptProjectIntelligenceBase(page);
  assert.equal(project.status, null);
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

test('PI-A4. PI Confianza es NUMBER: se preserva como número, no como texto', () => {
  const page = {
    id: 'proj-4',
    properties: {
      [PROJECT_INTELLIGENCE_PROPS.title]: titleProp('Confianza numérica'),
      [PROJECT_INTELLIGENCE_PROPS.piConfidence]: numberProp(0.8),
    },
  };
  const project = adaptProjectIntelligenceBase(page);
  assert.equal(project.piConfidence, 0.8);
  assert.equal(typeof project.piConfidence, 'number');
});

test('PI-A5. Último avance es DATE', () => {
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

test('PI-A5b. Tipo con valor no reconocido queda null (enum cerrado)', () => {
  const page = {
    id: 'proj-5b',
    properties: {
      [PROJECT_INTELLIGENCE_PROPS.title]: titleProp('Tipo inventado'),
      [PROJECT_INTELLIGENCE_PROPS.type]: selectProp('Producto'),
    },
  };
  const project = adaptProjectIntelligenceBase(page);
  assert.equal(project.type, null);
});

test('PI-A5c. PI Recomendación con valor no reconocido queda null (enum cerrado)', () => {
  const page = {
    id: 'proj-5c',
    properties: {
      [PROJECT_INTELLIGENCE_PROPS.title]: titleProp('Recomendación inventada'),
      [PROJECT_INTELLIGENCE_PROPS.piRecommendation]: selectProp('Continuar'),
    },
  };
  const project = adaptProjectIntelligenceBase(page);
  assert.equal(project.piRecommendation, null);
});

test('PI-A5d. Próxima acción es RELATION: se extraen los IDs crudos, no texto', () => {
  const page = {
    id: 'proj-5d',
    properties: {
      [PROJECT_INTELLIGENCE_PROPS.title]: titleProp('Con próxima acción'),
      [PROJECT_INTELLIGENCE_PROPS.nextAction]: relationProp(['task-1']),
    },
  };
  const project = adaptProjectIntelligenceBase(page);
  assert.deepEqual(project.nextActionTaskIds, ['task-1']);
});

test('PI-A5e. Próxima acción con múltiples relaciones conserva todos los IDs crudos (el ensamblado decide)', () => {
  const page = {
    id: 'proj-5e',
    properties: {
      [PROJECT_INTELLIGENCE_PROPS.title]: titleProp('Múltiples próximas acciones'),
      [PROJECT_INTELLIGENCE_PROPS.nextAction]: relationProp(['task-1', 'task-2']),
    },
  };
  const project = adaptProjectIntelligenceBase(page);
  assert.deepEqual(project.nextActionTaskIds, ['task-1', 'task-2']);
});

test('PI-A6. relación de hito a proyecto se parsea; Estado usa el enum real de Hitos', () => {
  const page = {
    id: 'milestone-1',
    properties: {
      [MILESTONE_PROPS.title]: titleProp('Diseño de datos'),
      [MILESTONE_PROPS.project]: relationProp(['proj-1']),
      [MILESTONE_PROPS.status]: selectProp('Hecho'),
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
  assert.equal(milestone.status, 'Hecho');
  assert.equal(milestone.weight, 20);
  assert.equal(milestone.completionCriteria, 'DTO revisado y testeado.');
  assert.equal(milestone.evidence, 'PR #10 mergeado.');
  assert.equal(milestone.order, 1);
  assert.equal(milestone.completedAt, '2026-07-10');
  assert.equal(milestone.ownership, 'vida2-milestone-01');
});

test('PI-A6b. "Completado" (convención de Proyecto, NO de Hito) es rechazado por el adaptador de Hitos', () => {
  const page = {
    id: 'milestone-1b',
    properties: {
      [MILESTONE_PROPS.title]: titleProp('Hito con estado equivocado'),
      [MILESTONE_PROPS.status]: selectProp('Completado'),
    },
  };
  const milestone = adaptMilestone(page);
  assert.equal(milestone.status, null);
});

test('PI-A6c. cada estado real de Hito se parsea tal cual (Pendiente, En progreso, Hecho, Descartado)', () => {
  for (const status of ['Pendiente', 'En progreso', 'Hecho', 'Descartado']) {
    const milestone = adaptMilestone({
      id: `m-${status}`,
      properties: {
        [MILESTONE_PROPS.title]: titleProp('Hito'),
        [MILESTONE_PROPS.status]: selectProp(status),
      },
    });
    assert.equal(milestone.status, status);
  }
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
