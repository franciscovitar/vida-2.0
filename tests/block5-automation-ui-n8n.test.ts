import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import { getAutomationWorkflowContract } from '@/lib/automations/contracts';
import { getAutomationsDashboardData, nextAutomationRun } from '@/lib/automations/dashboard';
import { N8N_MANUAL_WORKFLOW_KEYS } from '@/lib/automations/n8n-client';
import { createMemoryAutomationStateStore } from '@/lib/automations/store';
import type { AutomationWorkflowKey } from '@/types/automations';

type N8nTemplate = {
  active: boolean;
  nodes: N8nNode[];
  connections: Record<string, unknown>;
  settings: { timezone: string };
  meta: {
    contractVersion: string;
    workflowKey: AutomationWorkflowKey;
    principalKey: string;
    operations: string[];
    signatureProtocol: string;
    idempotencyPolicy: string;
    requestAuthenticationPolicy: string;
    retryableStatusCodes: number[];
    maxAttempts: number;
    provisioningState: string;
    executable: boolean;
    callbackPath: string;
    scheduleIngressPath: string;
    runnerContract: string;
  };
};

type N8nNode = {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
};

type ManualIngressTemplate = {
  name: string;
  active: boolean;
  nodes: N8nNode[];
  connections: Record<string, unknown>;
  meta: {
    contractVersion: string;
    role: string;
    webhookPaths: string[];
    authentication: { type: string; headerName: string; valueContract: string };
    mappings: Record<
      string,
      { principalKey: string; runnerVariable: string; operations: string[] }
    >;
    runnerContract: string;
    deliveryClaimPath: string;
    callbackPath: string;
    retryPolicy: string;
    provisioningState: string;
  };
};

type N8nCodeItem = { json: Record<string, unknown> };

const N8N_ENV_REFERENCE = /\$env\.([A-Z][A-Z0-9_]*)/g;

function assertCommunityEnvContract(
  raw: string,
  expectedNames: readonly string[],
  label: string,
): void {
  assert.equal(raw.includes('$vars.'), false, `${label}: paid n8n variables are forbidden`);
  const actualNames = [...raw.matchAll(N8N_ENV_REFERENCE)].map((match) => match[1]!);
  assert.equal(
    (raw.match(/\$env\b/g) ?? []).length,
    actualNames.length,
    `${label}: dynamic or non-canonical environment access is forbidden`,
  );
  assert.deepEqual(
    [...new Set(actualNames)].sort(),
    [...expectedNames].sort(),
    `${label}: only approved VIDA2 environment bindings are allowed`,
  );
  assert.equal(
    actualNames.every((name) => name.startsWith('VIDA2_')),
    true,
    `${label}: environment bindings must stay inside the VIDA2 namespace`,
  );
  assert.equal(
    actualNames.some((name) => /SECRET|TOKEN|PASSWORD|PRIVATE|HMAC|KEY_ID/.test(name)),
    false,
    `${label}: authentication material must remain in encrypted n8n Credentials`,
  );
}

function runN8nCode(source: string, json: unknown): N8nCodeItem[] {
  const execute = runInNewContext(`(($json) => { ${source} })`) as (
    value: unknown,
  ) => N8nCodeItem[];
  return execute(json);
}

