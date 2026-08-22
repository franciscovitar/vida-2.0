/**
 * Construcción de dependencias de escritura según flag y entorno.
 * Preview/Production reales: adaptadores persistentes (nunca memoria silenciosa).
 */
import {
  allowMemoryWritePorts,
  assertNotionLiveForWrites,
  getGoogleCalendarWriteId,
  getNotionTaskOwnershipProperty,
  getWriteActionsConfig,
  getWriteApprovalTtlSeconds,
  getWriteContractVersion,
  getWriteCoordinationMode,
  getWriteProposalEncryptionKey,
  getWriteRollbackWindowSeconds,
  getWriteRuntimeStatus,
  isWriteActionsEnabled,
} from '@/lib/actions/config';
import {
  createMemoryWriteCoordination,
  createUpstashWriteCoordination,
  resolveWriteCoordinationConfig,
  type WriteCoordinationPort,
} from '@/lib/actions/coordination';
import {
  createMemoryEncryptedPayloadStore,
  createUpstashEncryptedPayloadStore,
  type EncryptedPayloadStore,
} from '@/lib/actions/encryption';
import { createGymSheetWritePortFromEnv } from '@/lib/actions/gym-sheets';
import type { HandlerDeps } from '@/lib/actions/handlers';
import {
  createCalendarHoldWritePort,
  createMemoryCalendarHoldPort,
  createNotConfiguredCalendarHoldPort,
} from '@/lib/actions/calendar-hold';
import { createGoogleCalendarHoldApiClient } from '@/lib/actions/calendar-hold-google';
import {
  createMemoryGymPort,
  createMemoryInboxPort,
  createMemoryProposalPort,
  createMemoryTaskPort,
} from '@/lib/actions/memory-ports';
import {
  createNotionAuditSink,
  createNotionIdempotencyStore,
  createNotionProposalRepository,
} from '@/lib/actions/notion-ledger';
import { createNotionActionsClient } from '@/lib/actions/notion-client';
import { createNotionInboxWritePort } from '@/lib/actions/notion-inbox';
import { createNotionTaskWritePort } from '@/lib/actions/notion-tasks';
import {
  createMemoryInboxCaptureMappingStore,
  createUpstashInboxCaptureMappingStore,
} from '@/lib/actions/inbox-mapping';
import type { AuditSink } from '@/lib/actions/audit';
import type { IdempotencyStore } from '@/lib/actions/idempotency';
import { createMemoryAuditSink, processAuditSink } from '@/lib/actions/audit';
import { createMemoryIdempotencyStore, processIdempotencyStore } from '@/lib/actions/idempotency';

/** Ledger de propuestas en memoria compartido entre requests de test (como idempotency). */
const processMemoryProposalPort = createMemoryProposalPort();
import type {
  CalendarHoldWritePort,
  GymSheetWritePort,
  NotionInboxWritePort,
  NotionTaskWritePort,
  ProposalRepositoryPort,
} from '@/lib/actions/ports';
import { getNotionConfig } from '@/lib/notion/config';
import { resolveCalendarConfig } from '@/lib/calendar/config-resolve';
import { randomBytes } from 'node:crypto';

function notConfiguredTaskPort(message: string): NotionTaskWritePort {
  return {
    async createTask() {
      return { ok: false, code: 'not-configured', message };
    },
    async getTask() {
      return null;
    },
    async updateTaskStatus() {
      return { ok: false, code: 'not-configured', message };
    },
    async resolveAreaProjectCompatibility() {
      return { ok: false, message };
    },
    async checkReady() {
      return { ok: false, code: 'not-configured', message };
    },
    async archiveOwnedTask() {
      return { ok: false, code: 'not-configured', message };
    },
  };
}

function notConfiguredInboxPort(message: string): NotionInboxWritePort {
  return {
    async appendCapture() {
      return {
        ok: false,
        code: 'not-configured',
        message,
        preserveText: true,
      };
    },
    async archiveCapture() {
      return { ok: false, code: 'not-configured', message };
    },
    async verifyCapture() {
      return { ok: false, message };
    },
    async checkReady() {
      return { ok: false, code: 'not-configured', message };
    },
  };
}

function notConfiguredGymPort(message: string): GymSheetWritePort {
  return {
    async createPendingSession() {
      return { ok: false, message };
    },
    async writeSets() {
      return { ok: false, written: 0, message };
    },
    async verifySession() {
      return { ok: false, message };
    },
    async setSessionStatus() {
      return { ok: false, message };
    },
    async markReverted() {
      return { ok: false, message };
    },
    async checkReady() {
      return { ok: false, code: 'not-configured', message };
    },
  };
}

function notConfiguredCalendar(message: string): CalendarHoldWritePort {
  return createNotConfiguredCalendarHoldPort(message);
}

function notConfiguredProposals(message: string): ProposalRepositoryPort {
  return {
    async create() {
      throw new Error(message);
    },
    async get() {
      return null;
    },
    async list() {
      return [];
    },
    async updateStatus() {
      return null;
    },
  };
}

