import { OPENCLAW_MAX_CALENDAR_DAYS, OPENCLAW_MAX_LIST_LIMIT } from '@/lib/openclaw/config';
import {
  encodeOpenClawCursor,
  isCanonicalAreaSlugInput,
  isOpenClawReadOperation,
} from '@/lib/openclaw/read-input';
import type { OpenClawReadOperation } from '@/types/openclaw';

export type ValidatedOpenClawRead = {
  operation: OpenClawReadOperation;
  input: Record<string, unknown>;
};

export type OpenClawReadValidation =
  | { ok: true; value: ValidatedOpenClawRead }
  | { ok: false; code: 'invalid-operation' | 'invalid-input'; message: string };

const TASK_STATUSES = new Set(['Pendiente', 'En progreso', 'Bloqueada', 'Hecha', 'Algún día']);
const PROJECT_STATUSES = new Set(['Activo', 'En espera', 'Bloqueado', 'Completado', 'Cancelado']);
const PROPOSAL_STATUSES = new Set([
  'pending',
  'approved',
  'rejected',
  'applied',
  'failed',
  'expired',
]);
const OPAQUE_AREA = /^area-[a-z0-9]{1,16}$/;
const OPAQUE_PROJECT = /^proj-[a-z0-9]{1,16}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CURSOR = /^[A-Za-z0-9_-]{1,32}$/;

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null ? (value as Record<string, unknown>) : null;
}

function only(input: Record<string, unknown>, allowed: readonly string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(input).every((key) => set.has(key));
}

function fail(message: string): OpenClawReadValidation {
  return { ok: false, code: 'invalid-input', message };
}

function validLimit(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= OPENCLAW_MAX_LIST_LIMIT
  );
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 0));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === (m ?? 1) - 1 && date.getUTCDate() === d
  );
}

function validCursor(value: unknown): value is string {
  if (typeof value !== 'string' || !CURSOR.test(value)) return false;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    if (!/^(0|[1-9][0-9]*)$/.test(decoded)) return false;
    const offset = Number(decoded);
    return Number.isSafeInteger(offset) && offset >= 0 && encodeOpenClawCursor(offset) === value;
  } catch {
    return false;
  }
}

function pagination(input: Record<string, unknown>): OpenClawReadValidation | null {
  if ('limit' in input && !validLimit(input.limit)) {
    return fail(`limit debe ser un entero entre 1 y ${OPENCLAW_MAX_LIST_LIMIT}.`);
  }
  if ('cursor' in input && !validCursor(input.cursor)) return fail('cursor inválido.');
  return null;
}