test('block5 n8n: hay seis unidades inactivas para cinco contratos y dos digest aislados', () => {
  const directory = path.join(process.cwd(), 'automations/n8n');
  const allFiles = readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort();
  assert.equal(allFiles.length, 7);
  assert.equal(allFiles.includes('manual-ingress.json'), true);
  const files = allFiles.filter((file) => file !== 'manual-ingress.json');
  assert.equal(files.length, 6);
  assert.deepEqual(
    files.filter((file) => file.startsWith('approval-digest-')),
    ['approval-digest-health.json', 'approval-digest-steward.json'],
  );
  const schedules: Record<AutomationWorkflowKey, string> = {
    'daily-briefing': '15 7 * * *',
    'technical-watchdog': '17 * * * *',
    'weekly-review': '10 18 * * 0',
    'approval-digest': '15 12,19 * * *',
    'planning-suggestion': '30 7 * * 1-5',
  };
  const logicalContracts = new Set<AutomationWorkflowKey>();
  const principals = new Set<string>();
  const runnerVariables = new Set<string>();
  for (const file of files) {
    const raw = readFileSync(path.join(directory, file), 'utf8');
    const template = JSON.parse(raw) as N8nTemplate;
    const contract = getAutomationWorkflowContract(template.meta.workflowKey);
    logicalContracts.add(template.meta.workflowKey);
    principals.add(template.meta.principalKey);
    const runnerVariable = raw.match(/VIDA2_[A-Z_]+_RUNNER_WORKFLOW_ID/g) ?? [];
    assert.equal(new Set(runnerVariable).size, 1, file);
    runnerVariables.add(runnerVariable[0]!);
    assert.equal(template.active, false, file);
    assert.equal(template.settings.timezone, contract.schedule.timezone, file);
    assert.deepEqual(
      template.meta.operations,
      [...contract.allowedReads, ...contract.allowedProposals],
      file,
    );
    assert.equal(template.meta.signatureProtocol, 'vida2-openclaw-hmac-v2', file);
    assert.equal(template.meta.idempotencyPolicy, 'same-normalized-occurrence', file);
    assert.equal(template.meta.requestAuthenticationPolicy, 'regenerate-per-attempt', file);
    assert.deepEqual(template.meta.retryableStatusCodes, contract.retry.retryableStatusCodes, file);
    assert.equal(template.meta.maxAttempts, contract.retry.maxAttempts, file);
    assert.equal(template.meta.provisioningState, 'credential-binding-required', file);
    assert.equal(template.meta.executable, true, file);
    assert.equal(template.meta.callbackPath, '/api/automations/v1/runs', file);
    assert.equal(template.meta.scheduleIngressPath, '/api/automations/v1/triggers/scheduled', file);
    assert.equal(template.meta.runnerContract, 'vida2-n8n-principal-runner-v1', file);
    assert.ok(Object.keys(template.connections).length >= 6, file);
    assert.equal(
      JSON.stringify(template).includes(schedules[template.meta.workflowKey]),
      true,
      file,
    );
    assert.equal(
      template.nodes.some((node) => node.type === 'n8n-nodes-base.httpRequest'),
      true,
      file,
    );
    const names = template.nodes.map((node) => node.name);
    assert.ok(names.indexOf('HMAC begin scheduled run') > names.indexOf('Schedule'), file);
    assert.ok(
      names.indexOf('Extract canonical runKey') > names.indexOf('HMAC begin scheduled run'),
      file,
    );
    assert.ok(
      names.findIndex((name) => name.startsWith('HMAC contracted')) >
        names.indexOf('Extract canonical runKey'),
      file,
    );
    assert.ok(
      names.indexOf('Callback terminal') >
        names.findIndex((name) => name.startsWith('HMAC contracted')),
      file,
    );
    assert.equal(
      template.nodes.some((node) =>
        JSON.stringify(node.parameters).includes('/api/automations/v1/runs'),
      ),
      true,
      file,
    );
    assert.equal(
      template.nodes.some((node) =>
        /notion|googleSheets|googleCalendar|gmail|drive/i.test(node.type),
      ),
      false,
      file,
    );
    assert.equal('credentials' in template, false, file);
    assertCommunityEnvContract(raw, [runnerVariable[0]!, 'VIDA2_CONTROLLED_API_BASE_URL'], file);
    assert.equal(/https?:\/\//i.test(raw), false, file);
    assert.equal(
      /BEGIN PRIVATE|Bearer\s+[A-Za-z0-9]|@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw),
      false,
      file,
    );
    assert.equal(
      /proposal\.approve|proposal\.reject|action\.rollback|content\.delete|message\.send/i.test(
        raw,
      ),
      false,
      file,
    );
  }
  assert.equal(logicalContracts.size, 5);
  assert.equal(principals.size, 6);
  assert.equal(runnerVariables.size, 6);
});

