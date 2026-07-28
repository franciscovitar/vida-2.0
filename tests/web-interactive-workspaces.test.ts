import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();

function source(...parts: string[]): string {
  return readFileSync(path.join(root, ...parts), 'utf8');
}

const tasks = source('components', 'tasks', 'TaskPlanningWorkspace.tsx');
const taskStyles = source('components', 'tasks', 'TaskPlanningWorkspace.module.scss');
const projects = source('components', 'projects', 'ProjectReviewWorkspace.tsx');
const projectStyles = source('components', 'projects', 'ProjectReviewWorkspace.module.scss');
const inbox = source('components', 'inbox', 'InboxPlanningWorkspace.tsx');
const inboxStyles = source('components', 'inbox', 'InboxPlanningWorkspace.module.scss');
const reviews = source('components', 'reviews', 'ReviewWorkspace.tsx');
const reviewStyles = source('components', 'reviews', 'ReviewWorkspace.module.scss');

test('B1-WEB-1. planificación de tareas no ejecuta escrituras', () => {
  assert.equal(tasks.includes('runWriteAction'), false);
  assert.equal(tasks.includes('@/app/actions/writes'), false);
  assert.match(tasks, /No se escribió ningún dato externo/);
});

test('B1-WEB-2. borrador de tarea usa datos reales y campos contractuales', () => {
  assert.match(tasks, /tasks: readonly NotionTask\[\]/);
  assert.match(tasks, /projects: readonly NotionProject\[\]/);
  assert.match(tasks, /areas: readonly NotionArea\[\]/);
  assert.match(tasks, /type="date"/);
  assert.match(tasks, /Duración/);
  assert.match(tasks, /Energía/);
  assert.match(tasks, /Proyecto opcional/);
});

test('B1-WEB-3. revisión de tareas conserva estado actual y propuesta separada', () => {
  assert.match(tasks, /currentStatus: selectedTask\.status/);
  assert.match(tasks, /nextStatus/);
  assert.match(tasks, /Estado actual/);
  assert.match(tasks, /Preparar cambio/);
});

test('B1-WEB-4. revisión de proyectos es local y exige próxima acción o bloqueo', () => {
  assert.equal(projects.includes('runWriteAction'), false);
  assert.match(projects, /decision === 'continue' && !nextAction\.trim\(\)/);
  assert.match(projects, /decision === 'block' && !blocker\.trim\(\)/);
  assert.match(projects, /Próxima revisión/);
});

test('B1-WEB-5. bandeja valida HTTPS y mantiene cola temporal', () => {
  assert.equal(inbox.includes('runWriteAction'), false);
  assert.match(inbox, /new URL\(value\)\.protocol === 'https:'/);
  assert.match(inbox, /Captura agregada a la cola local/);
  assert.match(inbox, /reviewed: !item\.reviewed/);
});

test('B1-WEB-6. centro de revisión no aprueba ni rechaza propuestas reales', () => {
  assert.equal(reviews.includes('runWriteAction'), false);
  assert.equal(reviews.includes('proposal.approve'), false);
  assert.equal(reviews.includes('proposal.reject'), false);
  assert.match(reviews, /Recomendar aprobación/);
  assert.match(reviews, /Pedir más información/);
});

test('B1-WEB-7. revisiones documentan riesgo y reversibilidad', () => {
  assert.match(reviews, /risk: ReviewRisk/);
  assert.match(reviews, /reversible: boolean/);
  assert.match(reviews, /El cambio puede revertirse sin pérdida de información/);
  assert.match(reviews, /Cambio esperado/);
});

test('B1-WEB-8. las cuatro rutas usan los nuevos workspaces locales', () => {
  const taskPage = source('app', '(app)', 'tareas', 'page.tsx');
  const projectPage = source('app', '(app)', 'proyectos', 'page.tsx');
  const inboxPage = source('app', '(app)', 'bandeja', 'page.tsx');
  const reviewPage = source('app', '(app)', 'aprobaciones', 'page.tsx');

  assert.match(taskPage, /TaskPlanningWorkspace/);
  assert.match(taskPage, /TaskCreatePanel/);
  assert.match(taskPage, /TaskStatusPanel/);
  assert.match(projectPage, /ProjectReviewWorkspace/);
  assert.match(inboxPage, /InboxPlanningWorkspace/);
  assert.match(inboxPage, /InboxCapturePanel/);
  assert.equal(inboxPage.includes('QuickInbox'), false);
  assert.match(reviewPage, /ReviewWorkspace/);
  assert.match(reviewPage, /ApprovalsPanel/);
  assert.match(reviewPage, /CalendarHoldPanel/);
});

test('B1-WEB-9. controles móviles respetan targets táctiles de 44 px', () => {
  for (const styles of [taskStyles, projectStyles, inboxStyles, reviewStyles]) {
    assert.match(styles, /min-height: 44px/);
    assert.equal(styles.includes('overflow-x: scroll'), false);
  }
});

test('B1-WEB-10. todos los workspaces declaran el límite de no persistencia', () => {
  for (const component of [tasks, projects, inbox, reviews]) {
    assert.match(component, /No se escribió ningún dato externo/);
  }
});
