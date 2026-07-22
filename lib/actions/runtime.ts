/**
 * Dependencias de runtime: sin escrituras reales hasta que Work configure fuentes.
 * Los puertos de producción responden not-configured si faltan variables.
 */
import {
  createMemoryGymPort,
  createMemoryInboxPort,
  createMemoryProposalPort,
  createMemoryTaskPort,
} from '@/lib/actions/memory-ports';
import { getWriteActionsConfig, isWriteActionsEnabled } from '@/lib/actions/config';
import type { HandlerDeps } from '@/lib/actions/handlers';
import type {
  GymSheetWritePort,
  NotionInboxWritePort,
  NotionTaskWritePort,
} from '@/lib/actions/ports';

function notConfiguredTaskPort(): NotionTaskWritePort {
  return {
    async createTask() {
      return {
        ok: false,
        code: 'not-configured',
        message: 'Escritura Notion de tareas pendiente de configuración externa.',
      };
    },
    async getTask() {
      return null;
    },
    async updateTaskStatus() {
      return {
        ok: false,
        code: 'not-configured',
        message: 'Escritura Notion de tareas pendiente de configuración externa.',
      };
    },
    async resolveAreaProjectCompatibility() {
      return { ok: true };
    },
  };
}

function notConfiguredInboxPort(): NotionInboxWritePort {
  return {
    async appendCapture() {
      return {
        ok: false,
        code: 'not-configured',
        message: 'Bandeja no compartida o NOTION_INBOX_PAGE_ID ausente.',
        preserveText: true,
      };
    },
  };
}

function notConfiguredGymPort(): GymSheetWritePort {
  return {
    async createPendingSession() {
      return { ok: false, message: 'Pestañas Gym Sessions/Sets no configuradas.' };
    },
    async writeSets() {
      return { ok: false, written: 0, message: 'Pestañas Gym no configuradas.' };
    },
    async verifySession() {
      return { ok: false, message: 'Pestañas Gym no configuradas.' };
    },
    async setSessionStatus() {
      return { ok: false, message: 'Pestañas Gym no configuradas.' };
    },
  };
}

/** Propuestas en memoria de proceso (hasta base Notion externa). */
const processProposals = createMemoryProposalPort();

export function buildHandlerDeps(
  env: Readonly<Record<string, string | undefined>> = process.env,
  overrides?: Partial<HandlerDeps>,
): HandlerDeps {
  const config = getWriteActionsConfig(env);
  const useMemory = env.WRITE_ACTIONS_USE_MEMORY === 'true' || process.env.NODE_ENV === 'test';

  if (useMemory) {
    return {
      tasks: overrides?.tasks ?? createMemoryTaskPort(),
      inbox: overrides?.inbox ?? createMemoryInboxPort(),
      gym: overrides?.gym ?? createMemoryGymPort(),
      proposals: overrides?.proposals ?? processProposals,
      now: overrides?.now,
    };
  }

  if (!config.ok || !isWriteActionsEnabled(env)) {
    return {
      tasks: notConfiguredTaskPort(),
      inbox: notConfiguredInboxPort(),
      gym: notConfiguredGymPort(),
      proposals: processProposals,
      now: overrides?.now,
    };
  }

  return {
    tasks: overrides?.tasks ?? notConfiguredTaskPort(),
    inbox:
      overrides?.inbox ??
      (config.inboxPageId ? notConfiguredInboxPort() : notConfiguredInboxPort()),
    gym:
      overrides?.gym ??
      (config.gymSessionsRange && config.gymSetsRange
        ? notConfiguredGymPort()
        : notConfiguredGymPort()),
    proposals: overrides?.proposals ?? processProposals,
    now: overrides?.now,
  };
}

export function listProcessProposals() {
  return processProposals.list();
}
