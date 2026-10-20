import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSessionContinuityView } from '@/lib/session-continuity/view';
import type {
  AssessmentProgressRead,
  AssessmentProgressSnapshot,
} from '@/types/assessment-progress';
import type {
  ProjectsIntelligenceData,
  ProjectsIntelligenceProject,
} from '@/types/projects-intelligence';
import type { NotionTask } from '@/types/notion';

const NOW = new Date('2026-10-20T12:00:00Z');
type ProjectOverrides = Omit<Partial<ProjectsIntelligenceProject>, 'quality'> & {
  quality?: Partial<ProjectsIntelligenceProject['quality']>;
};
const task = (changes: Partial<NotionTask> = {}): NotionTask => ({
  id: 'task-1',
  title: 'Enviar prompt a Codex',
  status: 'Pendiente',
  date: null,
  dateKind: 'none',
  priority: null,
  duration: null,
  energy: null,
  project: { id: 'project-1', name: null, available: true },
  area: null,
  projectArea: null,
  blocker: null,
  note: null,
  domain: 'projects',
  ...changes,
});
function portfolio(
  changes: ProjectOverrides = {},
  status: ProjectsIntelligenceData['status'] = 'ready',
) {
  const p: ProjectsIntelligenceProject = {
    id: 'project-1',
    name: 'Proyecto técnico',
    status: 'Activo',
    lastAdvance: '2026-10-19',
    type: null,
    area: null,
    expectedResult: null,
    definitionOfDone: null,
    dueDate: null,
    reviewDate: null,
    ownership: null,
    piRecommendation: null,
    piConfidence: null,
    piReviewedAt: null,
    piSummary: null,
    relatedTaskCount: 1,
    openTaskCount: 1,
    blockedTaskCount: 0,
    blocker: null,
    nextAction: { id: 'task-1', name: 'Enviar prompt a Codex', available: true },
    relatedTasks: [task()],
    milestones: [],
    progress: { measurable: false, reason: 'no-milestones' },
    ...changes,
    quality: {
      missingDefinitionOfDone: false,
      missingNextAction: false,
      blocked: false,
      staleReview: false,
      stalePiSnapshot: false,
      invalidMilestones: false,
      progressMeasurable: false,
      multipleNextActionCandidates: false,
      ...changes.quality,
    },
  };
  return {
    source: 'notion',
    status,
    notice: null,
    syncedAt: '2026-10-20T12:00:00Z',
    targetDate: '2026-10-20',
    projects: [p],
    summary: {
      total: 1,
      active: 1,
      waiting: 0,
      blocked: 0,
      completed: 0,
      cancelled: 0,
      progressMeasurable: 0,
      progressUnmeasurable: 1,
      withoutNextAction: 0,
      withoutDefinitionOfDone: 1,
    },
    quality: {
      missingDefinitionOfDone: 1,
      missingNextAction: 0,
      blocked: 0,
      staleReview: 0,
      stalePiSnapshot: 0,
      invalidMilestones: 0,
      multipleNextActionCandidates: 0,
    },
  } satisfies ProjectsIntelligenceData;
}
function academic(
  changes: Record<string, unknown> = {},
  status: AssessmentProgressRead['status'] = 'ready',
) {
  const s = {
    assessmentId: 'iop-p2',
    subjectId: 'IOP',
    generatedAt: '2026-10-19T20:00:00-03:00',
    payload: {
      name: 'Parcial 2',
      status: 'active',
      nextBestActivity: 'Resolver un ejercicio nuevo',
    },
    ...changes,
  } as AssessmentProgressSnapshot;
  return { status, snapshots: [s], notice: null, invalidRows: 0 } as AssessmentProgressRead;
}

test('source-owned next steps are displayed but never counted as completed achievements', () => {
  const v = buildSessionContinuityView(portfolio(), academic(), NOW);
  assert.equal(v.projects[0].nextAction, 'Enviar prompt a Codex');
  assert.equal(v.academic[0].nextAction, 'Resolver un ejercicio nuevo');
  assert.ok(!('lastResult' in v.projects[0]));
  assert.equal(v.projects[0].state, 'ready');
});

test('Notion unavailable is not a confirmed empty project list', () => {
  const v = buildSessionContinuityView(portfolio({}, 'auth-error'), academic(), NOW);
  assert.equal(v.projectSource, 'unavailable');
  assert.deepEqual(v.projects, []);
  assert.equal(v.academic.length, 1);
});

test('only one valid related, still-open task is accepted', () => {
  for (const related of [
    task({ status: 'Hecha' }),
    task({ project: { id: 'other-project', name: null, available: true } }),
  ]) {
    const v = buildSessionContinuityView(portfolio({ relatedTasks: [related] }), academic(), NOW);
    assert.equal(v.projects[0].state, 'conflict');
    assert.equal(v.projects[0].nextAction, null);
  }
});