export function validateOpenClawReadEnvelope(value: unknown): OpenClawReadValidation {
  const envelope = record(value);
  if (!envelope || !only(envelope, ['operation', 'input'])) {
    return fail('Envelope de lectura inválido.');
  }
  if (typeof envelope.operation !== 'string' || !isOpenClawReadOperation(envelope.operation)) {
    return {
      ok: false,
      code: 'invalid-operation',
      message: 'Operación de lectura no registrada.',
    };
  }

  const input = envelope.input === undefined ? {} : record(envelope.input);
  if (!input) return fail('input debe ser un objeto JSON.');
  const operation = envelope.operation;

  if (
    operation === 'system.overview' ||
    operation === 'areas.list' ||
    operation === 'gym.summary'
  ) {
    return Object.keys(input).length === 0
      ? { ok: true, value: { operation, input: {} } }
      : fail('La operación no acepta input.');
  }

  if (operation === 'areas.get') {
    if (!only(input, ['slug', 'areaKey'])) return fail('Campos no permitidos.');
    const hasSlug = 'slug' in input;
    const hasKey = 'areaKey' in input;
    if (hasSlug === hasKey) return fail('Indicá exactamente slug o areaKey.');

    if (hasSlug) {
      if (typeof input.slug !== 'string' || !isCanonicalAreaSlugInput(input.slug)) {
        return fail('Área no canónica.');
      }
      return { ok: true, value: { operation, input: { slug: input.slug } } };
    }

    if (
      typeof input.areaKey !== 'string' ||
      !/^area\.(facultad|genova-trabajo|salud|vida-personal)$/.test(input.areaKey)
    ) {
      return fail('areaKey canónica inválida.');
    }
    return {
      ok: true,
      value: { operation, input: { slug: input.areaKey.slice(5) } },
    };
  }

  if (operation === 'tasks.list') {
    if (!only(input, ['status', 'areaKey', 'projectKey', 'dueBefore', 'limit', 'cursor']))
      return fail('Campos no permitidos.');
    const pageError = pagination(input);
    if (pageError) return pageError;
    if (
      'status' in input &&
      (typeof input.status !== 'string' || !TASK_STATUSES.has(input.status))
    ) {
      return fail('status de tarea inválido.');
    }
    if (
      'areaKey' in input &&
      (typeof input.areaKey !== 'string' || !OPAQUE_AREA.test(input.areaKey))
    ) {
      return fail('areaKey opaca inválida.');
    }
    if (
      'projectKey' in input &&
      (typeof input.projectKey !== 'string' || !OPAQUE_PROJECT.test(input.projectKey))
    )
      return fail('projectKey opaca inválida.');
    if ('dueBefore' in input && !validDate(input.dueBefore)) {
      return fail('dueBefore debe ser una fecha ISO válida.');
    }
    return { ok: true, value: { operation, input: { ...input } } };
  }

  if (operation === 'projects.list') {
    if (!only(input, ['status', 'areaKey', 'limit', 'cursor'])) {
      return fail('Campos no permitidos.');
    }
    const pageError = pagination(input);
    if (pageError) return pageError;
    if (
      'status' in input &&
      (typeof input.status !== 'string' || !PROJECT_STATUSES.has(input.status))
    )
      return fail('status de proyecto inválido.');
    if (
      'areaKey' in input &&
      (typeof input.areaKey !== 'string' || !OPAQUE_AREA.test(input.areaKey))
    ) {
      return fail('areaKey opaca inválida.');
    }
    return { ok: true, value: { operation, input: { ...input } } };
  }

  if (operation === 'calendar.upcoming') {
    if (!only(input, ['days'])) return fail('Campos no permitidos.');
    const days = input.days ?? 7;
    if (
      typeof days !== 'number' ||
      !Number.isSafeInteger(days) ||
      days < 1 ||
      days > OPENCLAW_MAX_CALENDAR_DAYS
    )
      return fail(`days debe ser un entero entre 1 y ${OPENCLAW_MAX_CALENDAR_DAYS}.`);
    return { ok: true, value: { operation, input: { days } } };
  }

  if (operation === 'approvals.list') {
    if (!only(input, ['status', 'limit'])) return fail('Campos no permitidos.');
    if ('limit' in input && !validLimit(input.limit)) return fail('limit inválido.');
    if (
      'status' in input &&
      (typeof input.status !== 'string' || !PROPOSAL_STATUSES.has(input.status))
    )
      return fail('status de propuesta inválido.');
    return { ok: true, value: { operation, input: { ...input } } };
  }

  if (operation === 'documents.search') {
    if (!only(input, ['query'])) return fail('Campos no permitidos.');
    if (
      typeof input.query !== 'string' ||
      input.query.trim().length < 1 ||
      input.query.trim().length > 120
    )
      return fail('query debe tener entre 1 y 120 caracteres.');
    return {
      ok: true,
      value: { operation, input: { query: input.query.trim() } },
    };
  }

  if (operation === 'document.get') {
    if (
      !only(input, ['slug']) ||
      typeof input.slug !== 'string' ||
      input.slug.length > 80 ||
      !SLUG.test(input.slug)
    )
      return fail('slug documental inválido.');
    return { ok: true, value: { operation, input: { slug: input.slug } } };
  }

  return {
    ok: false,
    code: 'invalid-operation',
    message: 'Operación de lectura no registrada.',
  };
}
