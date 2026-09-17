import type {
  AssessmentLifecycleStatus,
  AssessmentProgressConfidence,
  AssessmentProgressPayload,
  AssessmentProgressRead,
  AssessmentProgressSnapshot,
  AssessmentReadinessBand,
} from '@/types/assessment-progress';

const HEADERS = [
  'Snapshot ID',
  'Assessment ID',
  'Subject ID',
  'Fecha evaluación',
  'Generado en',
  'Payload JSON',
  'Fuente',
  'Versión',
] as const;
const SOURCE = 'chatgpt_subject_project';
const VERSION = 'assessment-progress-v1';
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 240;
const MAX_GAPS = 8;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function boundedString(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function nullableString(value: unknown, max = MAX_TEXT): string | null | undefined {
  if (value === null) return null;
  const text = boundedString(value, max);
  return text ?? undefined;
}

function confidence(value: unknown): AssessmentProgressConfidence | null {
  return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

function readinessBand(value: unknown): AssessmentReadinessBand | null {
  return value === 'not-ready' ||
    value === 'developing' ||
    value === 'close' ||
    value === 'exam-ready' ||
    value === 'unknown'
    ? value
    : null;
}

function lifecycle(value: unknown): AssessmentLifecycleStatus | null {
  return value === 'planned' || value === 'active' || value === 'complete' || value === 'cancelled'
    ? value
    : null;
}

function nullableInt(
  value: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return undefined;
  }
  return value;
}

function parseCriticalGaps(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_GAPS) return null;
  const out: string[] = [];
  for (const entry of value) {
    const text = boundedString(entry, 160);
    if (!text) return null;
    out.push(text);
  }
  return out;
}

export function parseAssessmentProgressPayload(value: unknown): AssessmentProgressPayload | null {
  if (!isObject(value)) return null;
  const keys = [
    'name',
    'type',
    'status',
    'progressPercent',
    'progressConfidence',
    'readinessBand',
    'remainingMinutesLow',
    'remainingMinutesHigh',
    'etaConfidence',
    'criticalGaps',
    'nextBestActivity',
    'scopeComplete',
    'evidenceCount',
  ] as const;
  if (!hasOnlyKeys(value, keys)) return null;

  const name = boundedString(value.name, 160);
  const type = boundedString(value.type, 80);
  const status = lifecycle(value.status);
  const progressPercent = nullableInt(value.progressPercent, 0, 100);
  const progressConfidence = confidence(value.progressConfidence);
  const band = readinessBand(value.readinessBand);
  const remainingMinutesLow = nullableInt(value.remainingMinutesLow, 0);
  const remainingMinutesHigh = nullableInt(value.remainingMinutesHigh, 0);
  const etaConfidence = confidence(value.etaConfidence);
  const criticalGaps = parseCriticalGaps(value.criticalGaps);
  const nextBestActivity = nullableString(value.nextBestActivity, 240);
  const scopeComplete = typeof value.scopeComplete === 'boolean' ? value.scopeComplete : null;
  const evidenceCount = nullableInt(value.evidenceCount, 0);

  if (
    !name ||
    !type ||
    !status ||
    progressPercent === undefined ||
    !progressConfidence ||
    !band ||
    remainingMinutesLow === undefined ||
    remainingMinutesHigh === undefined ||
    !etaConfidence ||
    !criticalGaps ||
    nextBestActivity === undefined ||
    scopeComplete === null ||
    evidenceCount === undefined ||
    evidenceCount === null
  ) {
    return null;
  }

  if (
    remainingMinutesLow !== null &&
    remainingMinutesHigh !== null &&
    remainingMinutesLow > remainingMinutesHigh
  ) {
    return null;
  }

  return {
    name,
    type,
    status,
    progressPercent,
    progressConfidence,
    readinessBand: band,
    remainingMinutesLow,
    remainingMinutesHigh,
    etaConfidence,
    criticalGaps,
    nextBestActivity,
    scopeComplete,
    evidenceCount,
  };
}

function validHeader(row: readonly unknown[]): boolean {
  return HEADERS.every((header, index) => row[index] === header);
}

function parseRow(row: readonly unknown[]): AssessmentProgressSnapshot | null {
  const [
    snapshotRaw,
    assessmentRaw,
    subjectRaw,
    dateRaw,
    generatedRaw,
    payloadRaw,
    sourceRaw,
    versionRaw,
  ] = row;
  const snapshotId = boundedString(snapshotRaw, 320);
  const assessmentId = boundedString(assessmentRaw, 160);
  const subjectId = boundedString(subjectRaw, 80);
  const generatedAt = boundedString(generatedRaw, 80);

  const assessmentDate =
    dateRaw === '' || dateRaw === null || dateRaw === undefined
      ? null
      : typeof dateRaw === 'string' && YMD.test(dateRaw)
        ? dateRaw
        : undefined;

  if (
    !snapshotId ||
    !snapshotId.startsWith('vida2:assessment-progress:v1:') ||
    !assessmentId ||
    !subjectId ||
    assessmentDate === undefined ||
    !generatedAt ||
    Number.isNaN(Date.parse(generatedAt)) ||
    sourceRaw !== SOURCE ||
    versionRaw !== VERSION ||
    typeof payloadRaw !== 'string'
  ) {
    return null;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(payloadRaw);
  } catch {
    return null;
  }
  const payload = parseAssessmentProgressPayload(decoded);
  if (!payload) return null;

  return {
    snapshotId,
    assessmentId,
    subjectId,
    assessmentDate,
    generatedAt,
    payload,
  };
}

/**
 * Selects the latest valid append-only snapshot per assessment.
 * Invalid rows never overwrite an earlier valid state.
 */
export function selectLatestAssessmentProgressSnapshots(
  values: readonly (readonly unknown[])[],
): AssessmentProgressRead {
  if (values.length === 0 || !validHeader(values[0] ?? [])) {
    return {
      status: 'unavailable',
      snapshots: [],
      notice: 'Progreso académico: falta el esquema esperado.',
      invalidRows: 0,
    };
  }

  const latest = new Map<string, AssessmentProgressSnapshot>();
  let nonEmptyRows = 0;
  let invalidRows = 0;

  for (const row of values.slice(1)) {
    if (row.every((cell) => cell === '' || cell === null || cell === undefined)) continue;
    nonEmptyRows += 1;
    const parsed = parseRow(row);
    if (!parsed) {
      invalidRows += 1;
      continue;
    }
    const current = latest.get(parsed.assessmentId);
    if (!current || Date.parse(parsed.generatedAt) > Date.parse(current.generatedAt)) {
      latest.set(parsed.assessmentId, parsed);
    }
  }

  const snapshots = [...latest.values()].sort((a, b) => {
    const ad = a.assessmentDate ?? '9999-12-31';
    const bd = b.assessmentDate ?? '9999-12-31';
    const byDate = ad.localeCompare(bd);
    return byDate !== 0 ? byDate : a.payload.name.localeCompare(b.payload.name);
  });

  if (nonEmptyRows === 0) {
    return { status: 'empty', snapshots: [], notice: null, invalidRows: 0 };
  }
  if (snapshots.length === 0) {
    return {
      status: 'invalid',
      snapshots: [],
      notice: 'Progreso académico: las filas existentes no cumplen el contrato.',
      invalidRows,
    };
  }
  return {
    status: invalidRows > 0 ? 'degraded' : 'ready',
    snapshots,
    notice: invalidRows > 0 ? 'Progreso académico: se ignoraron filas inválidas.' : null,
    invalidRows,
  };
}