test('multiple next action candidates are explicitly conflicted', () => {
  const v = buildSessionContinuityView(
    portfolio({ quality: { multipleNextActionCandidates: true } }),
    academic(),
    NOW,
  );
  assert.equal(v.projects[0].state, 'conflict');
});

test('last progress is not silently refreshed by reading a stale project', () => {
  const v = buildSessionContinuityView(portfolio({ lastAdvance: '2026-09-15' }), academic(), NOW);
  assert.equal(v.projects[0].state, 'stale');
  assert.equal(v.projects[0].nextAction, 'Enviar prompt a Codex');
});

test('a closed project is excluded, rather than offered as pending work', () => {
  assert.equal(
    buildSessionContinuityView(portfolio({ status: 'Completado' }), academic(), NOW).projects
      .length,
    0,
  );
});

test('degraded assessment input never appears fully verified', () => {
  const v = buildSessionContinuityView(portfolio(), academic({}, 'degraded'), NOW);
  assert.equal(v.academicSource, 'degraded');
  assert.equal(v.academic[0].state, 'degraded');
});

test('stale academic evidence stays stale even if fetched today', () => {
  const v = buildSessionContinuityView(
    portfolio(),
    academic({ generatedAt: '2026-09-17T09:00:00Z' }),
    NOW,
  );
  assert.equal(v.academic[0].state, 'stale');
});

test('unavailable academic source never invents pending study', () => {
  const v = buildSessionContinuityView(portfolio(), academic({}, 'invalid'), NOW);
  assert.equal(v.academicSource, 'unavailable');
  assert.deepEqual(v.academic, []);
});

test('missing nextBestActivity is unknown, not freeform inferred text', () => {
  const v = buildSessionContinuityView(
    portfolio(),
    academic({
      payload: { name: 'Parcial 2', status: 'active', nextBestActivity: null },
    }),
    NOW,
  );
  assert.equal(v.academic[0].nextAction, null);
  assert.equal(v.academic[0].state, 'unavailable');
});

test('future project progress date is not marked as current', () => {
  const v = buildSessionContinuityView(portfolio({ lastAdvance: '2026-10-21' }), academic(), NOW);
  assert.equal(v.projects[0].state, 'stale');
  assert.equal(v.projects[0].nextAction, 'Enviar prompt a Codex');
});

test('future academic generatedAt is not marked as current', () => {
  const v = buildSessionContinuityView(
    portfolio(),
    academic({ generatedAt: '2026-10-21T12:00:00Z' }),
    NOW,
  );
  assert.equal(v.academic[0].state, 'stale');
});

test('malformed civil date and academic offsetless timestamp are not fresh', () => {
  const v = buildSessionContinuityView(
    portfolio({ lastAdvance: '2026-02-30' }),
    academic({ generatedAt: '2026-10-19T20:00:00' }),
    NOW,
  );
  assert.equal(v.projects[0].state, 'stale');
  assert.equal(v.academic[0].state, 'stale');
});

test('recent legitimate source dates remain usable', () => {
  const v = buildSessionContinuityView(portfolio(), academic(), NOW);
  assert.equal(v.projects[0].state, 'ready');
  assert.equal(v.academic[0].state, 'ready');
});

test('missing linked task with a blocker is not mislabelled as a registered step', () => {
  const v = buildSessionContinuityView(
    portfolio({ relatedTasks: [], blocker: 'Falta acceso' }),
    academic(),
    NOW,
  );
  assert.equal(v.projects[0].state, 'unavailable');
  assert.equal(v.projects[0].nextAction, null);
  assert.equal(v.projects[0].blocker, 'Falta acceso');
});

test('relation unavailable with a blocker remains a missing step', () => {
  const v = buildSessionContinuityView(
    portfolio({
      nextAction: { id: 'task-1', name: null, available: false },
      blocker: 'Esperar aprobación',
    }),
    academic(),
    NOW,
  );
  assert.equal(v.projects[0].state, 'unavailable');
  assert.equal(v.projects[0].nextAction, null);
});

test('blocker-only project does not claim a verified next action', () => {
  const v = buildSessionContinuityView(
    portfolio({ nextAction: null, blocker: 'Esperar al proveedor' }),
    academic(),
    NOW,
  );
  assert.equal(v.projects[0].state, 'unavailable');
  assert.equal(v.projects[0].blocker, 'Esperar al proveedor');
});

test('degraded academic source without a next step is unavailable, not a registered action', () => {
  const v = buildSessionContinuityView(
    portfolio(),
    academic(
      {
        payload: { name: 'Parcial 2', status: 'active', nextBestActivity: null },
      },
      'degraded',
    ),
    NOW,
  );
  assert.equal(v.academic[0].state, 'unavailable');
  assert.equal(v.academic[0].nextAction, null);
});
