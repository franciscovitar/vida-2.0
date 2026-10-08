import type {
  DailyOrientationAttentionItem,
  DailyOrientationConfidence,
  DailyOrientationDateType,
  DailyOrientationDomain,
  DailyOrientationEvidenceState,
  DailyOrientationFocusItem,
  DailyOrientationLifeSignal,
  DailyOrientationLifeSignalKind,
  DailyOrientationLifeSignalLevel,
  DailyOrientationPayload,
  DailyOrientationProgressEffect,
  DailyOrientationReview,
  DailyOrientationReviewItem,
  DailyOrientationSnapshot,
  DailyOrientationSnapshotRead,
  DailyOrientationTargetKind,
  DailyOrientationUpcomingItem,
  DailyOrientationUpcomingKind,
} from '@/types/daily-orientation-v2';

const HEADERS = ['Snapshot ID', 'Fecha', 'Generado en', 'Payload JSON', 'Fuente', 'Versión'];
const SOURCE = 'chatgpt_project';
const VERSION = 'daily-orientation-v2';
const PREFIX = 'vida2:tasks-daily-planning:v2:orientation:';
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAYLOAD_BYTES = 20 * 1024;
const MAX_TEXT = 500;
const MAX_TITLE = 200;

const DOMAINS: readonly DailyOrientationDomain[] = [
  'university',
  'projects',
  'professional',
  'tasks',
  'gym',
  'health',
  'nutrition',
  'personal',
  'other',
];
const ATTENTION_DOMAINS: readonly Exclude<DailyOrientationDomain, 'nutrition'>[] = [
  'university',
  'projects',
  'professional',
  'tasks',
  'gym',
  'health',
  'personal',
  'other',
];
const EVIDENCE_STATES: readonly DailyOrientationEvidenceState[] = [
  'VERIFIED',
  'SUPPORTED',
  'DECLARED',
  'PARTIAL',
  'UNVERIFIED',
  'CONFLICT',
  'UNKNOWN',
];
const PROGRESS_EFFECTS: readonly DailyOrientationProgressEffect[] = [
  'none',
  'possible',
  'verified',
  'conflict',
  'unknown',
];
const CONFIDENCE: readonly DailyOrientationConfidence[] = ['Alta', 'Media', 'Baja'];
const TARGET_KINDS: readonly DailyOrientationTargetKind[] = [
  'subject',
  'assessment',
  'project',
  'task',
  'recovery',
  'none',
];
const UPCOMING_KINDS: readonly DailyOrientationUpcomingKind[] = [
  'calendar',
  'task',
  'assessment',
  'project',
];
const DATE_TYPES: readonly DailyOrientationDateType[] = [
  'deadline',
  'target',
  'review',
  'event',
  'assessment',
  'unknown',
];
const LIFE_KINDS: readonly DailyOrientationLifeSignalKind[] = [
  'sleep',
  'recovery',
  'movement',
  'leisure',
  'social',
  'capacity',
  'other',
];
const LIFE_LEVELS: readonly DailyOrientationLifeSignalLevel[] = [
  'normal',
  'notice',
  'candidate-pattern',
  'unknown',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function boundedString(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function nullableString(value: unknown, max = MAX_TEXT): string | null | undefined {
  if (value === null) return null;
  const parsed = boundedString(value, max);
  return parsed ?? undefined;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : null;
}

function nullableRef(value: unknown): string | null | undefined {
  if (value === null) return null;
  const parsed = boundedString(value, 240);
  return parsed ?? undefined;
}

function parseStringArray(value: unknown, maxItems: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const result: string[] = [];
  for (const item of value) {
    const parsed = boundedString(item);
    if (!parsed) return null;
    result.push(parsed);
  }
  return result;
}

function parseReviewItem(value: unknown): DailyOrientationReviewItem | null {
  if (
    !isObject(value) ||
    !exactKeys(value, ['domain', 'activity', 'evidenceState', 'progressEffect', 'summary'])
  ) {
    return null;
  }

  const domain = enumValue(value.domain, DOMAINS);
  const activity = boundedString(value.activity, MAX_TITLE);
  const evidenceState = enumValue(value.evidenceState, EVIDENCE_STATES);
  const progressEffect = enumValue(value.progressEffect, PROGRESS_EFFECTS);
  const summary = boundedString(value.summary);

  if (!domain || !activity || !evidenceState || !progressEffect || !summary) return null;
  return { domain, activity, evidenceState, progressEffect, summary };
}

function parseReview(value: unknown): DailyOrientationReview | null {
  if (!isObject(value) || !exactKeys(value, ['date', 'headline', 'items', 'uncertainties'])) {
    return null;
  }

  const date = boundedString(value.date, 10);
  const headline = boundedString(value.headline);
  const uncertainties = parseStringArray(value.uncertainties, 10);

  if (!date || !YMD.test(date) || !headline || !Array.isArray(value.items) || !uncertainties) {
    return null;
  }
  if (value.items.length > 12) return null;

  const items: DailyOrientationReviewItem[] = [];
  for (const item of value.items) {
    const parsed = parseReviewItem(item);
    if (!parsed) return null;
    items.push(parsed);
  }

  return { date, headline, items, uncertainties };
}

function parseAttention(value: unknown): DailyOrientationAttentionItem | null {
  if (
    !isObject(value) ||
    !exactKeys(value, [
      'domain',
      'targetKind',
      'ref',
      'title',
      'recommendation',
      'why',
      'confidence',
      'nextAction',
    ])
  ) {
    return null;
  }

  const domain = enumValue(value.domain, ATTENTION_DOMAINS);
  const targetKind = enumValue(value.targetKind, TARGET_KINDS);
  const ref = nullableRef(value.ref);
  const title = boundedString(value.title, MAX_TITLE);
  const recommendation = boundedString(value.recommendation);
  const why = boundedString(value.why);
  const confidence = enumValue(value.confidence, CONFIDENCE);
  const nextAction = nullableString(value.nextAction);

  if (
    !domain ||
    !targetKind ||
    ref === undefined ||
    !title ||
    !recommendation ||
    !why ||
    !confidence ||
    nextAction === undefined
  ) {
    return null;
  }

  return { domain, targetKind, ref, title, recommendation, why, confidence, nextAction };
}

function parseUpcoming(value: unknown): DailyOrientationUpcomingItem | null {
  if (
    !isObject(value) ||
    !exactKeys(value, ['kind', 'ref', 'title', 'date', 'dateType', 'reason'])
  ) {
    return null;
  }

  const kind = enumValue(value.kind, UPCOMING_KINDS);
  const ref = nullableRef(value.ref);
  const title = boundedString(value.title, MAX_TITLE);
  const date = boundedString(value.date, 10);
  const dateType = enumValue(value.dateType, DATE_TYPES);
  const reason = boundedString(value.reason);

  if (!kind || ref === undefined || !title || !date || !YMD.test(date) || !dateType || !reason) {
    return null;
  }

  return { kind, ref, title, date, dateType, reason };
}

function parseLifeSignal(value: unknown): DailyOrientationLifeSignal | null {
  if (!isObject(value) || !exactKeys(value, ['kind', 'level', 'summary', 'confidence'])) {
    return null;
  }

  const kind = enumValue(value.kind, LIFE_KINDS);
  const level = enumValue(value.level, LIFE_LEVELS);
  const summary = boundedString(value.summary);
  const confidence = enumValue(value.confidence, CONFIDENCE);

  if (!kind || !level || !summary || !confidence) return null;
  return { kind, level, summary, confidence };
}

function parseFocus(value: unknown): DailyOrientationFocusItem | null {
  if (!isObject(value) || !exactKeys(value, ['domain', 'title', 'why', 'ref'])) return null;

  const domain = enumValue(value.domain, DOMAINS);
  const title = boundedString(value.title, MAX_TITLE);
  const why = boundedString(value.why);
  const ref = nullableRef(value.ref);

  if (!domain || !title || !why || ref === undefined) return null;
  return { domain, title, why, ref };
}

function parseArray<T>(
  value: unknown,
  maxItems: number,
  parser: (entry: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const result: T[] = [];

  for (const entry of value) {
    const parsed = parser(entry);
    if (!parsed) return null;
    result.push(parsed);
  }

  return result;
}

export function parseDailyOrientationPayload(value: unknown): DailyOrientationPayload | null {
  if (
    !isObject(value) ||
    !exactKeys(value, ['review', 'attention', 'upcoming', 'lifeSignals', 'minimum', 'notNow'])
  ) {
    return null;
  }

  const review = parseReview(value.review);
  const attention = parseArray(value.attention, 3, parseAttention);
  const upcoming = parseArray(value.upcoming, 5, parseUpcoming);
  const lifeSignals = parseArray(value.lifeSignals, 8, parseLifeSignal);
  const minimum = parseArray(value.minimum, 3, parseFocus);
  const notNow = parseArray(value.notNow, 5, parseFocus);

  if (!review || !attention || !upcoming || !lifeSignals || !minimum || !notNow) return null;
  return { review, attention, upcoming, lifeSignals, minimum, notNow };
}

function validHeader(row: readonly unknown[]): boolean {
  return HEADERS.every((header, index) => row[index] === header);
}

function parseRow(row: readonly unknown[], targetDate: string): DailyOrientationSnapshot | null {
  const [idRaw, dateRaw, generatedRaw, payloadRaw, sourceRaw, versionRaw] = row;
  const id = boundedString(idRaw, 360);
  const planDate = boundedString(dateRaw, 10);
  const generatedAt = boundedString(generatedRaw, 80);

  if (
    !id ||
    !id.startsWith(`${PREFIX}${targetDate}:`) ||
    planDate !== targetDate ||
    !YMD.test(planDate) ||
    !generatedAt ||
    Number.isNaN(Date.parse(generatedAt)) ||
    sourceRaw !== SOURCE ||
    versionRaw !== VERSION ||
    typeof payloadRaw !== 'string' ||
    new TextEncoder().encode(payloadRaw).length > MAX_PAYLOAD_BYTES
  ) {
    return null;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(payloadRaw);
  } catch {
    return null;
  }

  const payload = parseDailyOrientationPayload(decoded);
  return payload ? { id, planDate, generatedAt, payload } : null;
}

export function selectLatestDailyOrientationSnapshot(
  values: readonly (readonly unknown[])[],
  targetDate: string,
): DailyOrientationSnapshotRead {
  if (!YMD.test(targetDate)) {
    return {
      status: 'invalid',
      snapshot: null,
      notice: 'Orientación diaria: fecha objetivo inválida.',
      invalidRows: 0,
    };
  }

  if (values.length === 0 || !validHeader(values[0] ?? [])) {
    return {
      status: 'unavailable',
      snapshot: null,
      notice: 'Orientación diaria: falta el esquema esperado.',
      invalidRows: 0,
    };
  }

  const candidates: DailyOrientationSnapshot[] = [];
  let matchingRows = 0;
  let invalidRows = 0;

  for (const row of values.slice(1)) {
    if (row[1] !== targetDate || row[5] !== VERSION) continue;
    matchingRows += 1;
    const snapshot = parseRow(row, targetDate);
    if (snapshot) candidates.push(snapshot);
    else invalidRows += 1;
  }

  if (candidates.length === 0) {
    return {
      status: matchingRows > 0 ? 'invalid' : 'empty',
      snapshot: null,
      notice:
        matchingRows > 0
          ? 'Orientación diaria: se encontraron filas V2 inválidas.'
          : 'Todavía no hay una orientación V2 guardada para hoy.',
      invalidRows,
    };
  }

  candidates.sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));

  return {
    status: invalidRows > 0 ? 'invalid' : 'ready',
    snapshot: candidates[0],
    notice: invalidRows > 0 ? 'Orientación diaria: se ignoraron filas V2 inválidas.' : null,
    invalidRows,
  };
}
