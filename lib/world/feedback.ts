import type { WorldDomain, WorldPublishedPiece } from '@/types/world-intelligence';

export const WORLD_FEEDBACK_VERSION = 'world-feedback-v1';

export const WORLD_FEEDBACK_VALUES = [
  'USEFUL',
  'ALREADY_KNEW',
  'TOO_BASIC',
  'TOO_DETAILED',
  'NOT_RELEVANT',
  'WANT_DEEPER',
] as const;

export type WorldFeedbackValue = (typeof WORLD_FEEDBACK_VALUES)[number];

export interface WorldFeedbackRecord {
  briefId: string;
  feedback: WorldFeedbackValue;
  updatedAt: string;
  feedbackVersion: typeof WORLD_FEEDBACK_VERSION;
  conceptId: string | null;
  clusterId: string | null;
  primaryDomain: WorldDomain;
}

export interface WorldFeedbackInput {
  briefId: string;
  feedback: WorldFeedbackValue;
  operationId: string;
}

export type WorldFeedbackStoreFailureCode =
  | 'not-configured'
  | 'read-error'
  | 'write-error'
  | 'permission-error';

export interface WorldFeedbackStorePort {
  readCurrent(
    briefId: string,
  ): Promise<
    | { ok: true; record: WorldFeedbackRecord | null }
    | { ok: false; code: WorldFeedbackStoreFailureCode }
  >;
  upsert(
    record: WorldFeedbackRecord,
  ): Promise<{ ok: true } | { ok: false; code: WorldFeedbackStoreFailureCode }>;
}

export type WorldFeedbackWriteCode =
  | 'invalid-value'
  | 'unknown-brief'
  | 'metadata-mismatch'
  | 'not-configured'
  | 'permission-error'
  | 'write-error'
  | 'verification-failed'
  | 'unauthorized-session';

export const WORLD_FEEDBACK_WRITE_MESSAGES: Readonly<Record<WorldFeedbackWriteCode, string>> = {
  'invalid-value': 'Ese feedback no es válido.',
  'unknown-brief': 'La pieza no pertenece a la superficie publicada actual.',
  'metadata-mismatch': 'La metadata de feedback no coincide con la pieza publicada.',
  'not-configured': 'El feedback todavía no está conectado al store operacional de World.',
  'permission-error': 'La integración no tiene permiso para guardar feedback.',
  'write-error': 'No se pudo guardar el feedback.',
  'verification-failed': 'El guardado no pudo verificarse. No se asumió éxito.',
  'unauthorized-session': 'Tenés que iniciar sesión para guardar feedback.',
};

export type WorldFeedbackWriteResult =
  | {
      ok: true;
      operationId: string;
      replay: boolean;
      corrected: boolean;
      record: WorldFeedbackRecord;
    }
  | {
      ok: false;
      operationId: string;
      code: WorldFeedbackWriteCode;
      message: string;
    };

export interface WorldFeedbackSnapshot {
  writable: boolean;
  state: 'ready' | 'empty' | 'unavailable' | 'error';
  notice: string | null;
  feedback: WorldFeedbackRecord | null;
}

function fail(code: WorldFeedbackWriteCode, operationId: string): WorldFeedbackWriteResult {
  return {
    ok: false,
    operationId,
    code,
    message: WORLD_FEEDBACK_WRITE_MESSAGES[code],
  };
}

export function isWorldFeedbackValue(value: unknown): value is WorldFeedbackValue {
  return typeof value === 'string' && (WORLD_FEEDBACK_VALUES as readonly string[]).includes(value);
}

function validBriefId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9][A-Z0-9-]{2,120}$/.test(value);
}

function sameCanonicalMetadata(a: WorldFeedbackRecord, b: WorldFeedbackRecord): boolean {
  return (
    a.briefId === b.briefId &&
    a.feedbackVersion === b.feedbackVersion &&
    a.conceptId === b.conceptId &&
    a.clusterId === b.clusterId &&
    a.primaryDomain === b.primaryDomain
  );
}

export function worldFeedbackMetadataFromPiece(piece: WorldPublishedPiece): Omit<
  WorldFeedbackRecord,
  'feedback' | 'updatedAt'
> {
  return {
    briefId: piece.briefId,
    feedbackVersion: WORLD_FEEDBACK_VERSION,
    conceptId: piece.conceptId ?? null,
    clusterId: null,
    primaryDomain: piece.primaryDomain,
  };
}

export async function upsertWorldFeedbackWithPort(
  input: WorldFeedbackInput,
  piece: WorldPublishedPiece,
  port: WorldFeedbackStorePort,
  options?: { now?: Date },
): Promise<WorldFeedbackWriteResult> {
  const operationId = input.operationId;
  if (
    typeof operationId !== 'string' ||
    operationId.trim() === '' ||
    !validBriefId(input.briefId) ||
    !isWorldFeedbackValue(input.feedback)
  ) {
    return fail('invalid-value', operationId);
  }

  if (input.briefId !== piece.briefId) return fail('unknown-brief', operationId);

  const metadata = worldFeedbackMetadataFromPiece(piece);
  const before = await port.readCurrent(piece.briefId);
  if (!before.ok) {
    return fail(
      before.code === 'permission-error'
        ? 'permission-error'
        : before.code === 'not-configured'
          ? 'not-configured'
          : 'write-error',
      operationId,
    );
  }

  if (before.record && !sameCanonicalMetadata(before.record, { ...before.record, ...metadata })) {
    return fail('metadata-mismatch', operationId);
  }

  if (before.record?.feedback === input.feedback) {
    return {
      ok: true,
      operationId,
      replay: true,
      corrected: false,
      record: before.record,
    };
  }

  const candidate: WorldFeedbackRecord = {
    ...metadata,
    feedback: input.feedback,
    updatedAt: (options?.now ?? new Date()).toISOString(),
  };

  const written = await port.upsert(candidate);
  if (!written.ok) {
    return fail(
      written.code === 'permission-error'
        ? 'permission-error'
        : written.code === 'not-configured'
          ? 'not-configured'
          : 'write-error',
      operationId,
    );
  }

  const after = await port.readCurrent(piece.briefId);
  if (
    !after.ok ||
    !after.record ||
    !sameCanonicalMetadata(after.record, candidate) ||
    after.record.feedback !== candidate.feedback ||
    after.record.updatedAt !== candidate.updatedAt
  ) {
    return fail('verification-failed', operationId);
  }

  return {
    ok: true,
    operationId,
    replay: false,
    corrected: before.record !== null,
    record: after.record,
  };
}

export async function loadWorldFeedbackWithPort(
  piece: WorldPublishedPiece,
  port: WorldFeedbackStorePort,
): Promise<WorldFeedbackSnapshot> {
  const read = await port.readCurrent(piece.briefId);
  if (!read.ok) {
    return {
      writable: false,
      state: read.code === 'not-configured' ? 'unavailable' : 'error',
      notice:
        read.code === 'not-configured'
          ? 'Feedback temporalmente no disponible.'
          : 'No se pudo leer el feedback. El artículo sigue disponible.',
      feedback: null,
    };
  }

  if (read.record) {
    const metadata = worldFeedbackMetadataFromPiece(piece);
    if (!sameCanonicalMetadata(read.record, { ...read.record, ...metadata })) {
      return {
        writable: false,
        state: 'error',
        notice: 'El feedback guardado no coincide con la pieza publicada.',
        feedback: null,
      };
    }
  }

  return {
    writable: true,
    state: read.record ? 'ready' : 'empty',
    notice: null,
    feedback: read.record,
  };
}
