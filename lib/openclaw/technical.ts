/**
 * Diagnóstico técnico sanitizado para el Guardián técnico.
 * No consulta proveedores ni devuelve logs crudos.
 *
 * Módulo puro y testeable. La frontera server-only permanece en reads.ts.
 */
import { getWriteRuntimeStatus } from '@/lib/actions/config';
import {
  getOpenClawAgentStatuses,
  type OpenClawAgentStatusView,
} from '@/lib/openclaw/agent-status';
import { getOpenClawReadiness } from '@/lib/openclaw/readiness';
import type { OpenClawAgentId } from '@/types/openclaw';

type Env = Readonly<Record<string, string | undefined>>;

/** DTO público de agente para technical.status (sin clave `id`). */
export type OpenClawTechnicalAgentStatus = {
  agentKey: OpenClawAgentId;
  name: string;
  status: OpenClawAgentStatusView['status'];
  reads: number;
  proposals: number;
  externalAccess: OpenClawAgentStatusView['externalAccess'];
};

function environment(env: Env): 'local' | 'development' | 'preview' | 'production' {
  const value = env.VERCEL_ENV;
  if (value === 'development' || value === 'preview' || value === 'production') return value;
  return 'local';
}

function safeCode(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function toTechnicalAgentStatus(agent: OpenClawAgentStatusView): OpenClawTechnicalAgentStatus {
  return {
    agentKey: agent.id,
    name: agent.name,
    status: agent.status,
    reads: agent.reads,
    proposals: agent.proposals,
    externalAccess: agent.externalAccess,
  };
}

export function buildOpenClawTechnicalStatus(env: Env = process.env) {
  const readiness = getOpenClawReadiness(env);
  const writes = getWriteRuntimeStatus(env);
  return {
    environment: environment(env),
    apiStatus: readiness.apiStatus,
    readinessStatus: readiness.status,
    securityControls: readiness.securityControls,
    sources: { ...readiness.sources },
    proposals: readiness.openclawProposals,
    writes: {
      enabled: writes.writesEnabled,
      global: writes.global,
      rollback: writes.rollback,
      coordination: writes.coordination,
    },
    agents: getOpenClawAgentStatuses(env).map(toTechnicalAgentStatus),
  };
}

export function buildOpenClawTechnicalDiagnostics(env: Env = process.env) {
  const status = buildOpenClawTechnicalStatus(env);
  const writes = getWriteRuntimeStatus(env);
  const entries: Array<{
    code: string;
    severity: 'info' | 'warning' | 'error';
    component: string;
    state: string;
  }> = [];

  if (status.apiStatus !== 'read-only') {
    entries.push({
      code: 'openclaw-api-not-ready',
      severity: 'error',
      component: 'openclaw',
      state: status.apiStatus,
    });
  }
  if (status.securityControls !== 'ready') {
    entries.push({
      code: 'security-controls-blocked',
      severity: 'error',
      component: 'security',
      state: status.securityControls,
    });
  }

  for (const [component, state] of Object.entries(status.sources)) {
    if (state !== 'ready') {
      entries.push({
        code: `source-${safeCode(component)}-${safeCode(state)}`,
        severity: state === 'unavailable' ? 'warning' : 'info',
        component,
        state,
      });
    }
  }

  for (const agent of status.agents) {
    if (agent.status !== 'ready') {
      entries.push({
        code: `agent-${safeCode(agent.agentKey)}-${safeCode(agent.status)}`,
        severity: agent.status === 'misconfigured' ? 'error' : 'info',
        component: 'agents',
        state: agent.status,
      });
    }
  }

  for (const issue of writes.issues) {
    entries.push({
      code: `write-${safeCode(issue)}`,
      severity: 'warning',
      component: 'writes',
      state: 'attention',
    });
  }

  return {
    mode: 'sanitized-diagnostics' as const,
    rawProviderLogs: false as const,
    entries: entries.slice(0, 20),
    truncated: entries.length > 20,
  };
}