export type WriteRuntimeBundle = {
  handlers: HandlerDeps;
  idempotency: IdempotencyStore;
  audit: AuditSink;
  coordination: WriteCoordinationPort | null;
  encryptionStore: EncryptedPayloadStore | null;
  status: ReturnType<typeof getWriteRuntimeStatus>;
  mode: 'closed' | 'memory-test' | 'real' | 'misconfigured';
};

/**
 * Construye puertos de handlers. Sin flag: cerrados, sin clientes externos.
 */
export function buildHandlerDeps(
  env: Readonly<Record<string, string | undefined>> = process.env,
  overrides?: Partial<HandlerDeps>,
): HandlerDeps {
  return buildWriteRuntime(env, overrides).handlers;
}

export function buildWriteRuntime(
  env: Readonly<Record<string, string | undefined>> = process.env,
  overrides?: Partial<HandlerDeps> & {
    idempotency?: IdempotencyStore;
    audit?: AuditSink;
    coordination?: WriteCoordinationPort;
    encryptionStore?: EncryptedPayloadStore;
    notionClient?: import('@/lib/actions/notion-client').NotionActionsClient;
  },
): WriteRuntimeBundle {
  const status = getWriteRuntimeStatus(env);

  if (!isWriteActionsEnabled(env)) {
    return {
      mode: 'closed',
      status,
      idempotency: overrides?.idempotency ?? createMemoryIdempotencyStore(),
      audit: overrides?.audit ?? createMemoryAuditSink(),
      coordination: null,
      encryptionStore: null,
      handlers: {
        tasks: overrides?.tasks ?? notConfiguredTaskPort('Escrituras desactivadas.'),
        inbox: overrides?.inbox ?? notConfiguredInboxPort('Escrituras desactivadas.'),
        gym: overrides?.gym ?? notConfiguredGymPort('Escrituras desactivadas.'),
        proposals: overrides?.proposals ?? notConfiguredProposals('Escrituras desactivadas.'),
        calendar: overrides?.calendar ?? notConfiguredCalendar('Escrituras desactivadas.'),
        encryptionStore: undefined,
        encryptionKey: null,
        coordination: undefined,
        now: overrides?.now,
      },
    };
  }

  if (allowMemoryWritePorts(env)) {
    const encryptionKey =
      overrides?.encryptionKey ?? getWriteProposalEncryptionKey(env) ?? randomBytes(32);
    const encryptionStore = overrides?.encryptionStore ?? createMemoryEncryptedPayloadStore();
    const coordination = overrides?.coordination ?? createMemoryWriteCoordination();
    return {
      mode: 'memory-test',
      status,
      idempotency: overrides?.idempotency ?? processIdempotencyStore,
      audit: overrides?.audit ?? processAuditSink,
      coordination,
      encryptionStore,
      handlers: {
        tasks: overrides?.tasks ?? createMemoryTaskPort(),
        inbox: overrides?.inbox ?? createMemoryInboxPort(),
        gym: overrides?.gym ?? createMemoryGymPort(),
        proposals: overrides?.proposals ?? processMemoryProposalPort,
        calendar: overrides?.calendar ?? createMemoryCalendarHoldPort(),
        encryptionStore,
        encryptionKey,
        coordination,
        approvalTtlSeconds: getWriteApprovalTtlSeconds(env),
        rollbackWindowSeconds: getWriteRollbackWindowSeconds(env),
        contractVersion: getWriteContractVersion(env),
        now: overrides?.now,
      },
    };
  }

  const live = assertNotionLiveForWrites(env);
  const config = getWriteActionsConfig(env);
  const notion = getNotionConfig(env);
  const token = env.NOTION_API_TOKEN?.trim() ?? '';
  const encryptionKey = overrides?.encryptionKey ?? getWriteProposalEncryptionKey(env);
  const coordinationMode = getWriteCoordinationMode(env);
  const contractVersion = getWriteContractVersion(env);
  const upstash = resolveWriteCoordinationConfig(env, contractVersion);

  // Real mode requires upstash coordination + encryption key or fail closed.
  if (!config.ok || !encryptionKey || coordinationMode !== 'upstash' || !upstash.ok) {
    return {
      mode: 'misconfigured',
      status,
      idempotency: overrides?.idempotency ?? createMemoryIdempotencyStore(),
      audit: overrides?.audit ?? createMemoryAuditSink(),
      coordination: null,
      encryptionStore: null,
      handlers: {
        tasks: notConfiguredTaskPort('Runtime de escrituras mal configurado.'),
        inbox: notConfiguredInboxPort('Runtime de escrituras mal configurado.'),
        gym: notConfiguredGymPort('Runtime de escrituras mal configurado.'),
        proposals: notConfiguredProposals('Runtime de escrituras mal configurado.'),
        calendar: notConfiguredCalendar('Runtime de escrituras mal configurado.'),
        encryptionKey: null,
        now: overrides?.now,
      },
    };
  }

  const client = overrides?.notionClient ?? (token ? createNotionActionsClient(token) : null);
  const coordination =
    overrides?.coordination ?? createUpstashWriteCoordination(upstash.value, encryptionKey);
  // Real/preview path MUST use Upstash encrypted payload store — never memory.
  const encryptionStore =
    overrides?.encryptionStore ?? createUpstashEncryptedPayloadStore(upstash.value);

  let tasks: NotionTaskWritePort;
  if (overrides?.tasks) {
    tasks = overrides.tasks;
  } else if (!live.ok) {
    tasks = notConfiguredTaskPort(live.message);
  } else if (!client || !notion.ok) {
    tasks = notConfiguredTaskPort('Integración Notion de tareas incompleta.');
  } else {
    tasks = createNotionTaskWritePort({
      client,
      tasksDataSourceId: notion.config.tasksDataSourceId,
      projectsDataSourceId: notion.config.projectsDataSourceId,
      areasDataSourceId: notion.config.areasDataSourceId,
      ownershipProperty: getNotionTaskOwnershipProperty(env),
    });
  }

  let inbox: NotionInboxWritePort;
  if (overrides?.inbox) {
    inbox = overrides.inbox;
  } else if (!client || !config.inboxPageId) {
    inbox = notConfiguredInboxPort('Bandeja no compartida o NOTION_INBOX_PAGE_ID ausente.');
  } else {
    const mappingStore = createUpstashInboxCaptureMappingStore(upstash.value, encryptionKey);
    inbox = createNotionInboxWritePort({
      client,
      inboxPageId: config.inboxPageId,
      mappingStore,
      mappingTtlSeconds: getWriteRollbackWindowSeconds(env),
    });
  }

  let gym: GymSheetWritePort;
  if (overrides?.gym) {
    gym = overrides.gym;
  } else if (!config.gymSessionsRange || !config.gymSetsRange) {
    gym = notConfiguredGymPort('Pestañas Gym Sessions/Sets no configuradas.');
  } else {
    gym = createGymSheetWritePortFromEnv({
      sessionsRange: config.gymSessionsRange,
      setsRange: config.gymSetsRange,
    });
  }

  let calendar: CalendarHoldWritePort;
  if (overrides?.calendar) {
    calendar = overrides.calendar;
  } else {
    const writeId = getGoogleCalendarWriteId(env);
    const oauth = resolveCalendarConfig(env);
    if (!writeId || !oauth.ok) {
      calendar = notConfiguredCalendar(
        !writeId
          ? 'GOOGLE_CALENDAR_WRITE_ID ausente.'
          : 'OAuth Calendar no configurado (fail-closed).',
      );
    } else {
      const googleClient = createGoogleCalendarHoldApiClient({
        oauth: oauth.config,
        writeCalendarId: writeId,
      });
      calendar = createCalendarHoldWritePort({
        calendarId: writeId,
        timezone: oauth.config.timezone,
        client: googleClient,
        contractVersion,
        hmacKey: encryptionKey,
      });
    }
  }

  let proposals: ProposalRepositoryPort;
  let idempotency: IdempotencyStore;
  let audit: AuditSink;

  if (client && config.actionsDataSourceId) {
    const ledgerDeps = {
      client,
      actionsDataSourceId: config.actionsDataSourceId,
    };
    proposals = overrides?.proposals ?? createNotionProposalRepository(ledgerDeps);
    idempotency = overrides?.idempotency ?? createNotionIdempotencyStore(ledgerDeps);
    audit = overrides?.audit ?? createNotionAuditSink(ledgerDeps);
  } else {
    proposals =
      overrides?.proposals ?? notConfiguredProposals('Base de acciones/propuestas no configurada.');
    idempotency = overrides?.idempotency ?? createMemoryIdempotencyStore();
    audit = overrides?.audit ?? createMemoryAuditSink();
  }

  return {
    mode: 'real',
    status,
    idempotency,
    audit,
    coordination,
    encryptionStore,
    handlers: {
      tasks,
      inbox,
      gym,
      proposals,
      calendar,
      encryptionStore,
      encryptionKey,
      coordination,
      approvalTtlSeconds: getWriteApprovalTtlSeconds(env),
      rollbackWindowSeconds: getWriteRollbackWindowSeconds(env),
      contractVersion,
      now: overrides?.now,
    },
  };
}

/**
 * Lista propuestas del runtime actual (persistente en Preview/Production real;
 * memoria solo en test o local explícito). No usa el loader legacy de memoria fresca.
 */
export async function listRuntimeProposals(
  env: Readonly<Record<string, string | undefined>> = process.env,
  overrides?: Parameters<typeof buildWriteRuntime>[1],
) {
  const runtime = buildWriteRuntime(env, overrides);
  return runtime.handlers.proposals.list();
}

export { getWriteRuntimeStatus, processAuditSink, processIdempotencyStore };

// Re-export memory mapping helper for tests that build inbox ports manually.
export { createMemoryInboxCaptureMappingStore };
