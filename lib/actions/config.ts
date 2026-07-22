/**
 * Feature flag y configuración de escrituras (solo servidor).
 */
import { getNotionConfig, getNotionDataSource } from '@/lib/notion/config';

export function isWriteActionsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.WRITE_ACTIONS_ENABLED === 'true';
}

/**
 * Memoria solo para tests o desarrollo local explícito.
 * Nunca como fallback silencioso en Preview/Production.
 *
 * Usa el `env` inyectado (no fuerza memoria solo porque el proceso de test
 * tenga NODE_ENV=test cuando el caller simula Preview).
 */
export function allowMemoryWritePorts(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (env.WRITE_ACTIONS_USE_MEMORY === 'true') {
    const vercelEnv = env.VERCEL_ENV;
    if (vercelEnv === 'preview' || vercelEnv === 'production') return false;
    return true;
  }
  return env.NODE_ENV === 'test';
}

export type WriteActionsConfig =
  | {
      ok: true;
      inboxPageId: string | null;
      actionsDataSourceId: string | null;
      gymSessionsRange: string | null;
      gymSetsRange: string | null;
    }
  | { ok: false; reason: 'flag-disabled' };

export function getWriteActionsConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): WriteActionsConfig {
  if (!isWriteActionsEnabled(env)) {
    return { ok: false, reason: 'flag-disabled' };
  }
  return {
    ok: true,
    inboxPageId: env.NOTION_INBOX_PAGE_ID?.trim() || null,
    actionsDataSourceId: env.NOTION_ACTIONS_DATA_SOURCE_ID?.trim() || null,
    gymSessionsRange: env.SHEETS_GYM_SESSIONS_RANGE?.trim() || null,
    gymSetsRange: env.SHEETS_GYM_SETS_RANGE?.trim() || null,
  };
}

export type IntegrationRuntimeState = 'ready' | 'disabled' | 'misconfigured';
export type IdempotencyRuntimeState = 'persistent' | 'memory-test' | 'unavailable';

export type WriteRuntimeStatus = {
  writesEnabled: boolean;
  tasks: IntegrationRuntimeState;
  inbox: IntegrationRuntimeState;
  gym: IntegrationRuntimeState;
  proposals: IntegrationRuntimeState;
  audit: IntegrationRuntimeState;
  idempotency: IdempotencyRuntimeState;
  /** Códigos sanitizados de preflight (sin valores). */
  issues: readonly string[];
};

function notionTokenPresent(env: Readonly<Record<string, string | undefined>>): boolean {
  return Boolean(env.NOTION_API_TOKEN?.trim());
}

/**
 * Estado sanitizado de runtime (sin IDs, URLs ni secretos).
 */
export function getWriteRuntimeStatus(
  env: Readonly<Record<string, string | undefined>> = process.env,
): WriteRuntimeStatus {
  if (!isWriteActionsEnabled(env)) {
    return {
      writesEnabled: false,
      tasks: 'disabled',
      inbox: 'disabled',
      gym: 'disabled',
      proposals: 'disabled',
      audit: 'disabled',
      idempotency: 'unavailable',
      issues: [],
    };
  }

  if (allowMemoryWritePorts(env)) {
    return {
      writesEnabled: true,
      tasks: 'ready',
      inbox: 'ready',
      gym: 'ready',
      proposals: 'ready',
      audit: 'ready',
      idempotency: 'memory-test',
      issues: [],
    };
  }

  const issues: string[] = [];
  const notionMode = getNotionDataSource(env);
  const notionConfig = getNotionConfig(env);
  const writeConfig = getWriteActionsConfig(env);
  const tokenOk = notionTokenPresent(env);

  let tasks: IntegrationRuntimeState = 'misconfigured';
  if (!tokenOk) {
    issues.push('notion-token-missing');
  } else if (notionMode !== 'notion') {
    issues.push('notion-data-source-not-live');
  } else if (!notionConfig.ok) {
    issues.push(
      notionConfig.reason === 'forbidden-data-source'
        ? 'notion-data-source-forbidden'
        : 'notion-tasks-misconfigured',
    );
  } else {
    tasks = 'ready';
  }

  let inbox: IntegrationRuntimeState = 'misconfigured';
  if (writeConfig.ok && writeConfig.inboxPageId && tokenOk) {
    inbox = 'ready';
  } else if (!writeConfig.ok || !writeConfig.inboxPageId) {
    issues.push('inbox-page-missing');
  }

  let gym: IntegrationRuntimeState = 'misconfigured';
  if (writeConfig.ok && writeConfig.gymSessionsRange && writeConfig.gymSetsRange) {
    gym = 'ready';
  } else {
    issues.push('gym-ranges-missing');
  }

  let proposals: IntegrationRuntimeState = 'misconfigured';
  let audit: IntegrationRuntimeState = 'misconfigured';
  let idempotency: IdempotencyRuntimeState = 'unavailable';
  if (writeConfig.ok && writeConfig.actionsDataSourceId && tokenOk) {
    proposals = 'ready';
    audit = 'ready';
    idempotency = 'persistent';
  } else {
    issues.push('actions-data-source-missing');
  }

  return {
    writesEnabled: true,
    tasks,
    inbox,
    gym,
    proposals,
    audit,
    idempotency,
    issues,
  };
}

/** Preflight cerrado: lectura mock + escritura real no se mezclan. */
export function assertNotionLiveForWrites(
  env: Readonly<Record<string, string | undefined>> = process.env,
): { ok: true } | { ok: false; code: string; message: string } {
  if (!isWriteActionsEnabled(env)) return { ok: true };
  if (allowMemoryWritePorts(env)) return { ok: true };
  if (getNotionDataSource(env) !== 'notion') {
    return {
      ok: false,
      code: 'notion-data-source-not-live',
      message: 'NOTION_DATA_SOURCE debe ser notion cuando las escrituras reales están activas.',
    };
  }
  return { ok: true };
}
