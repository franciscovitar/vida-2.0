import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { getAutomationWorkflowContract } from '@/lib/automations/contracts';
import { getAutomationsDashboardData, nextAutomationRun } from '@/lib/automations/dashboard';
import { createMemoryAutomationStateStore } from '@/lib/automations/store';
import type { AutomationWorkflowKey } from '@/types/automations';

type N8nTemplate = {
  active: boolean;
  nodes: Array<{ name: string; type: string; parameters: Record<string, unknown> }>;
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

test('block5 n8n: hay seis unidades inactivas para cinco contratos y dos digest aislados', () => {
  const directory = path.join(process.cwd(), 'automations/n8n');
  const files = readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort();
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
  for (const file of files) {
    const raw = readFileSync(path.join(directory, file), 'utf8');
    const template = JSON.parse(raw) as N8nTemplate;
    const contract = getAutomationWorkflowContract(template.meta.workflowKey);
    logicalContracts.add(template.meta.workflowKey);
    principals.add(template.meta.principalKey);
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
    assert.equal(raw.includes('$env'), false, file);
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
