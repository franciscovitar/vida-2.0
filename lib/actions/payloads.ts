/**
 * Validación de payloads (sin any; enums conocidos; rechazo de campos desconocidos).
 */
import {
  TASK_DURATIONS,
  TASK_ENERGIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/lib/notion/constants';
import { isBusinessActionType } from '@/lib/actions/policy';
import type {
  CalendarHoldCreatePayload,
  GymSessionCreatePayload,
  GymSetInput,
  InboxCapturePayload,
  ProposalCreatePayload,
  ProposalDecidePayload,
  RollbackPayload,
  TaskChangeStatusPayload,
  TaskCreatePayload,
  WriteContractVersion,
} from '@/types/actions';
import { WRITE_CONTRACT_VERSION } from '@/types/actions';

const PRIVATE_PATTERN =
  /journal|diario\s+personal|diagn[oó]stico|historial\s+cl[ií]nico|sexualidad|<script|javascript:/i;

const INBOX_ORIGINS = new Set(['web', 'openclaw', 'manual', 'import']);

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function rejectUnknownKeys(
  data: Record<string, unknown>,
  allowlist: readonly string[],
): PayloadFail | null {
  const allowed = new Set(allowlist);
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) {
      return { ok: false, message: `Campo no permitido: ${key}.` };
    }
  }
  return null;
}

function isIsoDate(value: string): boolean {
  if (!value.trim()) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

export type PayloadOk<T> = { ok: true; value: T };
export type PayloadFail = { ok: false; message: string };
export type PayloadResult<T> = PayloadOk<T> | PayloadFail;

export function validateTaskCreate(raw: unknown): PayloadResult<TaskCreatePayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Payload inválido.' };
  const data = raw as Record<string, unknown>;
  const unknown = rejectUnknownKeys(data, [
    'title',
    'priority',
    'areaKey',
    'projectKey',
    'date',
    'duration',
    'energy',
    'note',
  ]);
  if (unknown) return unknown;

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
  if (
    data.projectKey !== undefined &&
    data.projectKey !== null &&
    typeof data.projectKey !== 'string'
  ) {
    return { ok: false, message: 'Proyecto inválido.' };
  }
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
  const unknown = rejectUnknownKeys(data, ['taskKey', 'nextStatus']);
  if (unknown) return unknown;
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
  const unknown = rejectUnknownKeys(data, ['text', 'link', 'capturedAt', 'origin']);
  if (unknown) return unknown;
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (text.length < 1 || text.length > 2000) {
    return { ok: false, message: 'Texto de captura inválido.' };
  }
  if (PRIVATE_PATTERN.test(text)) {
    return { ok: false, message: 'La captura contiene contenido no permitido.' };
  }
  let link: string | null = null;
  if (data.link != null && data.link !== '') {
    if (typeof data.link !== 'string' || !isSafeHttpUrl(data.link.trim())) {
      return { ok: false, message: 'Enlace inseguro o inválido (solo http/https).' };
    }
    link = data.link.trim();
  }
  const capturedAt =
    typeof data.capturedAt === 'string' && data.capturedAt.trim()
      ? data.capturedAt.trim()
      : new Date().toISOString();
  const originRaw =
    typeof data.origin === 'string' && data.origin.trim() ? data.origin.trim().slice(0, 80) : 'web';
  if (!INBOX_ORIGINS.has(originRaw)) {
    return { ok: false, message: 'Origen de captura no permitido.' };
  }
  return { ok: true, value: { text, link, capturedAt, origin: originRaw } };
}

function validateSet(raw: unknown, index: number): PayloadResult<GymSetInput> {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, message: `Set ${index + 1} inválido.` };
  }
  const data = raw as Record<string, unknown>;
  const unknown = rejectUnknownKeys(data, [
    'exerciseKey',
    'exerciseName',
    'setIndex',
    'weight',
    'reps',
    'rir',
    'rpe',
    'completed',
    'notes',
  ]);
  if (unknown) return unknown;
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
  const unknown = rejectUnknownKeys(data, [
    'date',
    'routineKey',
    'workoutDayKey',
    'startedAt',
    'finishedAt',
    'durationMinutes',
    'energyBefore',
    'notes',
    'sets',
  ]);
  if (unknown) return unknown;
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

