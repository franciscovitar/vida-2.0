/**
 * V2 Sheets READ-BACK RECONCILIATION — pure, no I/O, no writer.
 *
 * All results have retryAllowed:false. In particular, an authoritative
 * *absence* after an uncertain send cannot prove that a delayed Google
 * request did not commit. Never clear/rearm the Upstash dispatch ledger here.
 *
 * This function consumes a complete, authorized DEV tab read made elsewhere.
 * readComplete is a caller assertion, NOT verification of its own authority.
 */
export type PlanningV2ReconcileKind = 'execution' | 'orientation' | 'assessment';
export type PlanningV2ReconcileStatus =
  | 'confirmed'
  | 'not-observed-uncertain'
  | 'duplicate'
  | 'conflict'
  | 'unavailable'
  | 'schema-blocked'
  | 'candidate-invalid';

export interface PlanningV2ReconcileResult {
  status: PlanningV2ReconcileStatus;
  matchedRows: number;
  retryAllowed: false;
}

interface Shape {
  headers: readonly string[];
  id: RegExp;
  version: string;
  timestampIndex: number;
  versionIndex: number;
  jsonIndex: number;
  optionalBlankIndices: readonly number[];
}

const SHAPES: Record<PlanningV2ReconcileKind, Shape> = {
  execution: {
    headers: [
      'Observation ID', 'Fecha', 'Registrado en', 'Activity Type', 'Domain',
      'Entity Type', 'Canonical Ref', 'Actividad', 'Minutos declarados',
      'Inicio real', 'Execution State', 'Evidence State', 'Progress Effect',
      'Source Class', 'Confianza', 'Evidence Refs JSON', 'Version',
    ],
    id: /^vida2:tasks-daily-planning:v2:execution:[a-f0-9]{64}$/,
    version: 'planning-execution-v2',
    timestampIndex: 2,
    versionIndex: 16,
    jsonIndex: 15,
    optionalBlankIndices: [6, 8, 9],
  },
  orientation: {
    headers: ['Snapshot ID', 'Fecha', 'Generado en', 'Payload JSON', 'Fuente', 'Versión'],
    id: /^vida2:tasks-daily-planning:v2:orientation:\d{4}-\d{2}-\d{2}:[a-f0-9]{64}$/,
    version: 'daily-orientation-v2',
    timestampIndex: 2,
    versionIndex: 5,
    jsonIndex: 3,
    optionalBlankIndices: [],
  },
  assessment: {
    headers: [
      'Snapshot ID', 'Assessment ID', 'Subject ID', 'Fecha evaluación',
      'Generado en', 'Payload JSON', 'Fuente', 'Versión',
    ],
    id: /^vida2:assessment-progress:v1:[a-f0-9]{64}$/,
    version: 'assessment-progress-v1',
    timestampIndex: 4,
    versionIndex: 7,
    jsonIndex: 5,
    optionalBlankIndices: [3],
  },
};

function answer(status: PlanningV2ReconcileStatus, matchedRows = 0): PlanningV2ReconcileResult {
  // No row content, provenance text, workbook ID or provider errors may escape.
  return { status, matchedRows, retryAllowed: false };
}

function isStamped(value: unknown): boolean {
  return typeof value === 'string' &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function normalizeBlank(value: unknown, index: number, shape: Shape): unknown {
  return shape.optionalBlankIndices.includes(index) && (value === null || value === '')
    ? null : value;
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.keys(object).sort().map(key => [key, stableJson(object[key])]);
  }
  return value;
}

function validPayloadCell(value: unknown, shape: Shape): boolean {
  if (typeof value !== 'string' || value.length > (shape.jsonIndex === 3 ? 20 * 1024 : 12 * 1024)) {
    return false;
  }
  try {
    const decoded: unknown = JSON.parse(value);
    if (shape.jsonIndex === 15) {
      return Array.isArray(decoded) && decoded.length <= 8 &&
        decoded.every(item => typeof item === 'string' && item.length <= 240);
    }
    return decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded);
  } catch {
    return false;
  }
}

function sameContent(
  candidate: readonly unknown[], stored: readonly unknown[], shape: Shape,
): boolean {
  if (stored.length !== shape.headers.length || !isStamped(stored[shape.timestampIndex])) {
    return false;
  }
  for (let index = 0; index < candidate.length; index += 1) {
    if (index === shape.timestampIndex) continue; // generated/written time can differ on replay
    const a = normalizeBlank(candidate[index], index, shape);
    const b = normalizeBlank(stored[index], index, shape);
    if (index === shape.jsonIndex) {
      if (!validPayloadCell(b, shape)) return false;
      try {
        if (JSON.stringify(stableJson(JSON.parse(a as string))) !==
            JSON.stringify(stableJson(JSON.parse(b as string)))) return false;
      } catch { return false; }
    } else if (a !== b) {
      return false;
    }
  }
  return true;
}

export function reconcilePlanningV2Readback(input: {
  kind: PlanningV2ReconcileKind;
  candidateRow: readonly unknown[];
  rows: readonly (readonly unknown[])[] | null;
  readStatus: 'ready' | 'error';
  readComplete: boolean;
}): PlanningV2ReconcileResult {
  const shape = SHAPES[input.kind];
  if (!shape || !Array.isArray(input.candidateRow) ||
      input.candidateRow.length !== shape.headers.length ||
      typeof input.candidateRow[0] !== 'string' ||
      !shape.id.test(input.candidateRow[0]) ||
      input.candidateRow[shape.versionIndex] !== shape.version ||
      !isStamped(input.candidateRow[shape.timestampIndex]) ||
      !validPayloadCell(input.candidateRow[shape.jsonIndex], shape)) {
    return answer('candidate-invalid');
  }
  if (input.kind === 'orientation' &&
      !(input.candidateRow[0] as string).startsWith(
        'vida2:tasks-daily-planning:v2:orientation:' + String(input.candidateRow[1]) + ':'
      )) {
    return answer('candidate-invalid');
  }
  if (input.readStatus !== 'ready' || !input.readComplete || !input.rows ||
      input.rows.length === 0 || input.rows.length >= 5000) {
    return answer('unavailable');
  }
  const header = input.rows[0];
  if (!header || header.length !== shape.headers.length ||
      !shape.headers.every((value, i) => value === header[i])) {
    return answer('schema-blocked');
  }
  let matching = 0;
  let mismatch = false;
  for (const row of input.rows.slice(1)) {
    if (!Array.isArray(row)) return answer('schema-blocked');
    if (row.length === 0 || row.every(v => v === null || v === '')) continue;
    // A corrupt nonempty row makes this store untrustworthy; fail closed.
    if (row.length !== shape.headers.length || typeof row[0] !== 'string') {
      return answer('schema-blocked');
    }
    if (row[0] !== input.candidateRow[0]) continue;
    matching++;
    if (!sameContent(input.candidateRow, row, shape)) mismatch = true;
  }
  if (matching > 1) return answer('duplicate', matching);
  if (mismatch) return answer('conflict', matching);
  if (matching === 1) return answer('confirmed', 1);
  // Even a complete no-match cannot establish that an in-flight append is gone.
  return answer('not-observed-uncertain');
}
