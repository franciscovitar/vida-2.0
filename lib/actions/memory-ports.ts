/**
 * Implementaciones en memoria para tests y entornos sin fuentes reales.
 */
import type {
  ActionProposalSummary,
  GymSessionCreatePayload,
  InboxCapturePayload,
  ProposalCreatePayload,
  ProposalStatus,
  TaskCreatePayload,
} from '@/types/actions';
import type {
  GymSheetWritePort,
  GymSessionRowStatus,
  NotionInboxWritePort,
  NotionTaskWritePort,
  ProposalRepositoryPort,
  TaskSnapshot,
} from '@/lib/actions/ports';

function opaque(prefix: string, seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `${prefix}-${hash.toString(36)}`;
}

export function createMemoryTaskPort(options?: {
  areaProjectMap?: Record<string, string>;
  failVerify?: boolean;
}): NotionTaskWritePort & { tasks: Map<string, TaskSnapshot> } {
  const tasks = new Map<string, TaskSnapshot>();
  const areaProjectMap = options?.areaProjectMap ?? {};

  return {
    tasks,
    async createTask(payload: TaskCreatePayload, meta) {
      const key = opaque('task', meta.idempotencyKey + payload.title);
      tasks.set(key, {
        key,
        title: payload.title,
        status: 'Pendiente',
        areaKey: payload.areaKey,
        projectKey: payload.projectKey,
        projectAreaKey: payload.projectKey
          ? (areaProjectMap[payload.projectKey] ?? payload.areaKey)
          : null,
      });
      return { ok: true, key };
    },
    async getTask(key) {
      return tasks.get(key) ?? null;
    },
    async updateTaskStatus(key, nextStatus, expectedPrevious) {
      const task = tasks.get(key);
      if (!task) return { ok: false, code: 'not-found', message: 'Tarea no encontrada.' };
      if (task.status !== expectedPrevious) {
        return { ok: false, code: 'conflict', message: 'Estado previo distinto al esperado.' };
      }
      task.status = nextStatus;
      if (options?.failVerify) {
        // leave status wrong for verify path — caller re-reads
      }
      return { ok: true };
    },
    async resolveAreaProjectCompatibility(areaKey, projectKey) {
      if (!projectKey) return { ok: true };
      const projectArea = areaProjectMap[projectKey];
      if (projectArea && projectArea !== areaKey) {
        return { ok: false, message: 'Área incompatible con el Proyecto.' };
      }
      return { ok: true };
    },
  };
}

export function createMemoryInboxPort(options?: {
  fail?: boolean;
}): NotionInboxWritePort & { captures: InboxCapturePayload[] } {
  const captures: InboxCapturePayload[] = [];
  return {
    captures,
    async appendCapture(payload, meta) {
      if (options?.fail) {
        return {
          ok: false,
          code: 'not-configured',
          message: 'Bandeja no configurada.',
          preserveText: true,
        };
      }
      captures.push(payload);
      return { ok: true, key: opaque('inbox', meta.idempotencyKey) };
    },
  };
}

export function createMemoryGymPort(options?: {
  failSetsAfter?: number;
  failVerify?: boolean;
}): GymSheetWritePort & {
  sessions: Map<
    string,
    { status: GymSessionRowStatus; sets: number; payload: GymSessionCreatePayload }
  >;
} {
  const sessions = new Map<
    string,
    { status: GymSessionRowStatus; sets: number; payload: GymSessionCreatePayload }
  >();
  return {
    sessions,
    async createPendingSession(payload, meta) {
      sessions.set(meta.sessionId, { status: 'pending', sets: 0, payload });
      return { ok: true };
    },
    async writeSets(sessionId, sets) {
      const row = sessions.get(sessionId);
      if (!row) return { ok: false, written: 0, message: 'Sesión ausente.' };
      const limit = options?.failSetsAfter;
      let written = 0;
      for (let i = 0; i < sets.length; i += 1) {
        if (limit !== undefined && i >= limit) {
          row.sets = written;
          return { ok: false, written, message: 'Fallo parcial al escribir sets.' };
        }
        written += 1;
      }
      row.sets = written;
      return { ok: true, written };
    },
    async verifySession(sessionId, expectedSets) {
      const row = sessions.get(sessionId);
      if (!row) return { ok: false, message: 'Sesión ausente.' };
      if (options?.failVerify) return { ok: false, message: 'Verificación fallida.' };
      if (row.sets !== expectedSets) return { ok: false, message: 'Sets incompletos.' };
      return { ok: true };
    },
    async setSessionStatus(sessionId, status) {
      const row = sessions.get(sessionId);
      if (!row) return { ok: false, message: 'Sesión ausente.' };
      row.status = status;
      return { ok: true };
    },
  };
}

export function createMemoryProposalPort(): ProposalRepositoryPort & {
  rows: Map<string, ActionProposalSummary>;
} {
  const rows = new Map<string, ActionProposalSummary>();
  return {
    rows,
    async create(payload: ProposalCreatePayload, meta) {
      const summary: ActionProposalSummary = {
        key: meta.key,
        name: payload.name,
        actionType: payload.proposedActionType,
        targetType: payload.targetType,
        targetKey: payload.targetKey,
        status: 'pending',
        confirmationMode: 'explicit',
        risk: payload.risk,
        reversible: payload.reversible,
        reason: payload.reason,
        expectedChange: payload.expectedChange,
        beforeSummary: null,
        afterSummary: null,
        createdAt: meta.createdAt,
        decidedAt: null,
        appliedAt: null,
        resultCode: null,
      };
      rows.set(meta.key, summary);
      return summary;
    },
    async get(key) {
      return rows.get(key) ?? null;
    },
    async list(status?: ProposalStatus) {
      const all = [...rows.values()];
      return status ? all.filter((row) => row.status === status) : all;
    },
    async updateStatus(key, status, patch) {
      const row = rows.get(key);
      if (!row) return null;
      const next = { ...row, status, ...patch };
      rows.set(key, next);
      return next;
    },
  };
}
