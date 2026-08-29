/**
 * Vía de mantenimiento legacy para el rollback inconsistente de `task.create`.
 *
 * Repara exactamente la huella del bug histórico (tarea `task.create` con
 * propuesta `rolled-back` pero todavía activa como «Algún día») mientras Safe
 * Writes está OFF, sin exponer target ni ownership al cliente y sin reactivar la
 * flag.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { buildWriteRuntime } from '@/lib/actions/runtime';
import {
  buildTaskRollbackMaintenanceDeps,
  inspectLegacyTaskRollbackRepair,
  repairSingleLegacyTaskCreateRollback,
  type TaskRollbackMaintenanceDeps,
} from '@/lib/actions/task-rollback-maintenance';
import type {
  NotionTaskWritePort,
  ProposalRepositoryPort,
  TaskSnapshot,
} from '@/lib/actions/ports';
import type { ActionProposalSummary } from '@/types/actions';

const OFF: Readonly<Record<string, string | undefined>> = { NODE_ENV: 'test' };
const ON: Readonly<Record<string, string | undefined>> = {
  NODE_ENV: 'test',
  WRITE_ACTIONS_ENABLED: 'true',
};

// Semillas distintivas para verificar que NADA de esto aparece en la salida.
const TARGET_KEY = 'task-SEED-TARGET-KEY';
const OWNERSHIP = 'own-SEED-DIGEST-000000000';
const PROPOSAL_KEY = 'prop-SEED-KEY';

function makeProposal(overrides: Partial<ActionProposalSummary> = {}): ActionProposalSummary {
  return {
    key: PROPOSAL_KEY,
    name: 'QA',
    actionType: 'task.create',
    targetType: 'task',
    targetKey: TARGET_KEY,
    status: 'rolled-back',
    confirmationMode: 'reinforced',
    risk: 'low',
    reversible: true,
    reason: 'qa',
    expectedChange: 'qa',
    beforeSummary: null,
    afterSummary: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    decidedAt: null,
    appliedAt: null,
    resultCode: 'rolled-back',
    expiresAt: null,
    executionStartedAt: null,
    rollbackDeadline: null,
    rolledBackAt: '2026-08-02T00:00:00.000Z',
    payloadDigest: null,
    contractVersion: 'vida2-writes-v1',
    source: 'web',
    beforeDigest: null,
    diff: null,
    encryptedPayloadKey: null,
    ownershipDigest: OWNERSHIP,
    ...overrides,
  };
}

function fakeProposals(rows: readonly ActionProposalSummary[]): ProposalRepositoryPort {
  return {
    async create() {
      throw new Error('no usado');
    },
    async get(key) {
      return rows.find((row) => row.key === key) ?? null;
    },
    async list(status) {
      return status ? rows.filter((row) => row.status === status) : [...rows];
    },
    async updateStatus() {
      throw new Error('el mantenimiento nunca toca el ledger');
    },
  };
}

type FakeTaskOptions = {
  snapshot?: TaskSnapshot | null;
  archiveResult?: { ok: true } | { ok: false; code: string; message: string };
  /** Si true, getTask sigue devolviendo la tarea aun tras un archive ok. */
  keepActiveAfterArchive?: boolean;
};

function fakeTaskPort(options: FakeTaskOptions = {}) {
  let snapshot = options.snapshot === undefined ? defaultSnapshot() : options.snapshot;
  const state = { archiveCalls: 0 };
  const port: NotionTaskWritePort = {
    async createTask() {
      return { ok: false, code: 'not-configured', message: 'no usado' };
    },
    async getTask() {
      return snapshot;
    },
    async updateTaskStatus() {
      return { ok: false, code: 'not-configured', message: 'no usado' };
    },
    async resolveAreaProjectCompatibility() {
      return { ok: false, message: 'no usado' };
    },
    async checkReady() {
      return { ok: false, code: 'not-configured', message: 'no usado' };
    },
    async archiveOwnedTask(_key, ownershipProof) {
      state.archiveCalls += 1;
      const result = options.archiveResult ?? { ok: true };
      if (result.ok && ownershipProof === OWNERSHIP && !options.keepActiveAfterArchive) {
        snapshot = null;
      }
      return result;
    },
  };
  return { port, state };
}

function defaultSnapshot(status = 'Algún día'): TaskSnapshot {
  return {
    key: TARGET_KEY,
    title: 'QA',
    status,
    areaKey: 'area-x',
    projectKey: null,
    projectAreaKey: null,
  };
}

function deps(
  proposals: ProposalRepositoryPort,
  tasks: NotionTaskWritePort,
): TaskRollbackMaintenanceDeps {
  return { proposals, tasks };
}

test('1. Safe Writes ON → blocked, cero I/O destructivo', async () => {
  const tasks = fakeTaskPort();
  const d = deps(fakeProposals([makeProposal()]), tasks.port);

  assert.deepEqual(await inspectLegacyTaskRollbackRepair(d, ON), { state: 'disabled' });
  const repair = await repairSingleLegacyTaskCreateRollback(d, ON);
  assert.deepEqual(repair, { ok: false, state: 'disabled', outcome: 'blocked' });
  assert.equal(tasks.state.archiveCalls, 0);
});

