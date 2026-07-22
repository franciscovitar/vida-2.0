/**
 * Validación de payloads (sin any; enums conocidos).
 */
import {
  TASK_DURATIONS,
  TASK_ENERGIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/lib/notion/constants';
import type {
  CalendarBlockProposePayload,
  GymSessionCreatePayload,
  GymSetInput,
  InboxCapturePayload,
  ProposalCreatePayload,
  ProposalDecidePayload,
  TaskChangeStatusPayload,
  TaskCreatePayload,
} from '@/types/actions';

const PRIVATE_PATTERN =
  /journal|diario\s+personal|diagn[oó]stico|historial\s+cl[ií]nico|sexualidad|<script|javascript:/i;

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isSafeHttps(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export type PayloadOk<T> = { ok: true; value: T };
export type PayloadFail = { ok: false; message: string };
export type PayloadResult<T> = PayloadOk<T> | PayloadFail;

export function validateTaskCreate(raw: unknown): PayloadResult<TaskCreatePayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Payload inválido.' };
  const data = raw as Record<string, unknown>;
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (title.length < 3 || title.length > 200) {
    return { ok: false, message: 'El título debe ser concreto (3–200 caracteres).' };
  }
  if (PRIVATE_PATTERN.test(title)) {
    return { ok: false, message: 'El título contiene contenido no permitido.' };
  }
  const priority = data.priority;
  if (typeof priority !== 'string' || !(TASK_PRIORITIES as readonly string[]).includes(priority)) {
    return { ok: false, message: 'Prioridad inválida.' };
  }
  const areaKey = typeof data.areaKey === 'string' ? data.areaKey.trim() : '';
  if (!areaKey) return { ok: false, message: 'Área requerida.' };
  const projectKey =
    data.projectKey === null || data.projectKey === undefined
      ? null
      : typeof data.projectKey === 'string'
        ? data.projectKey.trim() || null
        : null;
  const date =
    data.date === null || data.date === undefined
      ? null
      : typeof data.date === 'string' && isYmd(data.date)
        ? data.date
        : null;
  if (data.date != null && date === null) return { ok: false, message: 'Fecha inválida.' };

  const duration =
    data.duration === null || data.duration === undefined
      ? null
      : typeof data.duration === 'string' &&
          (TASK_DURATIONS as readonly string[]).includes(data.duration)
        ? (data.duration as TaskCreatePayload['duration'])
        : ('bad' as const);
  if (duration === 'bad') return { ok: false, message: 'Duración inválida.' };

  const energy =
    data.energy === null || data.energy === undefined
      ? null
      : typeof data.energy === 'string' &&
          (TASK_ENERGIES as readonly string[]).includes(data.energy)
        ? (data.energy as TaskCreatePayload['energy'])
        : ('bad' as const);
  if (energy === 'bad') return { ok: false, message: 'Energía inválida.' };

  const note =
    data.note === null || data.note === undefined
      ? null
      : typeof data.note === 'string'
        ? data.note.trim().slice(0, 500) || null
        : null;
  if (note && PRIVATE_PATTERN.test(note)) {
    return { ok: false, message: 'La nota contiene contenido no permitido.' };
  }

  return {
    ok: true,
    value: {
      title,
      priority: priority as TaskCreatePayload['priority'],
      areaKey,
      projectKey,
      date,
      duration,
      energy,
      note,
    },
  };
}

export function validateTaskChangeStatus(raw: unknown): PayloadResult<TaskChangeStatusPayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Payload inválido.' };
  const data = raw as Record<string, unknown>;
  const taskKey = typeof data.taskKey === 'string' ? data.taskKey.trim() : '';
  if (!taskKey) return { ok: false, message: 'Tarea requerida.' };
  const nextStatus = data.nextStatus;
  if (
    typeof nextStatus !== 'string' ||
    !(TASK_STATUSES as readonly string[]).includes(nextStatus)
  ) {
    return { ok: false, message: 'Estado inválido.' };
  }
  return {
    ok: true,
    value: { taskKey, nextStatus: nextStatus as TaskChangeStatusPayload['nextStatus'] },
  };
}

