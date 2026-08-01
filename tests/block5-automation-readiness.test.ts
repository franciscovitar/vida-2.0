import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateAutomationReadiness } from '@/lib/automations/readiness';
import type { AutomationWorkflowControl } from '@/types/automations';

const COMPLETE_ENV = {
  NODE_ENV: 'test',
  AUTOMATIONS_API_ENABLED: 'true',
  AUTOMATIONS_ACCESS_MODE: 'proposal-only',
  AUTOMATIONS_WORKFLOW_CONTRACT_VERSION: 'vida2-automations-v1',
  AUTOMATIONS_DAILY_BRIEFING_ENABLED: 'true',
  AUTOMATIONS_MANUAL_RUN_ENABLED: 'true',
  AUTOMATIONS_RESULT_CALLBACK_ENABLED: 'true',
  AUTOMATIONS_N8N_TEMPLATES_PROVISIONED: 'true',
  AUTOMATIONS_N8N_BASE_URL: 'http://localhost:5678',
  AUTOMATIONS_N8N_WEBHOOK_SECRET: 'orchestrator-secret-with-safe-length',
  AUTOMATIONS_UPSTASH_REDIS_REST_URL: 'https://automations-only.upstash.io',
  AUTOMATIONS_UPSTASH_REDIS_REST_TOKEN: 'automations-token-with-safe-length',
  AUTOMATIONS_STATE_NAMESPACE: 'vida2:automations:test:vida2-automations-v1',
  AUTOMATIONS_STATE_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString('base64'),
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
  OPENCLAW_AUTOMATION_APPROVAL_DIGEST_HEALTH_API_SECRET: 'approval-health-secret-with-safe-length',
  OPENCLAW_AUTOMATION_PLANNING_SUGGESTION_API_KEY_ID: 'planning-key',
  OPENCLAW_AUTOMATION_PLANNING_SUGGESTION_API_SECRET: 'planning-secret-with-safe-length',
} as const;

function control(input: {
  paused?: boolean;
  mode?: AutomationWorkflowControl['circuit']['mode'];
  failures?: number;
}): AutomationWorkflowControl {
  return {
    workflowKey: 'daily-briefing',
    paused: input.paused ?? false,
    circuit: {
      mode: input.mode ?? 'closed',
      consecutiveFailures: input.failures ?? 0,
      openedAt: null,
    },
    updatedAt: '2026-08-01T12:00:00.000Z',
  };
}

test('block5 readiness: estados canónicos son fail-closed y comparten checks sanitizados', () => {
  assert.equal(evaluateAutomationReadiness({ env: {} }).state, 'disabled');
  assert.equal(
    evaluateAutomationReadiness({
      env: {
        NODE_ENV: 'test',
        AUTOMATIONS_API_ENABLED: 'true',
        AUTOMATIONS_ACCESS_MODE: 'read-only',
        AUTOMATIONS_WORKFLOW_CONTRACT_VERSION: 'vida2-automations-v1',
        AUTOMATIONS_DAILY_BRIEFING_ENABLED: 'true',
      },
    }).state,
    'misconfigured',
  );

  const ready = evaluateAutomationReadiness({ env: COMPLETE_ENV, storeReachable: true });
  assert.equal(ready.state, 'ready');
  assert.equal(ready.credentialsConfigured, 6);
  assert.equal(ready.checks.length, 12);
  assert.equal(
    ready.checks.every((item) => item.ready),
    true,
  );
  assert.equal(/SECRET|TOKEN|URL|UPSTASH|[A-Z_]{8}/.test(JSON.stringify(ready)), false);

  assert.equal(
    evaluateAutomationReadiness({
      env: COMPLETE_ENV,
      controls: { 'daily-briefing': control({ paused: true }) },
      storeReachable: true,
    }).state,
    'paused',
  );
  assert.equal(
    evaluateAutomationReadiness({
      env: COMPLETE_ENV,
      controls: { 'daily-briefing': control({ mode: 'half-open', failures: 2 }) },
      storeReachable: true,
    }).state,
    'degraded',
  );
  assert.equal(
    evaluateAutomationReadiness({ env: COMPLETE_ENV, storeReachable: false }).state,
    'degraded',
  );
});

test('block5 readiness: templates, seis HMAC y Production son checks independientes', () => {
  const pendingTemplates = evaluateAutomationReadiness({
    env: { ...COMPLETE_ENV, AUTOMATIONS_N8N_TEMPLATES_PROVISIONED: 'false' },
    storeReachable: true,
  });
  assert.equal(pendingTemplates.state, 'misconfigured');
  assert.equal(pendingTemplates.checks.find((item) => item.id === 'templates')?.ready, false);

  const insecurePreview = evaluateAutomationReadiness({
    env: {
      ...COMPLETE_ENV,
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      AUTOMATIONS_N8N_BASE_URL: 'http://orchestrator.example.test',
    },
    storeReachable: true,
  });
  assert.equal(insecurePreview.state, 'misconfigured');
  assert.equal(insecurePreview.checks.find((item) => item.id === 'orchestrator')?.ready, false);

  const production = evaluateAutomationReadiness({
    env: { ...COMPLETE_ENV, VERCEL_ENV: 'production', NODE_ENV: 'production' },
    storeReachable: true,
  });
  assert.equal(production.state, 'misconfigured');
  assert.equal(production.checks.find((item) => item.id === 'environment')?.ready, false);

  const authorized = evaluateAutomationReadiness({
    env: {
      ...COMPLETE_ENV,
      VERCEL_ENV: 'production',
      NODE_ENV: 'production',
      AUTOMATIONS_PRODUCTION_ENABLED: 'true',
      AUTOMATIONS_N8N_BASE_URL: 'https://orchestrator.example.test',
    },
    storeReachable: true,
  });
  assert.equal(authorized.state, 'ready');
});
