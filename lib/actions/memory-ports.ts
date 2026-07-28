/**
 * Implementaciones en memoria para tests y entornos sin fuentes reales.
 */
import { createHash } from 'node:crypto';
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
  OwnershipProof,
  ProposalCreateMeta,
  ProposalRepositoryPort,
  TaskSnapshot,
} from '@/lib/actions/ports';

function opaque(prefix: string, seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `${prefix}-${hash.toString(36)}`;
}

function ownershipToken(seed: string): OwnershipProof {
  return createHash('sha256').update(`own:${seed}`).digest('hex').slice(0, 24);
}

export function createMemoryTaskPort(options?: {
  areaProjectMap?: Record<string, string>;
  failVerify?: boolean;
}): NotionTaskWritePort & {
  tasks: Map<string, TaskSnapshot & { ownership: OwnershipProof; archived?: boolean }>;
} {
  const tasks = new Map<string, TaskSnapshot & { ownership: OwnershipProof; archived?: boolean }>();
  const areaProjectMap = options?.areaProjectMap ?? {};

  return {
    tasks,
    async createTask(payload: TaskCreatePayload, meta) {
      const key = opaque('task', meta.idempotencyKey + payload.title);
      const ownership = ownershipToken(key + meta.idempotencyKey);
      tasks.set(key, {
        key,
        title: payload.title,
        status: 'Pendiente',
        areaKey: payload.areaKey,
        projectKey: payload.projectKey,
        projectAreaKey: payload.projectKey
          ? (areaProjectMap[payload.projectKey] ?? payload.areaKey)
          : null,
        ownership,
      });
      return { ok: true, key, ownership };
    },
    async getTask(key) {
      const task = tasks.get(key);
      if (!task || task.archived) return null;
      return task;
    },
    async updateTaskStatus(key, nextStatus, expectedPrevious) {
      const task = tasks.get(key);
      if (!task || task.archived)
        return { ok: false, code: 'not-found', message: 'Tarea no encontrada.' };
      if (task.status !== expectedPrevious) {
        return { ok: false, code: 'conflict', message: 'Estado previo distinto al esperado.' };
      }
      task.status = nextStatus;
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
    async archiveOwnedTask(key, ownershipProof) {
      const task = tasks.get(key);
      if (!task) return { ok: false, code: 'not-found', message: 'Tarea no encontrada.' };
      if (task.ownership !== ownershipProof) {
        return { ok: false, code: 'ownership-mismatch', message: 'Ownership inválido.' };
      }
      task.archived = true;
      return { ok: true };
    },
  };
}

export function createMemoryInboxPort(options?: { fail?: boolean }): NotionInboxWritePort & {
  captures: Map<string, InboxCapturePayload & { ownership: OwnershipProof; archived?: boolean }>;
} {
  const captures = new Map<
    string,
    InboxCapturePayload & { ownership: OwnershipProof; archived?: boolean }
  >();
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
      const key = opaque('inbox', meta.idempotencyKey);
      const ownership = ownershipToken(key + meta.idempotencyKey);
      captures.set(key, { ...payload, ownership });
      return { ok: true, key, ownership };
    },
    async archiveCapture(key, ownership) {
      const row = captures.get(key);
      if (!row) return { ok: false, code: 'not-found', message: 'Captura no encontrada.' };
      if (row.ownership !== ownership) {
        return { ok: false, code: 'ownership-mismatch', message: 'Ownership inválido.' };
      }
      row.archived = true;
      return { ok: true };
    },
    async verifyCapture(key) {
      const row = captures.get(key);
      if (!row) return { ok: true, present: false };
      return { ok: true, present: !row.archived };
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
    async markReverted(sessionId) {
      const row = sessions.get(sessionId);
      if (!row) return { ok: false, message: 'Sesión ausente.' };
      row.status = 'reverted';
      return { ok: true };
    },
  };
}

/** Re-export: implementación canónica en calendar-hold.ts. */
export { createMemoryCalendarHoldPort } from '@/lib/actions/calendar-hold';

export function createMemoryProposalPort(): ProposalRepositoryPort & {
  rows: Map<string, ActionProposalSummary>;
} {
  const rows = new Map<string, ActionProposalSummary>();
  return {
    rows,
    async create(payload: ProposalCreatePayload, meta: ProposalCreateMeta) {
      const summary: ActionProposalSummary = {
        key: meta.key,
        name: payload.name,
        actionType: payload.proposedActionType,
        targetType: payload.targetType,
        targetKey: payload.targetKey,
        status: 'pending',
        confirmationMode: meta.confirmationMode ?? 'explicit',
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
        expiresAt: meta.expiresAt,
        executionStartedAt: null,
        rollbackDeadline: null,
        rolledBackAt: null,
        payloadDigest: meta.payloadDigest,
        contractVersion: meta.contractVersion,
        source: meta.source,
        beforeDigest: meta.beforeDigest,
        diff: meta.diff,
        encryptedPayloadKey: meta.encryptedPayloadKey,
        ownershipDigest: null,
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