export function validateInboxCapture(raw: unknown): PayloadResult<InboxCapturePayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Payload inválido.' };
  const data = raw as Record<string, unknown>;
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (text.length < 1 || text.length > 2000) {
    return { ok: false, message: 'Texto de captura inválido.' };
  }
  if (PRIVATE_PATTERN.test(text)) {
    return { ok: false, message: 'La captura contiene contenido no permitido.' };
  }
  let link: string | null = null;
  if (data.link != null && data.link !== '') {
    if (typeof data.link !== 'string' || !isSafeHttps(data.link.trim())) {
      return { ok: false, message: 'Enlace inseguro o inválido (solo HTTPS).' };
    }
    link = data.link.trim();
  }
  const capturedAt =
    typeof data.capturedAt === 'string' && data.capturedAt.trim()
      ? data.capturedAt.trim()
      : new Date().toISOString();
  const origin =
    typeof data.origin === 'string' && data.origin.trim() ? data.origin.trim().slice(0, 80) : 'web';
  return { ok: true, value: { text, link, capturedAt, origin } };
}

function validateSet(raw: unknown, index: number): PayloadResult<GymSetInput> {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, message: `Set ${index + 1} inválido.` };
  }
  const data = raw as Record<string, unknown>;
  const exerciseKey = typeof data.exerciseKey === 'string' ? data.exerciseKey.trim() : '';
  const exerciseName = typeof data.exerciseName === 'string' ? data.exerciseName.trim() : '';
  if (!exerciseKey || !exerciseName) {
    return { ok: false, message: `Set ${index + 1}: ejercicio requerido.` };
  }
  const setIndex = typeof data.setIndex === 'number' ? data.setIndex : Number(data.setIndex);
  if (!Number.isInteger(setIndex) || setIndex < 1 || setIndex > 30) {
    return { ok: false, message: `Set ${index + 1}: índice inválido.` };
  }
  const numOrNull = (value: unknown, min: number, max: number, label: string) => {
    if (value === null || value === undefined || value === '')
      return { ok: true as const, value: null };
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      return { ok: false as const, message: `Set ${index + 1}: ${label} inválido.` };
    }
    return { ok: true as const, value: n };
  };
  const weight = numOrNull(data.weight, 0, 1000, 'peso');
  if (!weight.ok) return weight;
  const reps = numOrNull(data.reps, 0, 200, 'reps');
  if (!reps.ok) return reps;
  const rir = numOrNull(data.rir, 0, 10, 'RIR');
  if (!rir.ok) return rir;
  const rpe = numOrNull(data.rpe, 1, 10, 'RPE');
  if (!rpe.ok) return rpe;
  const completed = Boolean(data.completed);
  const notes = typeof data.notes === 'string' ? data.notes.trim().slice(0, 200) || null : null;
  if (notes && PRIVATE_PATTERN.test(notes)) {
    return { ok: false, message: 'Notas de set no permitidas.' };
  }
  return {
    ok: true,
    value: {
      exerciseKey,
      exerciseName,
      setIndex,
      weight: weight.value,
      reps: reps.value,
      rir: rir.value,
      rpe: rpe.value,
      completed,
      notes,
    },
  };
}

export function validateGymSessionCreate(raw: unknown): PayloadResult<GymSessionCreatePayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Payload inválido.' };
  const data = raw as Record<string, unknown>;
  const date = typeof data.date === 'string' ? data.date : '';
  if (!isYmd(date)) return { ok: false, message: 'Fecha de sesión inválida.' };
  const routineKey = typeof data.routineKey === 'string' ? data.routineKey.trim() : '';
  const workoutDayKey = typeof data.workoutDayKey === 'string' ? data.workoutDayKey.trim() : '';
  if (!routineKey || !workoutDayKey) {
    return { ok: false, message: 'Rutina y día requeridos.' };
  }
  if (!Array.isArray(data.sets) || data.sets.length === 0) {
    return { ok: false, message: 'Se requiere al menos un set.' };
  }
  if (data.sets.length > 80) return { ok: false, message: 'Demasiados sets.' };
  const sets: GymSetInput[] = [];
  for (let i = 0; i < data.sets.length; i += 1) {
    const parsed = validateSet(data.sets[i], i);
    if (!parsed.ok) return parsed;
    sets.push(parsed.value);
  }
  const durationMinutes =
    data.durationMinutes === null || data.durationMinutes === undefined
      ? null
      : Number(data.durationMinutes);
  if (durationMinutes !== null && (!Number.isFinite(durationMinutes) || durationMinutes < 0)) {
    return { ok: false, message: 'Duración inválida.' };
  }
  const energyBefore =
    data.energyBefore === null || data.energyBefore === undefined
      ? null
      : Number(data.energyBefore);
  if (
    energyBefore !== null &&
    (!Number.isFinite(energyBefore) || energyBefore < 1 || energyBefore > 5)
  ) {
    return { ok: false, message: 'Energía previa inválida (1–5).' };
  }
  const notes = typeof data.notes === 'string' ? data.notes.trim().slice(0, 500) || null : null;
  if (notes && PRIVATE_PATTERN.test(notes)) {
    return { ok: false, message: 'Notas no permitidas.' };
  }
  return {
    ok: true,
    value: {
      date,
      routineKey,
      workoutDayKey,
      startedAt: typeof data.startedAt === 'string' ? data.startedAt : null,
      finishedAt: typeof data.finishedAt === 'string' ? data.finishedAt : null,
      durationMinutes,
      energyBefore,
      notes,
      sets,
    },
  };
}

