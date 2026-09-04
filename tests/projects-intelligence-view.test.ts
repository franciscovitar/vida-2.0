/**
 * Tests del modelo de vista puro de Projects Intelligence (`/proyectos`, UI V1).
 * Cubre agrupación determinista, progreso, próxima acción, snapshot PI,
 * calidad de datos y el camino fail-closed. Sin JSX: se prueba el
 * ensamblado de datos que consume el componente, no el renderizado.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildNextActionView,
  buildProjectsIntelligenceView,
  NEXT_ACTION_MISSING_LABEL,
  NEXT_ACTION_UNRESOLVED_LABEL,
  PROGRESS_VERIFIED_LABEL,
} from '@/lib/projects/intelligence-view';
import type { NotionRelation, NotionTask } from '@/types/notion';
import type {
  ProjectsIntelligenceData,
  ProjectsIntelligenceMilestone,
  ProjectsIntelligenceProject,
  ProjectsIntelligenceProjectQuality,
  ProjectsIntelligenceQualitySummary,
  ProjectsIntelligenceSummary,
} from '@/types/projects-intelligence';

const TODAY = '2026-09-04';
const SYNCED_AT = `${TODAY}T12:00:00.000Z`;

function emptyQuality(overrides: Partial<ProjectsIntelligenceProjectQuality> = {}) {
  const quality: ProjectsIntelligenceProjectQuality = {
    missingDefinitionOfDone: false,
    missingNextAction: false,
    blocked: false,
    staleReview: false,
    stalePiSnapshot: false,
    invalidMilestones: false,
    progressMeasurable: true,
    multipleNextActionCandidates: false,
    ...overrides,
  };
  return quality;
}

function milestone(
  overrides: Partial<ProjectsIntelligenceMilestone>,
): ProjectsIntelligenceMilestone {
  return {
    id: 'm-1',
    name: 'Hito',
    projectId: 'proj-1',
    status: 'Pendiente',
    weight: 0,
    completionCriteria: null,
    evidence: null,
    order: null,
    completedAt: null,
    ownership: null,
    ...overrides,
  };
}

function project(
  overrides: Partial<ProjectsIntelligenceProject> = {},
): ProjectsIntelligenceProject {
  return {
    id: 'proj-1',
    name: 'Proyecto fixture',
    status: 'Activo',
    type: null,
    area: null,
    expectedResult: null,
    definitionOfDone: null,
    nextAction: null,
    lastAdvance: null,
    blocker: null,
    dueDate: null,
    reviewDate: null,
    ownership: null,
    piRecommendation: null,
    piConfidence: null,
    piReviewedAt: null,
    piSummary: null,
    relatedTaskCount: 0,
    openTaskCount: 0,
    blockedTaskCount: 0,
    relatedTasks: [] as readonly NotionTask[],
    milestones: [],
    progress: { measurable: false, reason: 'no-milestones' },
    quality: emptyQuality(),
    ...overrides,
  };
}

function emptySummary(): ProjectsIntelligenceSummary {
  return {
    total: 0,
    active: 0,
    waiting: 0,
    blocked: 0,
    completed: 0,
    cancelled: 0,
    progressMeasurable: 0,
    progressUnmeasurable: 0,
    withoutNextAction: 0,
    withoutDefinitionOfDone: 0,
  };
}

function emptyQualitySummary(): ProjectsIntelligenceQualitySummary {
  return {
    missingDefinitionOfDone: 0,
    missingNextAction: 0,
    blocked: 0,
    staleReview: 0,
    stalePiSnapshot: 0,
    invalidMilestones: 0,
    multipleNextActionCandidates: 0,
  };
}

function dataFixture(
  projects: ProjectsIntelligenceProject[],
  overrides: Partial<ProjectsIntelligenceData> = {},
): ProjectsIntelligenceData {
  return {
    source: 'notion',
    status: projects.length === 0 ? 'empty' : 'ready',
    notice: null,
    syncedAt: SYNCED_AT,
    targetDate: TODAY,
    projects,
    summary: emptySummary(),
    quality: emptyQualitySummary(),
    ...overrides,
  };
}

test('PI-V1. READY con hitos canónicos: 45% exacto, hitos y próxima acción visibles', () => {
  const milestones: ProjectsIntelligenceMilestone[] = [
    milestone({ id: 'm1', name: 'Hito 1', status: 'Hecho', weight: 20, order: 1 }),
    milestone({ id: 'm2', name: 'Hito 2', status: 'Hecho', weight: 25, order: 2 }),
    milestone({ id: 'm3', name: 'Hito 3', status: 'Pendiente', weight: 15, order: 3 }),
    milestone({ id: 'm4', name: 'Hito 4', status: 'Pendiente', weight: 15, order: 4 }),
    milestone({ id: 'm5', name: 'Hito 5', status: 'Pendiente', weight: 15, order: 5 }),
    milestone({ id: 'm6', name: 'Hito 6', status: 'Pendiente', weight: 10, order: 6 }),
  ];
  const nextAction: NotionRelation = { id: 't-1', name: 'Escribir el resumen', available: true };
  const active = project({
    id: 'proj-active',
    name: 'Proyecto activo',
    status: 'Activo',
    milestones,
    nextAction,
    progress: { measurable: true, percent: 45, completedWeight: 45, totalWeight: 100 },
  });

  const view = buildProjectsIntelligenceView(dataFixture([active]));

  assert.equal(view.ready, true);
  assert.equal(view.focus.length, 1);
  const card = view.focus[0];
  assert.equal(card.progress.measurable, true);
  assert.equal(card.progress.percent, 45);
  assert.equal(card.progress.percentLabel, '45%');
  assert.equal(card.progress.reasonLabel, null);
  assert.equal(card.milestones.length, 6);
  assert.equal(card.nextAction.kind, 'resolved');
  assert.equal(card.nextAction.label, 'Escribir el resumen');

  // Nunca se presenta el progreso verificado como estimación.
  assert.doesNotMatch(PROGRESS_VERIFIED_LABEL.toLowerCase(), /estimad|aproximad/);
});

test('PI-V2. Progreso no medible: nunca se degrada a 0%', () => {
  const noMilestones = project({ progress: { measurable: false, reason: 'no-milestones' } });
  const view = buildProjectsIntelligenceView(dataFixture([noMilestones]));

  const card = view.focus[0];
  assert.equal(card.progress.measurable, false);
  assert.equal(card.progress.percent, null);
  assert.equal(card.progress.percentLabel, null);
  assert.equal(card.progress.reasonLabel, 'Sin hitos definidos');
});

test('PI-V3. Fail closed: sin proyectos simulados ni secciones pobladas', () => {
  const data = dataFixture([], {
    status: 'not-configured',
    notice: 'Projects Intelligence no está configurado. Sin datos disponibles.',
  });
  const view = buildProjectsIntelligenceView(data);

  assert.equal(view.ready, false);
  assert.equal(
    view.unavailableMessage,
    'Projects Intelligence no está configurado. Sin datos disponibles.',
  );
  assert.deepEqual(view.focus, []);
  assert.deepEqual(view.waiting, []);
  assert.deepEqual(view.blocked, []);
  assert.deepEqual(view.avoidForNow, []);
  assert.deepEqual(view.history, []);
});

test('PI-V3b. read-error también falla cerrado, sin proyectos', () => {
  const data = dataFixture([], {
    status: 'read-error',
    notice: 'No se pudieron leer los datos de Notion. Sin datos disponibles.',
  });
  const view = buildProjectsIntelligenceView(data);

  assert.equal(view.ready, false);
  assert.equal(view.focus.length, 0);
});

test('PI-V3c. empty es estado canónico utilizable y llega al estado vacío intencional', () => {
  const data = dataFixture([], {
    status: 'empty',
    notice: 'No hay proyectos en las bases canónicas para este momento.',
  });
  const view = buildProjectsIntelligenceView(data);

  assert.equal(view.ready, true);
  assert.equal(view.isEmpty, true);
  assert.equal(view.unavailableMessage, null);
  assert.deepEqual(view.focus, []);
  assert.deepEqual(view.waiting, []);
  assert.deepEqual(view.blocked, []);
  assert.deepEqual(view.avoidForNow, []);
  assert.deepEqual(view.history, []);
});

test('PI-V4. Snapshot PI: recomendación y resumen exactos, sin generación local', () => {
  const withSnapshot = project({
    id: 'proj-snap',
    piRecommendation: 'Hacer ahora',
    piSummary: 'Resumen persistido en Notion.',
    piConfidence: 0.8,
    piReviewedAt: '2026-08-01',
    quality: emptyQuality({ stalePiSnapshot: true }),
  });
  const withoutSnapshot = project({
    id: 'proj-nosnap',
    status: 'En espera',
    piRecommendation: null,
    piSummary: null,
    piConfidence: null,
    piReviewedAt: null,
  });

  const view = buildProjectsIntelligenceView(dataFixture([withSnapshot, withoutSnapshot]));

  const snapCard = view.focus.find((card) => card.id === 'proj-snap');
  assert.ok(snapCard);
  assert.equal(snapCard.pi.hasSnapshot, true);
  assert.equal(snapCard.pi.recommendation, 'Hacer ahora');
  assert.equal(snapCard.pi.summary, 'Resumen persistido en Notion.');
  assert.equal(snapCard.pi.confidence, 0.8);
  assert.equal(snapCard.pi.stale, true);

  const noSnapCard = view.waiting.find((card) => card.id === 'proj-nosnap');
  assert.ok(noSnapCard);
  assert.equal(noSnapCard.pi.hasSnapshot, false);
  assert.equal(noSnapCard.pi.recommendation, null);
});

test('PI-V5. Próxima acción: resuelta, no resoluble, ausente y múltiples candidatas', () => {
  const resolved: NotionRelation = { id: 't-1', name: 'Tarea real', available: true };
  const unresolved: NotionRelation = { id: 't-2', name: null, available: false };

  assert.deepEqual(buildNextActionView(resolved), { kind: 'resolved', label: 'Tarea real' });
  assert.deepEqual(buildNextActionView(unresolved), {
    kind: 'unresolved',
    label: NEXT_ACTION_UNRESOLVED_LABEL,
  });
  assert.deepEqual(buildNextActionView(null), {
    kind: 'missing',
    label: NEXT_ACTION_MISSING_LABEL,
  });

  const multiple = project({
    nextAction: resolved,
    quality: emptyQuality({ multipleNextActionCandidates: true }),
  });
  const view = buildProjectsIntelligenceView(dataFixture([multiple]));
  assert.equal(view.focus[0].quality.multipleNextActionCandidates, true);
});

test('PI-V6. En espera se agrupa aparte de En foco', () => {
  const active = project({ id: 'proj-active', status: 'Activo' });
  const waiting = project({ id: 'proj-waiting', status: 'En espera' });
  const view = buildProjectsIntelligenceView(dataFixture([active, waiting]));

  assert.deepEqual(
    view.focus.map((card) => card.id),
    ['proj-active'],
  );
  assert.deepEqual(
    view.waiting.map((card) => card.id),
    ['proj-waiting'],
  );
});

test('PI-V7. Completado y Cancelado van al historial, no al portfolio activo', () => {
  const done = project({ id: 'proj-done', status: 'Completado' });
  const cancelled = project({ id: 'proj-cancelled', status: 'Cancelado' });
  const view = buildProjectsIntelligenceView(dataFixture([done, cancelled]));

  assert.deepEqual(view.history.map((card) => card.id).sort(), ['proj-cancelled', 'proj-done']);
  assert.equal(view.focus.length, 0);
  assert.equal(view.waiting.length, 0);
});

test('PI-V8. Calidad del portfolio: conteos explícitos y mensaje calmo cuando todo está en cero', () => {
  const withIssues = dataFixture([project()], {
    quality: {
      missingDefinitionOfDone: 2,
      missingNextAction: 1,
      blocked: 0,
      staleReview: 3,
      stalePiSnapshot: 1,
      invalidMilestones: 0,
      multipleNextActionCandidates: 1,
    },
  });
  const view = buildProjectsIntelligenceView(withIssues);
  assert.equal(view.qualityAllClear, false);
  const rowsByKey = Object.fromEntries(view.qualityRows.map((row) => [row.key, row.count]));
  assert.equal(rowsByKey.missingDefinitionOfDone, 2);
  assert.equal(rowsByKey.staleReview, 3);
  // El conteo de bloqueados no se repite en la sección de calidad.
  assert.ok(!('blocked' in rowsByKey));

  const clean = buildProjectsIntelligenceView(dataFixture([project()]));
  assert.equal(clean.qualityAllClear, true);
});

test('PI-V9. Evitar por ahora solo incluye recomendaciones persistidas Esperar/Cancelar propuesto', () => {
  const wait = project({ id: 'proj-wait', piRecommendation: 'Esperar' });
  const cancelProposed = project({ id: 'proj-cancel', piRecommendation: 'Cancelar propuesto' });
  const keepActive = project({ id: 'proj-keep', piRecommendation: 'Mantener activo' });
  const view = buildProjectsIntelligenceView(dataFixture([wait, cancelProposed, keepActive]));

  assert.deepEqual(view.avoidForNow.map((card) => card.id).sort(), ['proj-cancel', 'proj-wait']);
});

test('PI-V10. Hitos: orden ascendente solo si todos declaran `order`, si no orden de origen', () => {
  const partialOrder = [
    milestone({ id: 'm1', name: 'Primero en origen', order: null }),
    milestone({ id: 'm2', name: 'Segundo en origen', order: 1 }),
  ];
  const fullOrder = [
    milestone({ id: 'm3', name: 'Va segundo', order: 2 }),
    milestone({ id: 'm4', name: 'Va primero', order: 1 }),
  ];

  const withPartial = project({ id: 'proj-partial', milestones: partialOrder });
  const withFull = project({ id: 'proj-full', milestones: fullOrder });
  const view = buildProjectsIntelligenceView(dataFixture([withPartial, withFull]));

  const partialCard = view.focus.find((card) => card.id === 'proj-partial');
  assert.deepEqual(
    partialCard?.milestones.map((m) => m.id),
    ['m1', 'm2'],
  );

  const fullCard = view.focus.find((card) => card.id === 'proj-full');
  assert.deepEqual(
    fullCard?.milestones.map((m) => m.id),
    ['m4', 'm3'],
  );
});
