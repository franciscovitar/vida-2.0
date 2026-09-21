import { getGoogleConfig } from '@/lib/data/config';
import type {
  SpreadsheetTargetEnv,
  SpreadsheetTargetOk,
} from '@/lib/google/spreadsheet-target-core';

export const INTELLIGENCE_FEEDBACK_TAB = 'Intelligence Feedback';
export const INTELLIGENCE_FEEDBACK_VERSION = 'intelligence-feedback-v1';
export const INTELLIGENCE_FEEDBACK_HEADERS = [
  'Article ID',
  'Feedback',
  'Updated At',
  'Feedback Version',
] as const;

export const INTELLIGENCE_FEEDBACK_VALUES = [
  'USEFUL',
  'ALREADY_KNEW',
  'TOO_BASIC',
  'TOO_DETAILED',
  'NOT_RELEVANT',
  'WANT_DEEPER',
] as const;

export type IntelligenceFeedbackValue = (typeof INTELLIGENCE_FEEDBACK_VALUES)[number];
export type IntelligenceFeedbackCell = string | number | boolean | null;

export interface IntelligenceFeedbackRecord {
  articleId: string;
  feedback: IntelligenceFeedbackValue;
  updatedAt: string;
  version: typeof INTELLIGENCE_FEEDBACK_VERSION;
}

export interface IntelligenceFeedbackInput {
  articleId: string;
  feedback: IntelligenceFeedbackValue;
  operationId: string;
}

export type IntelligenceFeedbackWriteCode =
  | 'invalid-value'
  | 'invalid-schema'
  | 'duplicate-article'
  | 'unauthorized-spreadsheet'
  | 'permission-error'
  | 'write-error'
  | 'verification-failed'
  | 'unauthorized-session';

export const INTELLIGENCE_FEEDBACK_WRITE_MESSAGES: Readonly<
  Record<IntelligenceFeedbackWriteCode, string>
> = {
  'invalid-value': 'Ese feedback no es válido.',
  'invalid-schema': 'Intelligence Feedback no coincide con el esquema esperado.',
  'duplicate-article': 'Hay más de una fila para este artículo. No se guardó ningún cambio.',
  'unauthorized-spreadsheet': 'El feedback no está habilitado para este destino.',
  'permission-error': 'La integración no tiene permiso para guardar el feedback.',
  'write-error': 'No se pudo guardar el feedback.',
  'verification-failed': 'El guardado no pudo verificarse. No se asumió éxito.',
  'unauthorized-session': 'Tenés que iniciar sesión para guardar feedback.',
};

export type IntelligenceFeedbackWriteFailure = {
  ok: false;
  code: IntelligenceFeedbackWriteCode;
  operationId: string;
  message: string;
};

export type IntelligenceFeedbackWriteSuccess = {
  ok: true;
  operationId: string;
  replay: boolean;
  corrected: boolean;
  rowNumber: number;
  record: IntelligenceFeedbackRecord;
};

export type IntelligenceFeedbackWriteResult =
  | IntelligenceFeedbackWriteFailure
  | IntelligenceFeedbackWriteSuccess;

export interface IntelligenceFeedbackSheetPort {
  readAll(): Promise<
    | { ok: true; values: IntelligenceFeedbackCell[][] }
    | { ok: false; code: 'permission-error' | 'auth-error' | 'read-error' | 'not-configured' }
  >;
  writeRow(
    rangeA1: string,
    values: readonly IntelligenceFeedbackCell[],
  ): Promise<
    | { ok: true }
    | { ok: false; code: 'permission-error' | 'auth-error' | 'write-error' | 'not-configured' }
  >;
}

type ParsedRow = { rowNumber: number; record: IntelligenceFeedbackRecord };

type GridInspection =
  | { ok: true; rows: ParsedRow[]; firstBlankRow: number }
  | { ok: false; code: 'invalid-schema' | 'duplicate-article' };

export type UpsertIntelligenceFeedbackOptions = {
  now?: Date;
  resolved?: SpreadsheetTargetOk;
  env?: SpreadsheetTargetEnv;
};

function fail(
  code: IntelligenceFeedbackWriteCode,
  operationId: string,
): IntelligenceFeedbackWriteFailure {
  return {
    ok: false,
    code,
    operationId,
    message: INTELLIGENCE_FEEDBACK_WRITE_MESSAGES[code],
  };
}

function isBlank(value: IntelligenceFeedbackCell | undefined): boolean {
  return (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  );
}

function text(value: IntelligenceFeedbackCell | undefined): string | null {
  if (isBlank(value)) return null;
  return String(value).trim();
}

function isArticleId(value: string): boolean {
  return /^INT-[A-Z]+-\d{4}-\d{2}-\d{2}-\d{2}$/.test(value);
}

export function isIntelligenceFeedbackValue(value: unknown): value is IntelligenceFeedbackValue {
  return (
    typeof value === 'string' &&
    (INTELLIGENCE_FEEDBACK_VALUES as readonly string[]).includes(value)
  );
}

function headersMatch(row: readonly IntelligenceFeedbackCell[] | undefined): boolean {
  if (!row || row.length < INTELLIGENCE_FEEDBACK_HEADERS.length) return false;
  return INTELLIGENCE_FEEDBACK_HEADERS.every((header, index) => text(row[index]) === header);
}

export function parseIntelligenceFeedbackRow(
  row: readonly IntelligenceFeedbackCell[],
): IntelligenceFeedbackRecord | null {
  const articleId = text(row[0]);
  const feedback = text(row[1]);
  const updatedAt = text(row[2]);
  const version = text(row[3]);

  if (
    !articleId ||
    !isArticleId(articleId) ||
    !feedback ||
    !isIntelligenceFeedbackValue(feedback) ||
    !updatedAt ||
    !Number.isFinite(Date.parse(updatedAt)) ||
    version !== INTELLIGENCE_FEEDBACK_VERSION
  ) {
    return null;
  }

  return {
    articleId,
    feedback,
    updatedAt,
    version: INTELLIGENCE_FEEDBACK_VERSION,
  };
}