test('block5 n8n: ingress manual reclama la primera entrega efectiva antes del ACK y no redispatcha retries posteriores', () => {
  const file = path.join(process.cwd(), 'automations/n8n/manual-ingress.json');
  const raw = readFileSync(file, 'utf8');
  const template = JSON.parse(raw) as ManualIngressTemplate;
  const supported = [
    'daily-briefing',
    'technical-watchdog',
    'weekly-review',
    'planning-suggestion',
  ] as const;
  const paths = supported.map((workflowKey) => `vida2/automations/${workflowKey}`);

  assert.deepEqual(N8N_MANUAL_WORKFLOW_KEYS, supported);
  assert.equal(template.name, 'Vida 2.0 · Manual ingress');
  assert.equal(template.active, false);
  assert.equal(template.meta.role, 'manual-ingress');
  assert.equal(template.meta.contractVersion, 'vida2-automations-v1');
  assert.deepEqual(template.meta.webhookPaths, paths);
  assert.deepEqual(Object.keys(template.meta.mappings).sort(), [...supported].sort());
  assert.deepEqual(template.meta.authentication, {
    type: 'httpHeaderAuth',
    headerName: 'x-vida-automations-secret',
    valueContract: 'AUTOMATIONS_N8N_WEBHOOK_SECRET',
  });
  assert.equal(template.meta.runnerContract, 'vida2-n8n-principal-runner-v1');
  assert.equal(template.meta.deliveryClaimPath, '/api/automations/v1/deliveries/claim');
  assert.equal(template.meta.callbackPath, '/api/automations/v1/runs');
  assert.equal(template.meta.retryPolicy, 'claim-first-effective-delivery-before-runner');
  assert.equal(template.meta.provisioningState, 'credential-binding-required');

  const webhooks = template.nodes.filter((node) => node.type === 'n8n-nodes-base.webhook');
  assert.equal(webhooks.length, 4);
  assert.deepEqual(webhooks.map((node) => node.parameters.path).sort(), [...paths].sort());
  for (const webhook of webhooks) {
    assert.equal(webhook.parameters.httpMethod, 'POST');
    assert.equal(webhook.parameters.authentication, 'headerAuth');
    assert.equal(webhook.parameters.responseMode, 'responseNode');
  }
  assert.equal(
    template.nodes.some((node) => /schedule|poll|interval|cron/i.test(node.type)),
    false,
  );
  assert.equal(raw.includes('approval-digest'), false);

  const runnerVariables = new Set<string>();
  const nextNode = (name: string): string | undefined => {
    const connection = template.connections[name] as
      { main?: Array<Array<{ node: string }>> } | undefined;
    return connection?.main?.[0]?.[0]?.node;
  };
  for (const workflowKey of supported) {
    const mapping = template.meta.mappings[workflowKey]!;
    const contract = getAutomationWorkflowContract(workflowKey);
    assert.equal(mapping.principalKey, workflowKey);
    assert.deepEqual(mapping.operations, [...contract.allowedReads, ...contract.allowedProposals]);
    runnerVariables.add(mapping.runnerVariable);

    const validator = template.nodes.find((node) => node.name === `Validate ${workflowKey}`)!;
    const claim = template.nodes.find((node) => node.name === `Claim ${workflowKey} delivery`)!;
    const respond = template.nodes.find((node) => node.name === `Respond ${workflowKey}`)!;
    const gate = template.nodes.find((node) => node.name === `Gate ${workflowKey} first delivery`)!;
    const execute = template.nodes.find((node) => node.name === `Execute ${workflowKey} runner`)!;
    const callback = template.nodes.find((node) => node.name === `Callback ${workflowKey}`)!;
    assert.equal(nextNode(`Webhook ${workflowKey}`), `Validate ${workflowKey}`);
    assert.equal(nextNode(`Validate ${workflowKey}`), `Claim ${workflowKey} delivery`);
    assert.equal(nextNode(`Claim ${workflowKey} delivery`), `Respond ${workflowKey}`);
    assert.equal(nextNode(`Respond ${workflowKey}`), `Gate ${workflowKey} first delivery`);
    assert.equal(nextNode(`Gate ${workflowKey} first delivery`), `Execute ${workflowKey} runner`);
    assert.equal(nextNode(`Execute ${workflowKey} runner`), `Build ${workflowKey} callback`);
    assert.equal(nextNode(`Build ${workflowKey} callback`), `Callback ${workflowKey}`);
    const validatorCode = String(validator.parameters.jsCode);
    const gateCode = String(gate.parameters.jsCode);
    const validBody = {
      runKey: 'run_abcdefghijklmnopqrstuvwx',
      workflowKey,
      principalKey: mapping.principalKey,
      idempotencyKey: 'manual:123e4567-e89b-42d3-a456-426614174000',
      requestKey: 'request_abcdefghijklmnopqrstuvwx',
      attempt: 1,
      trigger: 'manual',
      contractVersion: 'vida2-automations-v1',
    };
    const initial = runN8nCode(validatorCode, { body: validBody });
    assert.equal(initial[0]?.json.shouldExecute, true);
    assert.equal(initial[0]?.json.workflowKey, workflowKey);
    assert.equal(initial[0]?.json.principalKey, mapping.principalKey);
    assert.equal(initial[0]?.json.requestKey, validBody.requestKey);
    assert.equal(runN8nCode(gateCode, initial[0]!.json).length, 1);

    const retry = runN8nCode(validatorCode, {
      body: {
        ...validBody,
        requestKey: 'request_zyxwvutsrqponmlkjihgfedc',
        attempt: 2,
        trigger: 'retry',
      },
    });
    assert.equal(retry[0]?.json.shouldExecute, false);
    assert.equal(runN8nCode(gateCode, retry[0]!.json).length, 0);
    assert.throws(() =>
      runN8nCode(validatorCode, {
        body: { ...validBody, workflowKey: 'approval-digest' },
      }),
    );
    assert.throws(() =>
      runN8nCode(validatorCode, {
        body: { ...validBody, principalKey: 'approval-digest-steward' },
      }),
    );
    assert.throws(() =>
      runN8nCode(validatorCode, {
        body: { ...validBody, unexpected: true },
      }),
    );
    assert.throws(() =>
      runN8nCode(validatorCode, {
        body: { ...validBody, attempt: 2, trigger: 'manual' },
      }),
    );

    assert.equal(claim.type, 'n8n-nodes-base.httpRequest');
    assert.equal(claim.parameters.method, 'POST');
    assert.equal(
      String(claim.parameters.url).includes('/api/automations/v1/deliveries/claim'),
      true,
    );
    assert.equal(String(claim.parameters.body).includes('shouldExecute'), false);
    assert.equal(respond.type, 'n8n-nodes-base.respondToWebhook');
    assert.equal(respond.parameters.respondWith, 'json');
    assert.equal(
      respond.parameters.responseBody,
      '={{ { ok: true, accepted: true, requestKey: $json.requestKey } }}',
    );
    const inputs = execute.parameters.workflowInputs as {
      value: { action: string; runKey: string; workflowKey: string; operations: string };
    };
    assert.equal(execute.type, 'n8n-nodes-base.executeWorkflow');
    assert.equal(inputs.value.action, 'execute');
    assert.equal(inputs.value.runKey, '={{ $json.runKey }}');
    assert.equal(inputs.value.workflowKey, workflowKey);
    assert.equal(inputs.value.operations, mapping.operations.join(','));
    assert.equal(String(execute.parameters.workflowId).includes(mapping.runnerVariable), true);
    assert.equal(callback.type, 'n8n-nodes-base.httpRequest');
    assert.equal(callback.parameters.method, 'POST');
    assert.equal(String(callback.parameters.url).includes('/api/automations/v1/runs'), true);
  }
  assert.equal(runnerVariables.size, 4);
  assert.equal(
    template.nodes.some((node) =>
      /notion|googleSheets|googleCalendar|gmail|drive/i.test(node.type),
    ),
    false,
  );
  assert.equal('credentials' in template, false);
  assertCommunityEnvContract(
    raw,
    [...runnerVariables, 'VIDA2_CONTROLLED_API_BASE_URL'],
    'manual-ingress.json',
  );
  assert.equal(/https?:\/\//i.test(raw), false);
  assert.equal(/BEGIN PRIVATE|Bearer\s+[A-Za-z0-9]|@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw), false);
  assert.equal(
    /proposal\.approve|proposal\.reject|action\.rollback|content\.delete|message\.send/i.test(raw),
    false,
  );
  assert.equal((raw.match(/task\.create\.propose/g) ?? []).length, 2);
});