test('2. La Server Action verifica sesión antes de reparar', () => {
  const source = readFileSync(path.join(process.cwd(), 'app/actions/maintenance.ts'), 'utf8');
  assert.match(source, /^'use server';/);
  // Dentro de la Server Action de reparación: sesión ANTES de construir deps o reparar.
  const repairFn = source.slice(
    source.indexOf('export async function repairLegacyTaskRollbackAction'),
  );
  assert.ok(repairFn.length > 0);
  const sessionIdx = repairFn.indexOf('await verifySession()');
  const buildIdx = repairFn.indexOf('buildTaskRollbackMaintenanceDeps()');
  const repairIdx = repairFn.indexOf('repairSingleLegacyTaskCreateRollback(built.deps)');
  assert.ok(sessionIdx >= 0 && buildIdx > sessionIdx && repairIdx > sessionIdx);
  assert.match(source, /if \(!session\.ok\) return 'none';/);
  assert.match(source, /if \(!session\.ok\) return \{ ok: false, state: 'none' \}/);
  // No acepta identificadores de recurso desde el cliente.
  assert.equal(/proposalKey|taskKey|pageId|ownership|dataSourceId/.test(source), false);
});

test('3. Cero candidatos → none / no-op', async () => {
  const tasks = fakeTaskPort({ snapshot: null });
  const d = deps(fakeProposals([]), tasks.port);
  assert.deepEqual(await inspectLegacyTaskRollbackRepair(d, OFF), { state: 'none' });
  assert.deepEqual(await repairSingleLegacyTaskCreateRollback(d, OFF), {
    ok: true,
    state: 'none',
    outcome: 'already-consistent',
  });
  assert.equal(tasks.state.archiveCalls, 0);
});

test('4-5. Un candidato válido → archiva una vez y getTask queda null', async () => {
  const tasks = fakeTaskPort();
  const d = deps(fakeProposals([makeProposal()]), tasks.port);

  assert.deepEqual(await inspectLegacyTaskRollbackRepair(d, OFF), { state: 'repairable' });
  const repair = await repairSingleLegacyTaskCreateRollback(d, OFF);
  assert.deepEqual(repair, { ok: true, state: 'none', outcome: 'repaired' });
  assert.equal(tasks.state.archiveCalls, 1);
  assert.equal(await tasks.port.getTask(TARGET_KEY), null);
});

test('6. Candidato con status distinto de «Algún día» → no archive', async () => {
  const tasks = fakeTaskPort({ snapshot: defaultSnapshot('Pendiente') });
  const d = deps(fakeProposals([makeProposal()]), tasks.port);
  assert.deepEqual(await inspectLegacyTaskRollbackRepair(d, OFF), { state: 'requires-review' });
  const repair = await repairSingleLegacyTaskCreateRollback(d, OFF);
  assert.equal(repair.ok, false);
  assert.equal(repair.state, 'requires-review');
  assert.equal(tasks.state.archiveCalls, 0);
});

test('7. Ownership faltante en el ledger → no archive', async () => {
  const tasks = fakeTaskPort();
  const d = deps(fakeProposals([makeProposal({ ownershipDigest: null })]), tasks.port);
  assert.deepEqual(await inspectLegacyTaskRollbackRepair(d, OFF), { state: 'none' });
  const repair = await repairSingleLegacyTaskCreateRollback(d, OFF);
  assert.equal(repair.ok, true);
  assert.equal(repair.outcome, 'already-consistent');
  assert.equal(tasks.state.archiveCalls, 0);
});

test('8. actionType distinto de task.create → no archive', async () => {
  const tasks = fakeTaskPort();
  const d = deps(fakeProposals([makeProposal({ actionType: 'task.change-status' })]), tasks.port);
  assert.deepEqual(await inspectLegacyTaskRollbackRepair(d, OFF), { state: 'none' });
  assert.equal(tasks.state.archiveCalls, 0);
});

test('9. Propuesta no rolled-back → no archive', async () => {
  const tasks = fakeTaskPort();
  const d = deps(fakeProposals([makeProposal({ status: 'applied' })]), tasks.port);
  assert.deepEqual(await inspectLegacyTaskRollbackRepair(d, OFF), { state: 'none' });
  const repair = await repairSingleLegacyTaskCreateRollback(d, OFF);
  assert.equal(repair.outcome, 'already-consistent');
  assert.equal(tasks.state.archiveCalls, 0);
});

test('10. Más de una candidata → requires-review, cero archives', async () => {
  const tasks = fakeTaskPort();
  const d = deps(
    fakeProposals([
      makeProposal({ key: 'prop-a', targetKey: 'task-a' }),
      makeProposal({ key: 'prop-b', targetKey: 'task-b' }),
    ]),
    tasks.port,
  );
  assert.deepEqual(await inspectLegacyTaskRollbackRepair(d, OFF), { state: 'requires-review' });
  const repair = await repairSingleLegacyTaskCreateRollback(d, OFF);
  assert.deepEqual(repair, { ok: false, state: 'requires-review', outcome: 'blocked' });
  assert.equal(tasks.state.archiveCalls, 0);
});