function inspectGrid(
  values: readonly (readonly IntelligenceFeedbackCell[])[],
): GridInspection {
  if (!headersMatch(values[0])) return { ok: false, code: 'invalid-schema' };

  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  let firstBlankRow = values.length + 1;

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index] ?? [];
    const rowNumber = index + 1;

    if (row.every((cell) => isBlank(cell))) {
      if (firstBlankRow === values.length + 1) firstBlankRow = rowNumber;
      continue;
    }

    const record = parseIntelligenceFeedbackRow(row);
    if (!record) return { ok: false, code: 'invalid-schema' };
    if (seen.has(record.articleId)) return { ok: false, code: 'duplicate-article' };
    seen.add(record.articleId);
    rows.push({ rowNumber, record });
  }

  return { ok: true, rows, firstBlankRow: Math.max(2, firstBlankRow) };
}

function validateInput(input: IntelligenceFeedbackInput): boolean {
  return (
    typeof input.operationId === 'string' &&
    input.operationId.trim() !== '' &&
    typeof input.articleId === 'string' &&
    isArticleId(input.articleId) &&
    isIntelligenceFeedbackValue(input.feedback)
  );
}

export function intelligenceFeedbackToRow(
  record: IntelligenceFeedbackRecord,
): IntelligenceFeedbackCell[] {
  return [record.articleId, record.feedback, record.updatedAt, record.version];
}

function resolveWriteTarget(
  options: UpsertIntelligenceFeedbackOptions | undefined,
  operationId: string,
): SpreadsheetTargetOk | IntelligenceFeedbackWriteFailure {
  if (options?.resolved) return options.resolved;

  const config = getGoogleConfig(options?.env ?? process.env);
  if (!config.ok) return fail('unauthorized-spreadsheet', operationId);

  return {
    ok: true,
    target: config.config.target,
    spreadsheetId: config.config.spreadsheetId,
    allowProdWrites: config.config.allowProdWrites,
    writesAllowed: config.config.writesAllowed,
  };
}

function mapReadFailure(
  code: 'permission-error' | 'auth-error' | 'read-error' | 'not-configured',
  operationId: string,
): IntelligenceFeedbackWriteFailure {
  return fail(code === 'permission-error' ? 'permission-error' : 'write-error', operationId);
}

export async function upsertIntelligenceFeedbackWithPort(
  input: IntelligenceFeedbackInput,
  port: IntelligenceFeedbackSheetPort,
  options?: UpsertIntelligenceFeedbackOptions,
): Promise<IntelligenceFeedbackWriteResult> {
  const operationId = input.operationId;
  if (!validateInput(input)) return fail('invalid-value', operationId);

  const target = resolveWriteTarget(options, operationId);
  if (!('target' in target)) return target;
  if (!target.writesAllowed) return fail('unauthorized-spreadsheet', operationId);

  const before = await port.readAll();
  if (!before.ok) return mapReadFailure(before.code, operationId);

  const inspected = inspectGrid(before.values);
  if (!inspected.ok) return fail(inspected.code, operationId);

  const existing = inspected.rows.find((row) => row.record.articleId === input.articleId);
  if (existing?.record.feedback === input.feedback) {
    return {
      ok: true,
      operationId,
      replay: true,
      corrected: false,
      rowNumber: existing.rowNumber,
      record: existing.record,
    };
  }

  const candidate: IntelligenceFeedbackRecord = {
    articleId: input.articleId,
    feedback: input.feedback,
    updatedAt: (options?.now ?? new Date()).toISOString(),
    version: INTELLIGENCE_FEEDBACK_VERSION,
  };

  const rowNumber = existing?.rowNumber ?? inspected.firstBlankRow;
  const rangeA1 = `'${INTELLIGENCE_FEEDBACK_TAB}'!A${rowNumber}:D${rowNumber}`;
  const written = await port.writeRow(rangeA1, intelligenceFeedbackToRow(candidate));
  if (!written.ok) {
    return fail(
      written.code === 'permission-error' ? 'permission-error' : 'write-error',
      operationId,
    );
  }

  const after = await port.readAll();
  if (!after.ok) return fail('verification-failed', operationId);

  const verifiedGrid = inspectGrid(after.values);
  if (!verifiedGrid.ok) return fail('verification-failed', operationId);

  const verified = verifiedGrid.rows.filter((row) => row.record.articleId === input.articleId);
  if (
    verified.length !== 1 ||
    verified[0].rowNumber !== rowNumber ||
    verified[0].record.feedback !== candidate.feedback ||
    verified[0].record.updatedAt !== candidate.updatedAt
  ) {
    return fail('verification-failed', operationId);
  }

  return {
    ok: true,
    operationId,
    replay: false,
    corrected: Boolean(existing),
    rowNumber,
    record: verified[0].record,
  };
}

export function parseIntelligenceFeedbackSnapshot(
  values: readonly (readonly IntelligenceFeedbackCell[])[],
  articleId: string,
):
  | { ok: true; feedback: IntelligenceFeedbackRecord | null }
  | { ok: false; code: 'invalid-schema' | 'duplicate-article' } {
  const inspected = inspectGrid(values);
  if (!inspected.ok) return inspected;

  return {
    ok: true,
    feedback: inspected.rows.find((row) => row.record.articleId === articleId)?.record ?? null,
  };
}
