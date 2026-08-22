'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { verifySession } from '@/lib/auth/dal';
import { getAutomationsDashboardData } from '@/lib/automations/dashboard';
import { resolveManualAutomationRequest } from '@/lib/automations/manual';
import { buildAutomationRuntime } from '@/lib/automations/runtime';
import { buildAutomationStateStore } from '@/lib/automations/store';
import { AUTOMATION_WORKFLOW_KEYS, type AutomationWorkflowKey } from '@/types/automations';

function workflowKey(value: unknown): AutomationWorkflowKey | null {
  return typeof value === 'string' &&
    (AUTOMATION_WORKFLOW_KEYS as readonly string[]).includes(value)
    ? (value as AutomationWorkflowKey)
    : null;
}

export async function loadAutomationsDashboard() {
  const session = await verifySession();
  if (!session.ok) return null;
  return getAutomationsDashboardData();
}

export async function runAutomationNow(input: { workflowKey: string; confirmed: boolean }) {
  const session = await verifySession();
  if (!session.ok)
    return {
      ok: false,
      code: 'unauthorized' as const,
      message: 'Tenés que iniciar sesión.',
      run: null,
    };
  const request = resolveManualAutomationRequest(input);
  if (!request)
    return {
      ok: false,
      code: 'invalid-input' as const,
      message: 'Confirmación inválida.',
      run: null,
    };
  const runtime = buildAutomationRuntime();
  if (!runtime)
    return {
      ok: false,
      code: 'misconfigured' as const,
      message: 'La automatización todavía no está configurada.',
      run: null,
    };
  try {
    const result = await runtime.start({
      workflowKey: request.workflowKey,
      principalKey: request.principalKey,
      trigger: 'manual',
      idempotencyKey: `manual:${randomUUID()}`,
      confirmed: true,
    });
    revalidatePath('/automatizaciones');
    revalidatePath('/ajustes');
    return result;
  } catch {
    return {
      ok: false,
      code: 'failed' as const,
      message: 'La automatización no está disponible temporalmente.',
      run: null,
    };
  }
}

export async function setAutomationPaused(input: {
  workflowKey: string;
  paused: boolean;
  confirmed: boolean;
}) {
  const session = await verifySession();
  if (!session.ok) return { ok: false, message: 'Tenés que iniciar sesión.' };
  const key = workflowKey(input.workflowKey);
  if (!key || typeof input.paused !== 'boolean' || input.confirmed !== true)
    return { ok: false, message: 'Solicitud inválida.' };
  const store = buildAutomationStateStore();
  if (!store) return { ok: false, message: 'El store de automatizaciones no está configurado.' };
  try {
    const now = new Date().toISOString();
    const current = (await store.getWorkflowControl(key)) ?? {
      workflowKey: key,
      paused: false,
      circuit: { mode: 'closed' as const, consecutiveFailures: 0, openedAt: null },
      updatedAt: now,
    };
    await store.putWorkflowControl({
      ...current,
      paused: input.paused,
      circuit: input.paused
        ? current.circuit
        : { mode: 'closed', consecutiveFailures: 0, openedAt: null },
      updatedAt: now,
    });
    revalidatePath('/automatizaciones');
    revalidatePath('/ajustes');
    return { ok: true, message: input.paused ? 'Workflow pausado.' : 'Workflow reanudado.' };
  } catch {
    return { ok: false, message: 'El control no está disponible temporalmente.' };
  }
}
