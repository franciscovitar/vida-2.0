/**
 * Feature flag y configuración de escrituras (solo servidor).
 * Fail-closed: defaults seguros; nunca activa escrituras por omisión.
 */
import { getNotionConfig, getNotionDataSource } from '@/lib/notion/config';
import { CALENDAR_TIMEZONE } from '@/lib/calendar/constants';
import { WRITE_CONTRACT_VERSION } from '@/types/actions';
import { validateEncryptionKey } from '@/lib/actions/encryption';

export function isWriteActionsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.WRITE_ACTIONS_ENABLED === 'true';
}

export function isWriteActionsUseMemory(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.WRITE_ACTIONS_USE_MEMORY === 'true';
}

/**
 * Memoria solo para tests o desarrollo local explícito.
 * Nunca como fallback silencioso en Preview/Production.
 */
export function allowMemoryWritePorts(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (isWriteActionsUseMemory(env)) {
    const vercelEnv = env.VERCEL_ENV;
    if (vercelEnv === 'preview' || vercelEnv === 'production') return false;
    return true;
  }
  return env.NODE_ENV === 'test';
}

export type WriteCoordinationMode = 'unavailable' | 'memory-test' | 'upstash';

export function getWriteCoordinationMode(
  env: Readonly<Record<string, string | undefined>> = process.env,
): WriteCoordinationMode {
  const raw = (env.WRITE_COORDINATION_MODE ?? '').trim().toLowerCase();
  if (raw === 'memory-test' || raw === 'upstash' || raw === 'unavailable') {
    return raw;
  }
  if (allowMemoryWritePorts(env)) return 'memory-test';
  return 'unavailable';
}

export function getWriteApprovalTtlSeconds(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = Number(env.WRITE_APPROVAL_TTL_SECONDS ?? '86400');
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 86_400;
}

export function getWriteRollbackWindowSeconds(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = Number(env.WRITE_ROLLBACK_WINDOW_SECONDS ?? '604800');
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 604_800;
}

export function getWriteContractVersion(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const raw = env.WRITE_CONTRACT_VERSION?.trim();
  return raw || WRITE_CONTRACT_VERSION;
}

export function getWriteProposalEncryptionKey(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Buffer | null {
  return validateEncryptionKey(env.WRITE_PROPOSAL_ENCRYPTION_KEY);
}

export function getGoogleCalendarWriteId(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const id = env.GOOGLE_CALENDAR_WRITE_ID?.trim();
  return id || null;
}

/** Notion Tasks rich_text property for Vida2 ownership proof. Default: "Vida2 Ownership". */
export function getNotionTaskOwnershipProperty(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const raw = env.NOTION_TASK_OWNERSHIP_PROPERTY?.trim();
  return raw || 'Vida2 Ownership';
}

export function getGoogleCalendarTimezoneForWrites(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return env.GOOGLE_CALENDAR_TIMEZONE?.trim() || CALENDAR_TIMEZONE;
}

/**
 * OpenClaw proposal-only: requiere ambas compuertas exactas (`true`).
 * No habilita approve/reject/rollback ni escrituras directas vía OpenClaw.
 */
export function isOpenClawProposalsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.OPENCLAW_PROPOSALS_ENABLED === 'true' && env.WRITE_ACTIONS_ENABLED === 'true';
}

export type WriteActionsConfig =
  | {
      ok: true;
      inboxPageId: string | null;
      actionsDataSourceId: string | null;
      gymSessionsRange: string | null;
      gymSetsRange: string | null;
      calendarWriteId: string | null;
      coordinationMode: WriteCoordinationMode;
      encryptionReady: boolean;
      contractVersion: string;
      approvalTtlSeconds: number;
      rollbackWindowSeconds: number;
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
    calendarWriteId: getGoogleCalendarWriteId(env),
    coordinationMode: getWriteCoordinationMode(env),
    encryptionReady: getWriteProposalEncryptionKey(env) !== null,
    contractVersion: getWriteContractVersion(env),
    approvalTtlSeconds: getWriteApprovalTtlSeconds(env),
    rollbackWindowSeconds: getWriteRollbackWindowSeconds(env),
  };
}

export type IntegrationRuntimeState = 'ready' | 'disabled' | 'misconfigured';
export type IdempotencyRuntimeState = 'persistent' | 'memory-test' | 'unavailable';
export type WriteGlobalRuntimeState = 'disabled' | 'misconfigured' | 'degraded' | 'ready';