const MIN_HOLD_MS = 15 * 60 * 1000;
const MAX_HOLD_MS = 4 * 60 * 60 * 1000;

export function validateCalendarHoldCreate(raw: unknown): PayloadResult<CalendarHoldCreatePayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Payload inválido.' };
  const data = raw as Record<string, unknown>;
  const unknown = rejectUnknownKeys(data, ['title', 'start', 'end', 'note', 'relatedTaskKey']);
  if (unknown) return unknown;
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!title || title.length > 200) return { ok: false, message: 'Título de hold inválido.' };
  if (PRIVATE_PATTERN.test(title)) {
    return { ok: false, message: 'El título contiene contenido no permitido.' };
  }
  const start = typeof data.start === 'string' ? data.start.trim() : '';
  const end = typeof data.end === 'string' ? data.end.trim() : '';
  if (!isIsoDate(start) || !isIsoDate(end)) {
    return { ok: false, message: 'Fechas ISO de hold inválidas.' };
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const duration = endMs - startMs;
  if (duration < MIN_HOLD_MS || duration > MAX_HOLD_MS) {
    return { ok: false, message: 'Duración de hold fuera de rango (15 min–4 h).' };
  }
  if (startMs < Date.now() - 60_000) {
    return { ok: false, message: 'El hold debe ser futuro.' };
  }
  const note =
    data.note === null || data.note === undefined
      ? null
      : typeof data.note === 'string'
        ? data.note.trim().slice(0, 500) || null
        : null;
  if (note && PRIVATE_PATTERN.test(note)) {
    return { ok: false, message: 'Nota no permitida.' };
  }
  const relatedTaskKey =
    data.relatedTaskKey === null || data.relatedTaskKey === undefined
      ? null
      : typeof data.relatedTaskKey === 'string'
        ? data.relatedTaskKey.trim() || null
        : null;
  return {
    ok: true,
    value: { title, start, end, note, relatedTaskKey },
  };
}

export function validateProposalCreate(raw: unknown): PayloadResult<ProposalCreatePayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Payload inválido.' };
  const data = raw as Record<string, unknown>;
  const unknown = rejectUnknownKeys(data, [
    'name',
    'proposedActionType',
    'targetType',
    'targetKey',
    'reason',
    'expectedChange',
    'risk',
    'reversible',
    'payload',
    'contractVersion',
  ]);
  if (unknown) return unknown;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (name.length < 1) return { ok: false, message: 'Nombre de propuesta inválido.' };
  const proposedActionType =
    typeof data.proposedActionType === 'string' ? data.proposedActionType : '';
  if (!isBusinessActionType(proposedActionType)) {
    return { ok: false, message: 'Tipo de acción de propuesta inválido.' };
  }
  if (data.contractVersion !== undefined) {
    const version = typeof data.contractVersion === 'string' ? data.contractVersion : '';
    if (version && version !== WRITE_CONTRACT_VERSION) {
      return { ok: false, message: 'contractVersion incompatible.' };
    }
  }
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  const expectedChange = typeof data.expectedChange === 'string' ? data.expectedChange.trim() : '';
  if (!reason || !expectedChange) return { ok: false, message: 'Motivo y cambio esperados.' };
  const risk = data.risk;
  if (risk !== 'low' && risk !== 'medium' && risk !== 'high') {
    return { ok: false, message: 'Riesgo inválido.' };
  }

  let businessPayload: ProposalCreatePayload['payload'];
  if (proposedActionType === 'task.create') {
    const parsed = validateTaskCreate(data.payload);
    if (!parsed.ok) return parsed;
    businessPayload = parsed.value;
  } else if (proposedActionType === 'task.change-status') {
    const parsed = validateTaskChangeStatus(data.payload);
    if (!parsed.ok) return parsed;
    businessPayload = parsed.value;
  } else if (proposedActionType === 'inbox.capture') {
    const parsed = validateInboxCapture(data.payload);
    if (!parsed.ok) return parsed;
    businessPayload = parsed.value;
  } else if (proposedActionType === 'gym.session.create') {
    const parsed = validateGymSessionCreate(data.payload);
    if (!parsed.ok) return parsed;
    businessPayload = parsed.value;
  } else {
    const parsed = validateCalendarHoldCreate(data.payload);
    if (!parsed.ok) return parsed;
    businessPayload = parsed.value;
  }

  return {
    ok: true,
    value: {
      name,
      proposedActionType,
      targetType: (typeof data.targetType === 'string'
        ? data.targetType
        : 'system') as ProposalCreatePayload['targetType'],
      targetKey: typeof data.targetKey === 'string' ? data.targetKey : null,
      reason,
      expectedChange,
      risk,
      reversible: Boolean(data.reversible),
      payload: businessPayload,
    },
  };
}