test('block5 dashboard: cinco estados, schedules y manual run server-resolved', async () => {
  const data = await getAutomationsDashboardData({
    env: {},
    store: null,
    nowMs: Date.parse('2026-08-01T12:00:00Z'),
  });
  assert.equal(data.items.length, 5);
  assert.equal(
    data.items.every((item) => item.status === 'disabled'),
    true,
  );
  assert.equal(
    data.items.every((item) => item.canRunNow === false),
    true,
  );
  assert.equal(
    nextAutomationRun('daily-briefing', Date.parse('2026-08-01T12:00:00Z')),
    '2026-08-02T10:15:00.000Z',
  );

  const dashboardEnv = {
    NODE_ENV: 'test',
    AUTOMATIONS_API_ENABLED: 'true',
    AUTOMATIONS_SCHEDULE_INGRESS_ENABLED: 'true',
    AUTOMATIONS_ACCESS_MODE: 'read-only',
    AUTOMATIONS_WORKFLOW_CONTRACT_VERSION: 'vida2-automations-v1',
    AUTOMATIONS_DAILY_BRIEFING_ENABLED: 'true',
    AUTOMATIONS_MANUAL_RUN_ENABLED: 'true',
    AUTOMATIONS_RESULT_CALLBACK_ENABLED: 'true',
    AUTOMATIONS_N8N_TEMPLATES_PROVISIONED: 'true',
    AUTOMATIONS_N8N_BASE_URL: 'http://localhost:5678',
    AUTOMATIONS_N8N_WEBHOOK_SECRET: 'orchestrator-secret-safe-value',
    OPENCLAW_API_ENABLED: 'true',
    OPENCLAW_ACCESS_MODE: 'read-only',
    OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_KEY_ID: 'daily-key',
    OPENCLAW_AUTOMATION_DAILY_BRIEFING_API_SECRET: 'daily-secret-with-safe-length',
    OPENCLAW_AUTOMATION_TECHNICAL_WATCHDOG_API_KEY_ID: 'technical-key',
    OPENCLAW_AUTOMATION_TECHNICAL_WATCHDOG_API_SECRET: 'technical-secret-with-safe-length',
    OPENCLAW_AUTOMATION_WEEKLY_REVIEW_API_KEY_ID: 'weekly-key',
    OPENCLAW_AUTOMATION_WEEKLY_REVIEW_API_SECRET: 'weekly-secret-with-safe-length',
    OPENCLAW_AUTOMATION_APPROVAL_DIGEST_STEWARD_API_KEY_ID: 'approval-steward-key',
    OPENCLAW_AUTOMATION_APPROVAL_DIGEST_STEWARD_API_SECRET:
      'approval-steward-secret-with-safe-length',
    OPENCLAW_AUTOMATION_APPROVAL_DIGEST_HEALTH_API_KEY_ID: 'approval-health-key',
    OPENCLAW_AUTOMATION_APPROVAL_DIGEST_HEALTH_API_SECRET:
      'approval-health-secret-with-safe-length',
    OPENCLAW_AUTOMATION_PLANNING_SUGGESTION_API_KEY_ID: 'planning-key',
    OPENCLAW_AUTOMATION_PLANNING_SUGGESTION_API_SECRET: 'planning-secret-with-safe-length',
    AUTOMATIONS_UPSTASH_REDIS_REST_URL: 'https://safe-name.upstash.io',
    AUTOMATIONS_UPSTASH_REDIS_REST_TOKEN: 'token-with-safe-length',
    AUTOMATIONS_STATE_NAMESPACE: 'vida2:automations:test:vida2-automations-v1',
    AUTOMATIONS_STATE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  } as const;
  const dashboardStore = createMemoryAutomationStateStore();
  await dashboardStore.putRun(
    {
      runKey: 'run_abcdefghijklmnopqrstuvwx',
      workflowKey: 'daily-briefing',
      principalKey: 'daily-briefing',
      principalId: 'workflow:daily-briefing',
      trigger: 'manual',
      status: 'succeeded',
      attempt: 1,
      idempotencyKey: 'manual:must-not-reach-browser',
      startedAt: '2026-08-01T12:00:00.000Z',
      finishedAt: '2026-08-01T12:00:01.000Z',
      durationMs: 1_000,
      resultCode: 'completed',
      summary: 'Briefing listo.',
      proposalKey: null,
      artifactKey: 'artifact_abcdefghijklmnopqrstuvwx',
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:01.000Z',
      expiresAt: '2026-08-03T12:00:00.000Z',
    },
    60,
  );
  const configured = await getAutomationsDashboardData({
    store: dashboardStore,
    env: dashboardEnv,
  });
  assert.equal(
    configured.items.find((item) => item.workflowKey === 'daily-briefing')?.status,
    'ready',
  );
  assert.equal(
    configured.items.find((item) => item.workflowKey === 'daily-briefing')?.canRunNow,
    true,
  );
  assert.equal(
    configured.items.find((item) => item.workflowKey === 'approval-digest')?.canRunNow,
    false,
  );
  const browserPayload = JSON.stringify(configured);
  assert.equal(/runKey|principalId|idempotencyKey|artifactKey/.test(browserPayload), false);
  assert.equal(browserPayload.includes('must-not-reach-browser'), false);
});