export type WriteRuntimeComponents = {
  policy: IntegrationRuntimeState;
  proposalsLedger: IntegrationRuntimeState;
  encryptedPayloadStore: IntegrationRuntimeState;
  coordination: IntegrationRuntimeState;
  idempotency: IntegrationRuntimeState;
  audit: IntegrationRuntimeState;
  notionTasks: IntegrationRuntimeState;
  notionInbox: IntegrationRuntimeState;
  sheetsGym: IntegrationRuntimeState;
  calendarHold: IntegrationRuntimeState;
  rollback: IntegrationRuntimeState;
  openclawProposals: IntegrationRuntimeState;
};

export type WriteRuntimeStatus = {
  writesEnabled: boolean;
  /** Estado global agregado. */
  global: WriteGlobalRuntimeState;
  /** Componentes sanitizados (sin IDs ni secretos). */
  components: WriteRuntimeComponents;
  /**
   * Alias legacy (tests / callers 8E1). Preferir `components`.
   * @deprecated Use components.notionTasks etc.
   */
  tasks: IntegrationRuntimeState;
  inbox: IntegrationRuntimeState;
  gym: IntegrationRuntimeState;
  proposals: IntegrationRuntimeState;
  audit: IntegrationRuntimeState;
  /** Detalle de idempotencia (memory-test vs persistent). */
  idempotency: IdempotencyRuntimeState;
  coordination: IntegrationRuntimeState;
  encryption: IntegrationRuntimeState;
  calendarHold: IntegrationRuntimeState;
  rollback: IntegrationRuntimeState;
  openclawProposals: IntegrationRuntimeState;
  /** Códigos sanitizados de preflight (sin valores). */
  issues: readonly string[];
};

function notionTokenPresent(env: Readonly<Record<string, string | undefined>>): boolean {
  return Boolean(env.NOTION_API_TOKEN?.trim());
}

function closedComponents(): WriteRuntimeComponents {
  return {
    policy: 'disabled',
    proposalsLedger: 'disabled',
    encryptedPayloadStore: 'disabled',
    coordination: 'disabled',
    idempotency: 'disabled',
    audit: 'disabled',
    notionTasks: 'disabled',
    notionInbox: 'disabled',
    sheetsGym: 'disabled',
    calendarHold: 'disabled',
    rollback: 'disabled',
    openclawProposals: 'disabled',
  };
}

function deriveGlobal(components: WriteRuntimeComponents): WriteGlobalRuntimeState {
  const critical: (keyof WriteRuntimeComponents)[] = [
    'policy',
    'proposalsLedger',
    'encryptedPayloadStore',
    'coordination',
    'idempotency',
    'audit',
    'rollback',
  ];
  for (const key of critical) {
    const state = components[key];
    if (state === 'disabled' || state === 'misconfigured') return 'misconfigured';
  }
  const optional: (keyof WriteRuntimeComponents)[] = [
    'notionTasks',
    'notionInbox',
    'sheetsGym',
    'calendarHold',
    'openclawProposals',
  ];
  for (const key of optional) {
    const state = components[key];
    if (state === 'misconfigured') return 'degraded';
  }
  return 'ready';
}

function closedStatus(): WriteRuntimeStatus {
  const components = closedComponents();
  return {
    writesEnabled: false,
    global: 'disabled',
    components,
    tasks: 'disabled',
    inbox: 'disabled',
    gym: 'disabled',
    proposals: 'disabled',
    audit: 'disabled',
    idempotency: 'unavailable',
    coordination: 'disabled',
    encryption: 'disabled',
    calendarHold: 'disabled',
    rollback: 'disabled',
    openclawProposals: 'disabled',
    issues: [],
  };
}

function withAliases(
  components: WriteRuntimeComponents,
  idempotencyDetail: IdempotencyRuntimeState,
  issues: readonly string[],
): WriteRuntimeStatus {
  return {
    writesEnabled: true,
    global: deriveGlobal(components),
    components,
    tasks: components.notionTasks,
    inbox: components.notionInbox,
    gym: components.sheetsGym,
    proposals: components.proposalsLedger,
    audit: components.audit,
    idempotency: idempotencyDetail,
    coordination: components.coordination,
    encryption: components.encryptedPayloadStore,
    calendarHold: components.calendarHold,
    rollback: components.rollback,
    openclawProposals: components.openclawProposals,
    issues,
  };
}

/**
 * Estado sanitizado de runtime (sin IDs, URLs ni secretos).
 * Fail closed en preview/production (sin memory fallback).
 */
