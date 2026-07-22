/**
 * Construcción de dependencias de escritura según flag y entorno.
 * Preview/Production reales: adaptadores persistentes (nunca memoria silenciosa).
 */
import {
  allowMemoryWritePorts,
  assertNotionLiveForWrites,
  getWriteActionsConfig,
  getWriteRuntimeStatus,
  isWriteActionsEnabled,
} from '@/lib/actions/config';
import { createGymSheetWritePortFromEnv } from '@/lib/actions/gym-sheets';
import type { HandlerDeps } from '@/lib/actions/handlers';
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
import type { AuditSink } from '@/lib/actions/audit';
import type { IdempotencyStore } from '@/lib/actions/idempotency';
import { createMemoryAuditSink, processAuditSink } from '@/lib/actions/audit';
import { createMemoryIdempotencyStore, processIdempotencyStore } from '@/lib/actions/idempotency';
import type {
  GymSheetWritePort,
  NotionInboxWritePort,
  NotionTaskWritePort,
  ProposalRepositoryPort,
} from '@/lib/actions/ports';
import { getNotionConfig } from '@/lib/notion/config';

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
  };
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
  status: ReturnType<typeof getWriteRuntimeStatus>;
  mode: 'closed' | 'memory-test' | 'real';
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
      handlers: {
        tasks: overrides?.tasks ?? notConfiguredTaskPort('Escrituras desactivadas.'),
        inbox: overrides?.inbox ?? notConfiguredInboxPort('Escrituras desactivadas.'),
        gym: overrides?.gym ?? notConfiguredGymPort('Escrituras desactivadas.'),
        proposals: overrides?.proposals ?? notConfiguredProposals('Escrituras desactivadas.'),
        now: overrides?.now,
      },
    };
  }

  if (allowMemoryWritePorts(env)) {
    return {
      mode: 'memory-test',
      status,
      idempotency: overrides?.idempotency ?? processIdempotencyStore,
      audit: overrides?.audit ?? processAuditSink,
      handlers: {
        tasks: overrides?.tasks ?? createMemoryTaskPort(),
        inbox: overrides?.inbox ?? createMemoryInboxPort(),
        gym: overrides?.gym ?? createMemoryGymPort(),
        proposals: overrides?.proposals ?? createMemoryProposalPort(),
        now: overrides?.now,
      },
    };
  }

  const live = assertNotionLiveForWrites(env);
  const config = getWriteActionsConfig(env);
  const notion = getNotionConfig(env);
  const token = env.NOTION_API_TOKEN?.trim() ?? '';

  if (!config.ok) {
    return {
      mode: 'closed',
      status,
      idempotency: overrides?.idempotency ?? createMemoryIdempotencyStore(),
      audit: overrides?.audit ?? createMemoryAuditSink(),
      handlers: {
        tasks: notConfiguredTaskPort('Escrituras desactivadas.'),
        inbox: notConfiguredInboxPort('Escrituras desactivadas.'),
        gym: notConfiguredGymPort('Escrituras desactivadas.'),
        proposals: notConfiguredProposals('Escrituras desactivadas.'),
        now: overrides?.now,
      },
    };
  }

  const client = overrides?.notionClient ?? (token ? createNotionActionsClient(token) : null);

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
    });
  }

  let inbox: NotionInboxWritePort;
  if (overrides?.inbox) {
    inbox = overrides.inbox;
  } else if (!client || !config.inboxPageId) {
    inbox = notConfiguredInboxPort('Bandeja no compartida o NOTION_INBOX_PAGE_ID ausente.');
  } else {
    inbox = createNotionInboxWritePort({
      client,
      inboxPageId: config.inboxPageId,
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
    // Sin ledger: no usar process* en Preview/Production. Stores vacíos locales
    // solo rechazan/no persisten entre instancias — status ya marca unavailable.
  }

  return {
    mode: 'real',
    status,
    idempotency,
    audit,
    handlers: {
      tasks,
      inbox,
      gym,
      proposals,
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