export function validateProposalCreate(raw: unknown): PayloadResult<ProposalCreatePayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Payload inválido.' };
  const data = raw as Record<string, unknown>;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (name.length < 1) return { ok: false, message: 'Nombre de propuesta inválido.' };
  const proposedActionType =
    typeof data.proposedActionType === 'string' ? data.proposedActionType : '';
  if (!proposedActionType || proposedActionType === 'calendar.event.create') {
    return { ok: false, message: 'Tipo de acción de propuesta inválido.' };
  }
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  const expectedChange = typeof data.expectedChange === 'string' ? data.expectedChange.trim() : '';
  if (!reason || !expectedChange) return { ok: false, message: 'Motivo y cambio esperados.' };
  const risk = data.risk;
  if (risk !== 'low' && risk !== 'medium' && risk !== 'high') {
    return { ok: false, message: 'Riesgo inválido.' };
  }
  const sanitizedPayload =
    data.sanitizedPayload && typeof data.sanitizedPayload === 'object'
      ? (data.sanitizedPayload as ProposalCreatePayload['sanitizedPayload'])
      : {};
  return {
    ok: true,
    value: {
      name,
      proposedActionType: proposedActionType as ProposalCreatePayload['proposedActionType'],
      targetType: (typeof data.targetType === 'string'
        ? data.targetType
        : 'system') as ProposalCreatePayload['targetType'],
      targetKey: typeof data.targetKey === 'string' ? data.targetKey : null,
      reason,
      expectedChange,
      risk,
      reversible: Boolean(data.reversible),
      sanitizedPayload,
    },
  };
}

export function validateProposalDecide(raw: unknown): PayloadResult<ProposalDecidePayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Payload inválido.' };
  const data = raw as Record<string, unknown>;
  const proposalKey = typeof data.proposalKey === 'string' ? data.proposalKey.trim() : '';
  if (!proposalKey) return { ok: false, message: 'Propuesta requerida.' };
  return { ok: true, value: { proposalKey } };
}

export function validateCalendarBlockPropose(
  raw: unknown,
): PayloadResult<CalendarBlockProposePayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Payload inválido.' };
  const data = raw as Record<string, unknown>;
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const date = typeof data.date === 'string' ? data.date : '';
  const startTime = typeof data.startTime === 'string' ? data.startTime.trim() : '';
  const endTime = typeof data.endTime === 'string' ? data.endTime.trim() : '';
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  if (
    !title ||
    !isYmd(date) ||
    !/^\d{2}:\d{2}$/.test(startTime) ||
    !/^\d{2}:\d{2}$/.test(endTime)
  ) {
    return { ok: false, message: 'Bloque de Calendar inválido.' };
  }
  if (!reason) return { ok: false, message: 'Motivo requerido.' };
  return {
    ok: true,
    value: {
      title,
      date,
      startTime,
      endTime,
      reason,
      relatedTaskKey: typeof data.relatedTaskKey === 'string' ? data.relatedTaskKey : null,
    },
  };
}

/** Transiciones de estado de tarea permitidas. */
export function isValidTaskStatusTransition(from: string, to: string): boolean {
  if (!(TASK_STATUSES as readonly string[]).includes(from)) return false;
  if (!(TASK_STATUSES as readonly string[]).includes(to)) return false;
  if (from === to) return true;
  // Hecha no vuelve a Bloqueada directamente.
  if (from === 'Hecha' && to === 'Bloqueada') return false;
  return true;
}