export function getWriteRuntimeStatus(
  env: Readonly<Record<string, string | undefined>> = process.env,
): WriteRuntimeStatus {
  if (!isWriteActionsEnabled(env)) {
    return closedStatus();
  }

  if (allowMemoryWritePorts(env)) {
    const components: WriteRuntimeComponents = {
      policy: 'ready',
      proposalsLedger: 'ready',
      encryptedPayloadStore: 'ready',
      coordination: 'ready',
      idempotency: 'ready',
      audit: 'ready',
      notionTasks: 'ready',
      notionInbox: 'ready',
      sheetsGym: 'ready',
      calendarHold: 'ready',
      rollback: 'ready',
      openclawProposals: isOpenClawProposalsEnabled(env) ? 'ready' : 'disabled',
    };
    return withAliases(components, 'memory-test', []);
  }

  const issues: string[] = [];
  const notionMode = getNotionDataSource(env);
  const notionConfig = getNotionConfig(env);
  const writeConfig = getWriteActionsConfig(env);
  const tokenOk = notionTokenPresent(env);
  const encryptionKey = getWriteProposalEncryptionKey(env);
  const coordinationMode = getWriteCoordinationMode(env);
  const hasUpstash =
    Boolean(env.UPSTASH_REDIS_REST_URL?.trim()) && Boolean(env.UPSTASH_REDIS_REST_TOKEN?.trim());

  const policy: IntegrationRuntimeState = 'ready';

  let notionTasks: IntegrationRuntimeState = 'misconfigured';
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
    notionTasks = 'ready';
  }

  let encryptedPayloadStore: IntegrationRuntimeState = 'misconfigured';
  if (encryptionKey && coordinationMode === 'upstash' && hasUpstash) {
    encryptedPayloadStore = 'ready';
  } else if (!encryptionKey) {
    issues.push('encryption-key-missing');
  } else {
    issues.push('encrypted-payload-store-requires-upstash');
  }

  let coordination: IntegrationRuntimeState = 'misconfigured';
  if (coordinationMode === 'upstash' && hasUpstash) {
    coordination = 'ready';
  } else if (coordinationMode === 'memory-test') {
    // No permitido en preview/production (allowMemory ya filtró).
    issues.push('coordination-memory-forbidden');
  } else {
    issues.push('coordination-unavailable');
  }

  let calendarHold: IntegrationRuntimeState = 'misconfigured';
  const calendarOauth =
    Boolean(env.GOOGLE_CALENDAR_CLIENT_ID?.trim()) &&
    Boolean(env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()) &&
    Boolean(env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim());
  if (writeConfig.ok && writeConfig.calendarWriteId && calendarOauth) {
    calendarHold = 'ready';
  } else if (!writeConfig.ok || !writeConfig.calendarWriteId) {
    issues.push('calendar-write-id-missing');
  } else {
    issues.push('calendar-oauth-missing');
  }

  let notionInbox: IntegrationRuntimeState = 'misconfigured';
  if (writeConfig.ok && writeConfig.inboxPageId && tokenOk && coordination === 'ready') {
    notionInbox = 'ready';
  } else if (!writeConfig.ok || !writeConfig.inboxPageId) {
    issues.push('inbox-page-missing');
  } else if (coordination !== 'ready') {
    issues.push('inbox-mapping-requires-upstash');
  }

  let sheetsGym: IntegrationRuntimeState = 'misconfigured';
  if (writeConfig.ok && writeConfig.gymSessionsRange && writeConfig.gymSetsRange) {
    sheetsGym = 'ready';
  } else {
    issues.push('gym-ranges-missing');
  }

  let proposalsLedger: IntegrationRuntimeState = 'misconfigured';
  let audit: IntegrationRuntimeState = 'misconfigured';
  let idempotency: IntegrationRuntimeState = 'misconfigured';
  let idempotencyDetail: IdempotencyRuntimeState = 'unavailable';
  let rollback: IntegrationRuntimeState = 'misconfigured';
  if (
    writeConfig.ok &&
    writeConfig.actionsDataSourceId &&
    tokenOk &&
    encryptedPayloadStore === 'ready'
  ) {
    proposalsLedger = 'ready';
    audit = 'ready';
    idempotency = 'ready';
    idempotencyDetail = 'persistent';
    rollback = coordination === 'ready' ? 'ready' : 'misconfigured';
  } else {
    issues.push('actions-data-source-missing');
  }

  const openclawProposals: IntegrationRuntimeState = isOpenClawProposalsEnabled(env)
    ? proposalsLedger === 'ready' && encryptedPayloadStore === 'ready'
      ? 'ready'
      : 'misconfigured'
    : 'disabled';

  const components: WriteRuntimeComponents = {
    policy,
    proposalsLedger,
    encryptedPayloadStore,
    coordination,
    idempotency,
    audit,
    notionTasks,
    notionInbox,
    sheetsGym,
    calendarHold,
    rollback,
    openclawProposals,
  };

  return withAliases(components, idempotencyDetail, issues);
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
