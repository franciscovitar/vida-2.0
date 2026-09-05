import type {
  DailyPlanSnapshot,
  DailyPlanSnapshotBlock,
  DailyPlanSnapshotItem,
  DailyPlanSnapshotPayload,
  DailyPlanSnapshotRead,
} from '@/types/daily-planning-view';

const HEADERS = ['Snapshot ID', 'Fecha', 'Generado en', 'Payload JSON', 'Fuente', 'Versión'];
const SOURCE = 'chatgpt_project';
const VERSION = 'daily-plan-v1';
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const SNAPSHOT_PREFIX = 'vida2:tasks-daily-planning:v1:plan:';
const MAX_ITEMS = 20;
const MAX_TEXT = 500;

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

function parseItem(value: unknown): DailyPlanSnapshotItem | null {
  if (!isObject(value)) return null;
  const allowed = ['kind', 'ref', 'activity', 'reason'] as const;
  if (!Object.keys(value).every((key) => allowed.includes(key as (typeof allowed)[number]))) {
    return null;
  }

  const kind = value.kind;
  if (kind !== 'task' && kind !== 'project' && kind !== 'calendar' && kind !== 'derived') {
    return null;
  }

  const reason = boundedString(value.reason);
  if (!reason) return null;

  if (kind === 'derived') {
    const activity = boundedString(value.activity, 200);
    if (!activity || value.ref !== undefined) return null;
    return { kind, ref: null, activity, reason };
  }

  const ref = boundedString(value.ref, 240);
  if (!ref || value.activity !== undefined) return null;
  return { kind, ref, activity: null, reason };
}

function parseItemArray(value: unknown): DailyPlanSnapshotItem[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const parsed: DailyPlanSnapshotItem[] = [];
  for (const entry of value) {
    const item = parseItem(entry);
    if (!item) return null;
    parsed.push(item);
  }
  return parsed;
}

function minutes(time: string): number {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

function parseBlock(value: unknown): DailyPlanSnapshotBlock | null {
  if (!isObject(value) || !hasOnlyKeys(value, ['start', 'end', 'item'])) return null;
  const start = boundedString(value.start, 5);
  const end = boundedString(value.end, 5);
  const item = parseItem(value.item);
  if (!start || !end || !TIME.test(start) || !TIME.test(end) || !item) return null;
  if (minutes(end) <= minutes(start)) return null;
  return { start, end, item };
}

function parseBlocks(value: unknown): DailyPlanSnapshotBlock[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const parsed: DailyPlanSnapshotBlock[] = [];
  for (const entry of value) {
    const block = parseBlock(entry);
    if (!block) return null;
    parsed.push(block);
  }
  return parsed;
}

export function parseDailyPlanPayload(value: unknown): DailyPlanSnapshotPayload | null {
  if (!isObject(value)) return null;
  const keys = ['must', 'should', 'could', 'notToday', 'suggestedBlocks', 'minimumViable'] as const;
  if (!hasOnlyKeys(value, keys)) return null;

  const must = parseItemArray(value.must);
  const should = parseItemArray(value.should);
  const could = parseItemArray(value.could);
  const notToday = parseItemArray(value.notToday);
  const suggestedBlocks = parseBlocks(value.suggestedBlocks);
  const minimumViable = parseItemArray(value.minimumViable);

  if (!must || !should || !could || !notToday || !suggestedBlocks || !minimumViable) {
    return null;
  }
  return { must, should, could, notToday, suggestedBlocks, minimumViable };
}

function validHeader(row: readonly unknown[]): boolean {
  return HEADERS.every((header, index) => row[index] === header);
}

function parseRow(row: readonly unknown[], targetDate: string): DailyPlanSnapshot | null {
  const [idRaw, dateRaw, generatedRaw, payloadRaw, sourceRaw, versionRaw] = row;
  const id = boundedString(idRaw, 320);
  const planDate = boundedString(dateRaw, 10);
  const generatedAt = boundedString(generatedRaw, 80);
  if (
    !id ||
    !id.startsWith(`${SNAPSHOT_PREFIX}${targetDate}:`) ||
    planDate !== targetDate ||
    !YMD.test(planDate) ||
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
  const payload = parseDailyPlanPayload(decoded);
  if (!payload) return null;
  return { id, planDate, generatedAt, payload };
}

/**
 * Selecciona la última fila válida para una fecha. Filas malformadas se ignoran
 * y se contabilizan; nunca se interpretan de forma laxa.
 */
export function selectLatestDailyPlanSnapshot(
  values: readonly (readonly unknown[])[],
  targetDate: string,
): DailyPlanSnapshotRead {
  if (!YMD.test(targetDate)) {
    return {
      status: 'invalid',
      snapshot: null,
      notice: 'Plan diario: fecha objetivo inválida.',
      invalidRows: 0,
    };
  }
  if (values.length === 0 || !validHeader(values[0] ?? [])) {
    return {
      status: 'unavailable',
      snapshot: null,
      notice: 'Plan diario: falta el esquema esperado.',
      invalidRows: 0,
    };
  }

  const candidates: DailyPlanSnapshot[] = [];
  let matchingRows = 0;
  let invalidRows = 0;
  for (const row of values.slice(1)) {
    if (row[1] !== targetDate) continue;
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
          ? 'Plan diario: las filas de hoy no cumplen el contrato.'
          : 'Todavía no hay un plan guardado para hoy.',
      invalidRows,
    };
  }

  candidates.sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
  return {
    status: invalidRows > 0 ? 'invalid' : 'ready',
    snapshot: candidates[0],
    notice: invalidRows > 0 ? 'Plan diario: se ignoraron filas inválidas.' : null,
    invalidRows,
  };
}