test('block5 UI: ruta, navegación, ajustes, aprobaciones y responsive no exponen configuración', () => {
  const page = readFileSync(
    path.join(process.cwd(), 'app/(app)/automatizaciones/page.tsx'),
    'utf8',
  );
  const component = readFileSync(
    path.join(process.cwd(), 'components/automations/AutomationsDashboard.tsx'),
    'utf8',
  );
  const styles = readFileSync(
    path.join(process.cwd(), 'components/automations/AutomationsDashboard.module.scss'),
    'utf8',
  );
  const navigation = readFileSync(path.join(process.cwd(), 'lib/constants/navigation.ts'), 'utf8');
  const actions = readFileSync(path.join(process.cwd(), 'app/actions/automations.ts'), 'utf8');
  const settings = readFileSync(path.join(process.cwd(), 'app/(app)/ajustes/page.tsx'), 'utf8');
  const approvals = readFileSync(
    path.join(process.cwd(), 'components/actions/ApprovalsPanel.tsx'),
    'utf8',
  );
  assert.match(page, /requireAuthorizedSession/);
  assert.match(component, /Ejecutar ahora/);
  assert.match(component, /Confirmo esta ejecución manual/);
  assert.match(component, /Pausar/);
  assert.match(component, /aria-busy/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /Ejecutando…/);
  assert.match(component, /readinessState/);
  assert.match(component, /Últimas 20 ejecuciones/);
  assert.match(styles, /width <= 420px/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(navigation, /\/automatizaciones/);
  assert.match(actions, /verifySession/);
  assert.match(actions, /resolveManualAutomationRequest/);
  assert.doesNotMatch(actions, /input\.principal|input\.scopes|input\.permissions/);
  assert.match(settings, /Automatizaciones controladas/);
  assert.match(settings, /vida2-automations-v1|contractVersion/);
  assert.match(settings, /readinessState/);
  assert.match(settings, /templatesProvisioned/);
  assert.match(approvals, /Automatización · Sugerencia diaria de planificación/);
  const clientSurface = `${page}\n${component}\n${settings}`;
  assert.equal(
    /AUTOMATIONS_[A-Z_]+|UPSTASH_REDIS|WEBHOOK_SECRET|ENCRYPTION_KEY/.test(clientSurface),
    false,
  );
});