export function validateProposalDecide(raw: unknown): PayloadResult<ProposalDecidePayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Payload inválido.' };
  const data = raw as Record<string, unknown>;
  const unknown = rejectUnknownKeys(data, ['proposalKey']);
  if (unknown) return unknown;
  const proposalKey = typeof data.proposalKey === 'string' ? data.proposalKey.trim() : '';
  if (!proposalKey) return { ok: false, message: 'Propuesta requerida.' };
  return { ok: true, value: { proposalKey } };
}

export function validateActionRollback(raw: unknown): PayloadResult<RollbackPayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Payload inválido.' };
  const data = raw as Record<string, unknown>;
  const unknown = rejectUnknownKeys(data, ['proposalKey']);
  if (unknown) return unknown;
  const proposalKey = typeof data.proposalKey === 'string' ? data.proposalKey.trim() : '';
  if (!proposalKey) return { ok: false, message: 'Propuesta requerida.' };
  return { ok: true, value: { proposalKey } };
}

/** @deprecated Usar validateCalendarHoldCreate. */
export function validateCalendarBlockPropose(
  raw: unknown,
): PayloadResult<CalendarHoldCreatePayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'Payload inválido.' };
  const data = raw as Record<string, unknown>;
  // Compat: date+startTime+endTime → ISO hold
  if (typeof data.start === 'string' && typeof data.end === 'string') {
    return validateCalendarHoldCreate({
      title: data.title,
      start: data.start,
      end: data.end,
      note: data.note ?? data.reason ?? null,
      relatedTaskKey: data.relatedTaskKey ?? null,
    });
  }
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const date = typeof data.date === 'string' ? data.date : '';
  const startTime = typeof data.startTime === 'string' ? data.startTime.trim() : '';
  const endTime = typeof data.endTime === 'string' ? data.endTime.trim() : '';
  if (
    !title ||
    !isYmd(date) ||
    !/^\d{2}:\d{2}$/.test(startTime) ||
    !/^\d{2}:\d{2}$/.test(endTime)
  ) {
    return { ok: false, message: 'Bloque de Calendar inválido.' };
  }
  const start = `${date}T${startTime}:00.000Z`;
  const end = `${date}T${endTime}:00.000Z`;
  return validateCalendarHoldCreate({
    title,
    start,
    end,
    note: typeof data.reason === 'string' ? data.reason : null,
    relatedTaskKey: typeof data.relatedTaskKey === 'string' ? data.relatedTaskKey : null,
  });
}

/** Transiciones de estado de tarea permitidas. */
export function isValidTaskStatusTransition(from: string, to: string): boolean {
  if (!(TASK_STATUSES as readonly string[]).includes(from)) return false;
  if (!(TASK_STATUSES as readonly string[]).includes(to)) return false;
  if (from === to) return true;
  if (from === 'Hecha' && to === 'Bloqueada') return false;
  return true;
}

export type { WriteContractVersion };
