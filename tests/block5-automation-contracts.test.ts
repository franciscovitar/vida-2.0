/**
 * Bloque 5 — contratos, principales e intersección de permisos.
 * Sin I/O externo.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { createMemoryAuditSink } from '@/lib/actions/audit';
import { createMemoryIdempotencyStore } from '@/lib/actions/idempotency';
import { createMemoryProposalPort } from '@/lib/actions/memory-ports';
import { POST as postProposal } from '@/app/api/openclaw/v1/proposals/route';
import { GET as getProposal } from '@/app/api/openclaw/v1/proposals/[key]/route';
import {
  automationContractDoesNotEscalate,
  automationProposalSource,
  getAutomationPrincipalContract,
  getAutomationWorkflowContract,
  isAutomationProposalAllowed,
  isAutomationReadAllowed,
  listAutomationPrincipalContracts,
  listAutomationWorkflowContracts,
} from '@/lib/automations/contracts';
import { getAutomationWorkflowCredentials } from '@/lib/automations/credentials';
import { isAutomationsApiEnabled, isAutomationWorkflowEnabled } from '@/lib/automations/config';
import {
  buildCanonicalString,
  buildOpenClawReplayKeys,
  signCanonical,
  verifyOpenClawRequest,
} from '@/lib/openclaw/auth';
import { getOpenClawAgentCredentials } from '@/lib/openclaw/agents';
import { listOpenClawCapabilities } from '@/lib/openclaw/capabilities';
import { buildOpenClawLogEvent } from '@/lib/openclaw/observability';
import { createOpenClawProposal, isOpenClawProposalOwnedByAgent } from '@/lib/openclaw/proposals';
import { createMemoryOpenClawRateLimitPort } from '@/lib/openclaw/rate-limit';
import { AUTOMATION_PRINCIPAL_KEYS, AUTOMATION_WORKFLOW_KEYS } from '@/types/automations';

const PLANNING_KEY = 'workflow-planning-key';
const PLANNING_SECRET = 'workflow-planning-secret-value-32chars!!';
const BRIEFING_KEY = 'workflow-briefing-key';
const BRIEFING_SECRET = 'workflow-briefing-secret-value-32chars!!';
const TECHNICAL_KEY = 'workflow-technical-key';
const TECHNICAL_SECRET = 'workflow-technical-secret-value-32chars!!';

const AUTOMATION_ENV = {
  OPENCLAW_API_ENABLED: 'true',
  OPENCLAW_ACCESS_MODE: 'read-only',
  AUTOMATIONS_API_ENABLED: 'true',
  AUTOMATIONS_ACCESS_MODE: 'proposal-only',
  AUTOMATIONS_WORKFLOW_CONTRACT_VERSION: 'vida2-automations-v1',
  AUTOMATIONS_DAILY_BRIEFING_ENABLED: 'true',
  AUTOMATIONS_TECHNICAL_WATCHDOG_ENABLED: 'true',
  AUTOMATIONS_PLANNING_SUGGESTION_ENABLED: 'true',
  OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_KEY_ID: BRIEFING_KEY,
  OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_SECRET: BRIEFING_SECRET,
  OPENCLAW_AUTOMATION_TECHNICAL_WATCHDOG_API_KEY_ID: TECHNICAL_KEY,
  OPENCLAW_AUTOMATION_TECHNICAL_WATCHDOG_API_SECRET: TECHNICAL_SECRET,
  OPENCLAW_AUTOMATION_PLANNING_SUGGESTION_API_KEY_ID: PLANNING_KEY,
  OPENCLAW_AUTOMATION_PLANNING_SUGGESTION_API_SECRET: PLANNING_SECRET,
} as const;

async function withEnv<T>(
  env: Readonly<Record<string, string>>,
  run: () => Promise<T> | T,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function signedWorkflowRequest(input: {
  keyId: string;
  secret: string;
  method: string;
  pathname: string;
  rawBody?: string;
}) {
  const timestamp = String(Date.now());
  const requestId = `block5-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const rawBody = input.rawBody ?? '';
  return {
    keyId: input.keyId,
    timestamp,
    requestId,
    signature: signCanonical(
      input.secret,
      buildCanonicalString({
        timestamp,
        requestId,
        method: input.method,
        pathname: input.pathname,
        rawBody,
      }),
    ),
  };
}

test('block5 contracts: cinco workflows y seis principales congelados', () => {
  const workflows = listAutomationWorkflowContracts();
  const principals = listAutomationPrincipalContracts();

  assert.equal(workflows.length, 5);
  assert.equal(principals.length, 6);
  assert.equal(Object.isFrozen(AUTOMATION_WORKFLOW_KEYS), true);
  assert.equal(Object.isFrozen(AUTOMATION_PRINCIPAL_KEYS), true);
  assert.equal(Object.isFrozen(workflows), true);
  assert.equal(Object.isFrozen(principals), true);
  assert.equal(Object.isFrozen(workflows[0]), true);
  assert.equal(Object.isFrozen(workflows[0]?.allowedReads), true);
  assert.equal(Object.isFrozen(workflows[0]?.allowedProposals), true);
  assert.equal(Object.isFrozen(workflows[0]?.schedule), true);
  assert.equal(Object.isFrozen(workflows[0]?.retry), true);
  assert.equal(Object.isFrozen(workflows[0]?.retry.backoffSeconds), true);
  assert.equal(Object.isFrozen(workflows[0]?.retry.retryableStatusCodes), true);
  assert.equal(Object.isFrozen(workflows[0]?.prohibitedData), true);
  assert.equal(Object.isFrozen(principals[0]), true);
});

test('block5 contracts: ningún workflow amplía permisos del agente', () => {
  for (const principal of listAutomationPrincipalContracts()) {
    assert.equal(
      automationContractDoesNotEscalate(principal.principalKey),
      true,
      principal.principalKey,
    );
  }
});

test('block5 contracts: planificación solo puede leer tareas/agenda y proponer una tarea', () => {
  assert.equal(isAutomationReadAllowed('planning-suggestion', 'steward', 'tasks.list'), true);
  assert.equal(
    isAutomationReadAllowed('planning-suggestion', 'steward', 'calendar.upcoming'),
    true,
  );
  assert.equal(isAutomationReadAllowed('planning-suggestion', 'steward', 'projects.list'), false);
  assert.equal(
    isAutomationProposalAllowed('planning-suggestion', 'steward', 'task.create.propose'),
    true,
  );
  assert.equal(
    isAutomationProposalAllowed('planning-suggestion', 'steward', 'calendar.hold.create.propose'),
    false,
  );
});

test('block5 contracts: briefing y guardián no pueden crear propuestas', () => {
  assert.equal(getAutomationWorkflowContract('daily-briefing').allowedProposals.length, 0);
  assert.equal(getAutomationWorkflowContract('technical-watchdog').allowedProposals.length, 0);
  assert.equal(
    isAutomationReadAllowed('technical-watchdog', 'technical-guardian', 'technical.status'),
    true,
  );
  assert.equal(
    isAutomationReadAllowed('technical-watchdog', 'technical-guardian', 'tasks.list'),
    false,
  );
});

test('block5 credentials: ausencia es válida; par parcial falla cerrado', () => {
  const empty = getAutomationWorkflowCredentials({});
  assert.equal(empty.ok, true);
  if (empty.ok) assert.equal(empty.credentials.length, 0);

  const partial = getAutomationWorkflowCredentials({
    OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_KEY_ID: 'only-key',
  });
  assert.equal(partial.ok, false);
  if (!partial.ok) assert.equal(partial.reason, 'incomplete-credentials');
});

test('block5 credentials: key IDs duplicadas fallan cerrado', () => {
  const result = getAutomationWorkflowCredentials({
    OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_KEY_ID: 'same-key',
    OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_SECRET: 'secret-a',
    OPENCLAW_AUTOMATION_WEEKLY_REVIEW_API_KEY_ID: 'same-key',
    OPENCLAW_AUTOMATION_WEEKLY_REVIEW_API_SECRET: 'secret-b',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'duplicate-key-id');
});

test('block5 credentials: dos workflows del Mayordomo conservan principal distinto', () => {
  const result = getOpenClawAgentCredentials(AUTOMATION_ENV);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const briefing = result.credentials.find((row) => row.keyId === BRIEFING_KEY);
  const planning = result.credentials.find((row) => row.keyId === PLANNING_KEY);

  assert.equal(briefing?.agentId, 'steward');
  assert.equal(planning?.agentId, 'steward');
  assert.equal(briefing?.principalId, 'workflow:daily-briefing');
  assert.equal(planning?.principalId, 'workflow:planning-suggestion');
  assert.notEqual(briefing?.principalId, planning?.principalId);
});

test('block5 auth: firma resuelve principal y workflow server-side', () => {
  const timestamp = String(Date.now());
  const requestId = 'block5-planning-request';
  const pathname = '/api/openclaw/v1/read';
  const rawBody = JSON.stringify({
    operation: 'tasks.list',
    input: { limit: 5 },
  });
  const signature = signCanonical(
    PLANNING_SECRET,
    buildCanonicalString({
      timestamp,
      requestId,
      method: 'POST',
      pathname,
      rawBody,
    }),
  );

  const decision = verifyOpenClawRequest({
    env: AUTOMATION_ENV,
    method: 'POST',
    pathname,
    rawBody,
    keyIdHeader: PLANNING_KEY,
    timestampHeader: timestamp,
    signatureHeader: signature,
    requestIdHeader: requestId,
  });

  assert.equal(decision.ok, true);
  if (!decision.ok) return;
  assert.equal(decision.agentId, 'steward');
  assert.equal(decision.principalId, 'workflow:planning-suggestion');
  assert.equal(decision.workflowPrincipalKey, 'planning-suggestion');
  assert.equal(decision.workflowKey, 'planning-suggestion');
  assert.equal(decision.actorId, 'workflow:planning-suggestion');
});

test('block5 replay: mismo agente y request quedan aislados por principal', () => {
  const briefing = buildOpenClawReplayKeys({
    environment: 'preview',
    principalId: 'workflow:daily-briefing',
    requestId: 'same-request',
    signature: 'a'.repeat(64),
  });
  const planning = buildOpenClawReplayKeys({
    environment: 'preview',
    principalId: 'workflow:planning-suggestion',
    requestId: 'same-request',
    signature: 'a'.repeat(64),
  });

  assert.notEqual(briefing.requestKey, planning.requestKey);
  assert.notEqual(briefing.canonicalKey, planning.canonicalKey);
});

test('block5 ownership: propuesta de workflow pertenece solo a su principal', () => {
  const source = automationProposalSource('planning-suggestion', 'steward');
  const proposal = { source };

  assert.equal(isOpenClawProposalOwnedByAgent(proposal, 'steward', 'planning-suggestion'), true);
  assert.equal(isOpenClawProposalOwnedByAgent(proposal, 'steward', 'daily-briefing'), false);
  assert.equal(isOpenClawProposalOwnedByAgent(proposal, 'steward'), false);
  assert.equal(
    isOpenClawProposalOwnedByAgent(proposal, 'health-reflection', 'approval-digest-health'),
    false,
  );
});

test('block5 flags: API y workflows nacen apagados', () => {
  assert.equal(isAutomationsApiEnabled({}), false);
  assert.equal(
    isAutomationsApiEnabled({
      AUTOMATIONS_API_ENABLED: 'true',
      AUTOMATIONS_ACCESS_MODE: 'disabled',
    }),
    false,
  );
  assert.equal(
    isAutomationWorkflowEnabled('daily-briefing', {
      AUTOMATIONS_API_ENABLED: 'true',
      AUTOMATIONS_ACCESS_MODE: 'read-only',
      AUTOMATIONS_WORKFLOW_CONTRACT_VERSION: 'vida2-automations-v1',
      AUTOMATIONS_DAILY_BRIEFING_ENABLED: 'false',
    }),
    false,
  );
  assert.equal(
    isAutomationWorkflowEnabled('daily-briefing', {
      AUTOMATIONS_API_ENABLED: 'true',
      AUTOMATIONS_ACCESS_MODE: 'read-only',
      AUTOMATIONS_WORKFLOW_CONTRACT_VERSION: 'vida2-automations-v1',
      AUTOMATIONS_DAILY_BRIEFING_ENABLED: 'true',
    }),
    true,
  );
});

test('block5 principal metadata: approval digest separa agentes', () => {
  const steward = getAutomationPrincipalContract('approval-digest-steward');
  const health = getAutomationPrincipalContract('approval-digest-health');

  assert.equal(steward.workflowKey, 'approval-digest');
  assert.equal(health.workflowKey, 'approval-digest');
  assert.equal(steward.agentId, 'steward');
  assert.equal(health.agentId, 'health-reflection');
  assert.notEqual(steward.principalId, health.principalId);
});

test('block5 credentials: colisión entre credencial directa y workflow falla cerrado', () => {
  const result = getOpenClawAgentCredentials({
    OPENCLAW_API_KEY_ID: BRIEFING_KEY,
    OPENCLAW_API_SECRET: 'legacy-secret',
    OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_KEY_ID: BRIEFING_KEY,
    OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_SECRET: BRIEFING_SECRET,
  });

  assert.deepEqual(result, { ok: false, reason: 'duplicate-key-id' });
});

test('block5 flags: versión ausente o kill switch apagado invalidan HMAC de workflow', () => {
  const timestamp = String(Date.now());
  const requestId = 'block5-disabled-workflow';
  const pathname = '/api/openclaw/v1/health';
  const signature = signCanonical(
    BRIEFING_SECRET,
    buildCanonicalString({
      timestamp,
      requestId,
      method: 'GET',
      pathname,
      rawBody: '',
    }),
  );
  const verify = (env: Readonly<Record<string, string>>) =>
    verifyOpenClawRequest({
      env,
      method: 'GET',
      pathname,
      rawBody: '',
      keyIdHeader: BRIEFING_KEY,
      timestampHeader: timestamp,
      signatureHeader: signature,
      requestIdHeader: requestId,
    });

  assert.equal(
    verify({
      ...AUTOMATION_ENV,
      AUTOMATIONS_WORKFLOW_CONTRACT_VERSION: '',
    }).ok,
    false,
  );
  assert.equal(
    verify({
      ...AUTOMATION_ENV,
      AUTOMATIONS_DAILY_BRIEFING_ENABLED: 'false',
    }).ok,
    false,
  );
});

test('block5 rate y auditoría: dos workflows del mismo agente quedan aislados', async () => {
  const rate = createMemoryOpenClawRateLimitPort();
  assert.equal((await rate.allow('workflow:daily-briefing', 1, 1_000)).ok, true);
  assert.equal((await rate.allow('workflow:daily-briefing', 1, 1_001)).ok, false);
  assert.equal((await rate.allow('workflow:planning-suggestion', 1, 1_001)).ok, true);

  const briefingLog = buildOpenClawLogEvent({
    requestId: 'same-request',
    operation: 'tasks.list',
    principalId: 'workflow:daily-briefing',
    agentId: 'steward',
    durationMs: 1,
    result: 'ok',
  });
  const planningLog = buildOpenClawLogEvent({
    requestId: 'same-request',
    operation: 'tasks.list',
    principalId: 'workflow:planning-suggestion',
    agentId: 'steward',
    durationMs: 1,
    result: 'ok',
  });
  assert.notEqual(briefingLog.clientTrace, planningLog.clientTrace);
});

test('block5 capabilities: cada workflow ve solo la intersección de su contrato', () => {
  const env = {
    ...AUTOMATION_ENV,
    WRITE_ACTIONS_ENABLED: 'true',
    OPENCLAW_PROPOSALS_ENABLED: 'true',
  };
  const planning = listOpenClawCapabilities('steward', env, 'planning-suggestion');
  assert.equal(planning.find((item) => item.id === 'tasks.list')?.kind, 'read');
  assert.equal(planning.find((item) => item.id === 'calendar.upcoming')?.kind, 'read');
  assert.equal(planning.find((item) => item.id === 'projects.list')?.kind, 'forbidden');
  assert.equal(planning.find((item) => item.id === 'task.create.propose')?.kind, 'proposal');
  assert.equal(
    planning.find((item) => item.id === 'calendar.hold.create.propose')?.kind,
    'forbidden',
  );

  const briefing = listOpenClawCapabilities('steward', env, 'daily-briefing');
  assert.equal(briefing.find((item) => item.id === 'approvals.list')?.kind, 'read');
  assert.equal(briefing.find((item) => item.id === 'areas.list')?.kind, 'forbidden');
  assert.equal(briefing.filter((item) => item.kind === 'proposal').length, 0);
  for (const forbidden of [
    'proposal.approve',
    'proposal.reject',
    'action.rollback',
    'task.create',
  ]) {
    assert.equal(planning.find((item) => item.id === forbidden)?.kind, 'forbidden');
  }
});

test('block5 ownership: approval digest Steward y Salud nunca comparten propuestas', () => {
  const stewardProposal = {
    source: automationProposalSource('approval-digest-steward', 'steward'),
  };
  const healthProposal = {
    source: automationProposalSource('approval-digest-health', 'health-reflection'),
  };

  assert.equal(
    isOpenClawProposalOwnedByAgent(stewardProposal, 'steward', 'approval-digest-steward'),
    true,
  );
  assert.equal(
    isOpenClawProposalOwnedByAgent(healthProposal, 'health-reflection', 'approval-digest-health'),
    true,
  );
  assert.equal(
    isOpenClawProposalOwnedByAgent(stewardProposal, 'health-reflection', 'approval-digest-health'),
    false,
  );
  assert.equal(
    isOpenClawProposalOwnedByAgent(healthProposal, 'steward', 'approval-digest-steward'),
    false,
  );
});

test('block5 proposals: planning crea source y actor aislados por principal', async () => {
  const proposals = createMemoryProposalPort();
  const audit = createMemoryAuditSink();
  const created = await createOpenClawProposal({
    agentId: 'steward',
    principalId: 'workflow:planning-suggestion',
    workflowPrincipalKey: 'planning-suggestion',
    requestId: 'block5-planning-create',
    env: {
      ...AUTOMATION_ENV,
      NODE_ENV: 'test',
      WRITE_ACTIONS_ENABLED: 'true',
      WRITE_ACTIONS_USE_MEMORY: 'true',
      OPENCLAW_PROPOSALS_ENABLED: 'true',
    },
    runtimeOverrides: {
      proposals,
      idempotency: createMemoryIdempotencyStore(),
      audit,
    },
    request: {
      operation: 'task.create.propose',
      idempotencyKey: 'block5-planning-task',
      reason: 'Sugerencia controlada',
      expectedChange: 'Crear una tarea pendiente',
      risk: 'medium',
      reversible: true,
      payload: {
        title: 'Tarea sugerida',
        priority: 'Media',
        areaKey: 'area.salud',
        projectKey: null,
        date: null,
        duration: null,
        energy: null,
        note: null,
      },
    },
  });

  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal((await proposals.list())[0]?.source, 'agent:steward:workflow:planning-suggestion');
  const auditRows = await audit.list();
  assert.equal(auditRows.length > 0, true);
  assert.match(auditRows[0]?.actorHint ?? '', /^openclaw:[0-9a-f]{8}$/);
});

test('block5 routes: read y proposals rechazan operaciones fuera del contrato', async () => {
  const readRoute = readFileSync(
    path.join(process.cwd(), 'app/api/openclaw/v1/read/route.ts'),
    'utf8',
  );
  assert.match(readRoute, /isAutomationReadAccessEnabled/);
  assert.match(readRoute, /isAutomationReadAllowed/);
  assert.equal(
    isAutomationReadAllowed('technical-watchdog', 'technical-guardian', 'tasks.list'),
    false,
  );

  await withEnv(
    {
      ...AUTOMATION_ENV,
      NODE_ENV: 'test',
      OPENCLAW_RATE_LIMIT_MODE: 'memory',
      OPENCLAW_REPLAY_MODE: 'memory',
      WRITE_ACTIONS_ENABLED: 'true',
      WRITE_ACTIONS_USE_MEMORY: 'true',
      OPENCLAW_PROPOSALS_ENABLED: 'true',
    },
    async () => {
      const proposalBody = JSON.stringify({
        operation: 'calendar.hold.create.propose',
        idempotencyKey: 'block5-forbidden-hold',
        reason: 'Fuera de contrato',
        expectedChange: 'No debe crearse',
        risk: 'medium',
        reversible: true,
        payload: {
          title: 'Hold prohibido',
          start: '2027-08-01T12:00:00.000Z',
          end: '2027-08-01T13:00:00.000Z',
          note: null,
          relatedTaskKey: null,
        },
      });
      const proposalSigned = signedWorkflowRequest({
        keyId: PLANNING_KEY,
        secret: PLANNING_SECRET,
        method: 'POST',
        pathname: '/api/openclaw/v1/proposals',
        rawBody: proposalBody,
      });
      const proposalResponse = await postProposal(
        new Request('https://example.test/api/openclaw/v1/proposals', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-vida-key-id': proposalSigned.keyId,
            'x-vida-timestamp': proposalSigned.timestamp,
            'x-vida-signature': proposalSigned.signature,
            'x-vida-request-id': proposalSigned.requestId,
          },
          body: proposalBody,
        }),
      );
      assert.equal(proposalResponse.status, 403);

      const getPath = '/api/openclaw/v1/proposals/prop-block5';
      const getSigned = signedWorkflowRequest({
        keyId: PLANNING_KEY,
        secret: PLANNING_SECRET,
        method: 'GET',
        pathname: getPath,
      });
      const getResponse = await getProposal(
        new Request(`https://example.test${getPath}`, {
          headers: {
            'x-vida-key-id': getSigned.keyId,
            'x-vida-timestamp': getSigned.timestamp,
            'x-vida-signature': getSigned.signature,
            'x-vida-request-id': getSigned.requestId,
          },
        }),
        { params: Promise.resolve({ key: 'prop-block5' }) },
      );
      assert.equal(getResponse.status, 403);
    },
  );
});