test('11. archiveOwnedTask falla → repair falla', async () => {
  const tasks = fakeTaskPort({
    archiveResult: { ok: false, code: 'ownership-mismatch', message: 'x' },
  });
  const d = deps(fakeProposals([makeProposal()]), tasks.port);
  const repair = await repairSingleLegacyTaskCreateRollback(d, OFF);
  assert.deepEqual(repair, { ok: false, state: 'repairable', outcome: 'archive-failed' });
  assert.equal(tasks.state.archiveCalls, 1);
});

test('12. archive ok pero getTask sigue activo → verification-failed', async () => {
  const tasks = fakeTaskPort({ keepActiveAfterArchive: true });
  const d = deps(fakeProposals([makeProposal()]), tasks.port);
  const repair = await repairSingleLegacyTaskCreateRollback(d, OFF);
  assert.deepEqual(repair, { ok: false, state: 'repairable', outcome: 'verification-failed' });
});

test('13. Tarea ya ausente → coherente, sin segunda mutación', async () => {
  const tasks = fakeTaskPort({ snapshot: null });
  const d = deps(fakeProposals([makeProposal()]), tasks.port);
  assert.deepEqual(await inspectLegacyTaskRollbackRepair(d, OFF), { state: 'none' });
  const repair = await repairSingleLegacyTaskCreateRollback(d, OFF);
  assert.deepEqual(repair, { ok: true, state: 'none', outcome: 'already-consistent' });
  assert.equal(tasks.state.archiveCalls, 0);
});

test('14. La salida sanitizada no filtra target / proposal / ownership / IDs / token', async () => {
  const tasks = fakeTaskPort();
  const d = deps(fakeProposals([makeProposal()]), tasks.port);
  const inspect = JSON.stringify(await inspectLegacyTaskRollbackRepair(d, OFF));
  const repair = JSON.stringify(await repairSingleLegacyTaskCreateRollback(d, OFF));
  for (const secret of [TARGET_KEY, OWNERSHIP, PROPOSAL_KEY, 'task-', 'own-', 'prop-']) {
    assert.equal(inspect.includes(secret), false, `inspect: ${secret}`);
    assert.equal(repair.includes(secret), false, `repair: ${secret}`);
  }
  assert.deepEqual(JSON.parse(repair), { ok: true, state: 'none', outcome: 'repaired' });
});

const NOTION_ENV: Readonly<Record<string, string | undefined>> = {
  NODE_ENV: 'test',
  VERCEL_ENV: 'preview',
  NOTION_DATA_SOURCE: 'notion',
  NOTION_API_TOKEN: 'notion-token-test',
  NOTION_TASKS_DATA_SOURCE_ID: '20000000-0000-4000-8000-000000000001',
  NOTION_PROJECTS_DATA_SOURCE_ID: '20000000-0000-4000-8000-000000000002',
  NOTION_AREAS_DATA_SOURCE_ID: '20000000-0000-4000-8000-000000000003',
  NOTION_ACTIONS_DATA_SOURCE_ID: '20000000-0000-4000-8000-000000000004',
};

test('15. Builder Preview/Production usa Notion real, nunca memoria', () => {
  const built = buildTaskRollbackMaintenanceDeps(NOTION_ENV);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  // El puerto en memoria expondría `tasks` / `authorizedAreas`; el real no.
  assert.equal(Object.prototype.hasOwnProperty.call(built.deps.tasks, 'authorizedAreas'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(built.deps.tasks, 'tasks'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(built.deps.proposals, 'rows'), false);
});

test('15b. Builder rechaza con Safe Writes ON y exige configuración real', () => {
  assert.deepEqual(
    buildTaskRollbackMaintenanceDeps({ ...NOTION_ENV, WRITE_ACTIONS_ENABLED: 'true' }),
    {
      ok: false,
      state: 'disabled',
    },
  );
  assert.deepEqual(buildTaskRollbackMaintenanceDeps({ NODE_ENV: 'test' }), {
    ok: false,
    state: 'misconfigured',
  });
  assert.deepEqual(
    buildTaskRollbackMaintenanceDeps({ ...NOTION_ENV, NOTION_DATA_SOURCE: 'mock' }),
    { ok: false, state: 'misconfigured' },
  );
});

test('16. El flujo normal de Safe Writes permanece cerrado y sin cambios', async () => {
  const runtime = buildWriteRuntime({ NODE_ENV: 'production' });
  assert.equal(runtime.mode, 'closed');
  const archived = await runtime.handlers.tasks.archiveOwnedTask('x', 'y');
  assert.equal(archived.ok, false);

  const runtimeSource = readFileSync(path.join(process.cwd(), 'lib/actions/runtime.ts'), 'utf8');
  assert.equal(runtimeSource.includes('task-rollback-maintenance'), false);
});
