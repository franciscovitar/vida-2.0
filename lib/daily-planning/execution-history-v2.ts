/**
 * Internal, read-only Planning Execution V2 history reducer.
 * This is not a browser DTO: keep opaque evidence refs and internal IDs server-side.
 * Observed effort does not establish mastery, project progress or a habit streak.
 */
const PREFIX = 'vida2:tasks-daily-planning:v2:execution:';
const CORRECTION_PREFIX = 'correction-of:';
const OBSERVATION_PATTERN = /^vida2:tasks-daily-planning:v2:execution:[0-9a-f]{64}$/;
const HEADERS = [
  'Observation ID', 'Fecha', 'Registrado en', 'Activity Type', 'Domain',
  'Entity Type', 'Canonical Ref', 'Actividad', 'Minutos declarados',
  'Inicio real', 'Execution State', 'Evidence State', 'Progress Effect',
  'Source Class', 'Confianza', 'Evidence Refs JSON', 'Version',
] as const;
const ACTIVITY = ['task','project','study','gym-movement','recovery-leisure','social','personal-admin','other'];
const DOMAIN = ['university','projects','professional','tasks','gym','health','nutrition','personal','other'];
const ENTITY = ['task','project','subject','assessment','workout','none'];
const EXECUTION = ['completed','partial','deferred','skipped','observed'];
const EVIDENCE = ['VERIFIED','SUPPORTED','DECLARED','PARTIAL','UNVERIFIED','CONFLICT','UNKNOWN'];
const PROGRESS = ['none','possible','verified','conflict','unknown'];
const SOURCE = ['user_report','journal_observation','domain_fact','derived_evidence','supporting_telemetry','mixed'];
const CONFIDENCE = ['Alta','Media','Baja'];

export interface ExecutionV2Observation {
  id: string;
  date: string;
  recordedAt: string;
  activityType: string;
  domain: string;
  entityType: string;
  canonicalRef: string | null;
  activity: string;
  declaredMinutes: number | null;
  realStart: string | null;
  executionState: string;
  evidenceState: string;
  progressEffect: string;
  sourceClass: string;
  confidence: string;
  evidenceRefs: readonly string[];
}
export interface ExecutionV2DayRead {
  status: 'ready' | 'degraded' | 'invalid' | 'empty' | 'unavailable';
  /** Latest non-superseded safe observations only. Internal server data. */
  current: readonly ExecutionV2Observation[];
  invalidRows: number;
  notice: string | null;
}

function civilDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(`${value}T`);
}
function safeText(value: unknown, max: number): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= max &&
    !/[\x00-\x1f]/.test(value) && !/^\s*[=+@-]/.test(value);
}
function safeRef(value: unknown): value is string {
  return safeText(value, 240) && !/(?:https?:\/\/|@|\s)/i.test(value);
}
function validRecordedAt(value: unknown): value is string {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}
function has(v: unknown, choices: readonly string[]): v is string {
  return typeof v === 'string' && choices.includes(v);
}
function parseRow(row: readonly unknown[]): ExecutionV2Observation | null {
  if (row.length !== HEADERS.length) return null;
  const [id,date,recordedAt,activityType,domain,entityType,canonicalRaw,activity,
    minutesRaw,startRaw,executionState,evidenceState,progressEffect,sourceClass,confidence,refsRaw,version] = row;
  if (typeof id !== 'string' || !OBSERVATION_PATTERN.test(id) ||
      !civilDay(date) || !validRecordedAt(recordedAt) || version !== 'planning-execution-v2' ||
      !has(activityType,ACTIVITY) || !has(domain,DOMAIN) || !has(entityType,ENTITY) ||
      (canonicalRaw !== '' && canonicalRaw !== null && !safeRef(canonicalRaw)) ||
      (entityType === 'none' && canonicalRaw !== '' && canonicalRaw !== null) ||
      !safeText(activity,200) ||
      !has(executionState,EXECUTION) || !has(evidenceState,EVIDENCE) ||
      !has(progressEffect,PROGRESS) || !has(sourceClass,SOURCE) || !has(confidence,CONFIDENCE) ||
      (progressEffect === 'verified' && evidenceState !== 'VERIFIED')) return null;
  // The shared readTabValues client turns empty Google Sheets cells into
  // null, not "". Accept both documented blank transport representations.
  const minutes = minutesRaw === '' || minutesRaw === null ? null : minutesRaw;
  if (minutes !== null && (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 0 || minutes > 1440)) return null;
  const realStart = startRaw === '' || startRaw === null ? null : startRaw;
  if (realStart !== null && (typeof realStart !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(realStart))) return null;
  if (typeof refsRaw !== 'string' || refsRaw.length > 2400) return null;
  let refs: unknown;
  try {refs = JSON.parse(refsRaw);} catch {return null;}
  if (!Array.isArray(refs) || refs.length > 8 || !refs.every(safeRef)) return null;
  // A reference to a past observation can be audit provenance. Only a typed
  // correction-of:<Observation ID> token means supersession. Reject malformed
  // typed links rather than interpreting them as harmless provenance.
  if (refs.some(ref => ref.startsWith(CORRECTION_PREFIX) &&
      !OBSERVATION_PATTERN.test(ref.slice(CORRECTION_PREFIX.length)))) return null;
  return { id,date,recordedAt,activityType,domain,entityType,
    canonicalRef:canonicalRaw === '' || canonicalRaw === null ? null : canonicalRaw as string,activity,
    declaredMinutes:minutes as number | null,realStart:realStart as string | null,
    executionState,evidenceState,progressEffect,sourceClass,confidence,evidenceRefs:refs };
}
function sameCorrectionSubject(before: ExecutionV2Observation, after: ExecutionV2Observation): boolean {
  if (before.date !== after.date || before.activityType !== after.activityType ||
      before.domain !== after.domain || before.entityType !== after.entityType) return false;
  // A grounded canonical entity cannot be changed to another via an execution
  // correction. When one side has no ref, require the same label instead.
  if (before.canonicalRef && after.canonicalRef) return before.canonicalRef === after.canonicalRef;
  return before.activity.trim().toLowerCase() === after.activity.trim().toLowerCase();
}
function semanticFingerprint(row: ExecutionV2Observation): string {
  return JSON.stringify({ ...row, recordedAt: null, evidenceRefs: [...row.evidenceRefs].sort() });
}

/**
 * Requires a bounded authoritative day read with the exact 17-column header.
 * Conflicting IDs or branching correction chains fail closed (no current data).
 * Other invalid rows degrade but never overwrite valid source observations.
 */
export function selectPlanningExecutionV2Day(
  values: readonly (readonly unknown[])[], targetDate: string,
): ExecutionV2DayRead {
  if (!civilDay(targetDate)) return {status:'invalid',current:[],invalidRows:0,notice:'Fecha inválida.'};
  if (!values.length || HEADERS.some((key,i) => values[0]?.[i] !== key)) {
    return {status:'unavailable',current:[],invalidRows:0,notice:'Falta el esquema Planning Execution V2.'};
  }
  const known = new Map<string,ExecutionV2Observation>();
  let invalidRows = 0;
  let matchingRows = 0;
  for (const row of values.slice(1)) {
    if (row[1] !== targetDate) continue;
    matchingRows++;
    const parsed = parseRow(row);
    if (!parsed) {invalidRows++;continue;}
    const previous = known.get(parsed.id);
    if (previous) {
      if (semanticFingerprint(previous) !== semanticFingerprint(parsed)) {
        return {status:'invalid',current:[],invalidRows:invalidRows+2,notice:'IDs de actividad contradictorios.'};
      }
      if (Date.parse(parsed.recordedAt) > Date.parse(previous.recordedAt)) known.set(parsed.id,parsed);
    } else known.set(parsed.id,parsed);
  }
  if (!matchingRows) return {status:'empty',current:[],invalidRows:0,notice:null};
  if (!known.size) return {status:'invalid',current:[],invalidRows,notice:'No hay observaciones V2 válidas.'};

  const successors = new Map<string,string>();
  for (const record of known.values()) {
    const parents = record.evidenceRefs.filter(ref => ref.startsWith(CORRECTION_PREFIX))
      .map(ref => ref.slice(CORRECTION_PREFIX.length));
    if (parents.length > 1) {
      return {status:'invalid',current:[],invalidRows:invalidRows+1,notice:'Cadena de corrección ambigua.'};
    }
    const parent = parents[0];
    if (!parent) continue;
    const prior = known.get(parent);
    if (!prior || parent === record.id || successors.has(parent) ||
        !sameCorrectionSubject(prior, record) ||
        Date.parse(record.recordedAt) < Date.parse(prior.recordedAt)) {
      return {status:'invalid',current:[],invalidRows:invalidRows+1,notice:'Cadena de corrección inválida.'};
    }
    successors.set(parent,record.id);
  }
  // A cycle with one successor per node has no terminal row. Detect explicitly.
  for (const id of successors.keys()) {
    const visited = new Set<string>();
    let current = id;
    while (successors.has(current)) {
      if (visited.has(current)) return {status:'invalid',current:[],invalidRows:invalidRows+1,notice:'Correcciones cíclicas.'};
      visited.add(current);
      current = successors.get(current)!;
    }
  }
  const current = [...known.values()].filter(row=>!successors.has(row.id))
    .sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt));
  return {status:invalidRows?'degraded':'ready',current,invalidRows,
    notice:invalidRows?'Se ignoraron observaciones V2 inválidas.':null};
}
