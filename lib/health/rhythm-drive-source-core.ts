import type { RhythmStabilityInput } from './rhythm';
import {
  adaptHaeRhythmSources,
  toRhythmStabilityInput,
  type HaeRhythmRawFile,
  type NormalizedRhythmDay,
} from './rhythm-source-adapter';

export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

const DRIVE_FILES_BASE = 'https://www.googleapis.com/drive/v3/files';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const FOLDER_ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const MAX_JSON_BYTES = 512 * 1024;
const MAX_WINDOW_DAYS = 31;

export type RhythmDriveReadCode =
  | 'disabled'
  | 'production-disabled'
  | 'not-configured'
  | 'invalid-date'
  | 'invalid-request'
  | 'auth-error'
  | 'permission-error'
  | 'read-error'
  | 'ambiguous-file'
  | 'invalid-json'
  | 'too-large';

export type RhythmDriveFileState = 'ready' | 'missing' | 'error';

export interface RhythmDriveEnv {
  HEALTH_RHYTHM_SOURCE?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  GOOGLE_HEALTH_SLEEP_FOLDER_ID?: string;
  GOOGLE_HEALTH_RHYTHM_FOLDER_ID?: string;
  VERCEL_ENV?: string;
}

export interface RhythmDriveConfig {
  clientEmail: string;
  privateKey: string;
  sleepFolderId: string;
  rhythmFolderId: string;
}

export type RhythmDriveConfigResult =
  | { ok: true; config: RhythmDriveConfig }
  | { ok: false; code: 'disabled' | 'production-disabled' | 'not-configured' };

export type RhythmDriveTokenResult = { ok: true; token: string } | { ok: false; code: string };

export interface RhythmDriveDeps {
  fetchFn: typeof fetch;
  getToken: (
    clientEmail: string,
    privateKey: string,
    scope: string,
  ) => Promise<RhythmDriveTokenResult>;
}

export interface RhythmDriveDayRead {
  date: string;
  status: 'ready' | 'partial' | 'preserved' | 'missing' | 'unavailable' | 'invalid';
  normalized: NormalizedRhythmDay | null;
  code: RhythmDriveReadCode | null;
  files: {
    sleep: RhythmDriveFileState;
    rhythm: RhythmDriveFileState;
  };
}

export interface RhythmDriveWindowRead {
  status: 'ready' | 'partial' | 'unavailable';
  code: RhythmDriveReadCode | null;
  days: readonly NormalizedRhythmDay[];
  input: RhythmStabilityInput;
  reads: readonly RhythmDriveDayRead[];
}

interface DriveFileMetadata {
  id?: unknown;
  name?: unknown;
  modifiedTime?: unknown;
  size?: unknown;
}

type NamedFileRead =
  | { state: 'ready'; file: HaeRhythmRawFile }
  | { state: 'missing' }
  | { state: 'error'; code: RhythmDriveReadCode };

function normalizePrivateKey(key: string): string {
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

function validDay(value: string): boolean {
  if (!DAY_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function fileState(read: NamedFileRead): RhythmDriveFileState {
  return read.state === 'ready' ? 'ready' : read.state === 'missing' ? 'missing' : 'error';
}

function mapHttpStatus(status: number): RhythmDriveReadCode {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  return 'read-error';
}

function matchingPrevious(
  previous: NormalizedRhythmDay | null | undefined,
  date: string,
): NormalizedRhythmDay | null {
  return previous?.date === date ? previous : null;
}

export function resolveRhythmDriveConfig(env: RhythmDriveEnv): RhythmDriveConfigResult {
  if (env.HEALTH_RHYTHM_SOURCE?.trim() !== 'drive') {
    return { ok: false, code: 'disabled' };
  }
  if (env.VERCEL_ENV?.trim() === 'production') {
    return { ok: false, code: 'production-disabled' };
  }

  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawPrivateKey = env.GOOGLE_PRIVATE_KEY;
  const sleepFolderId = env.GOOGLE_HEALTH_SLEEP_FOLDER_ID?.trim();
  const rhythmFolderId = env.GOOGLE_HEALTH_RHYTHM_FOLDER_ID?.trim();

  if (
    !clientEmail ||
    !rawPrivateKey?.trim() ||
    !sleepFolderId ||
    !rhythmFolderId ||
    !FOLDER_ID_RE.test(sleepFolderId) ||
    !FOLDER_ID_RE.test(rhythmFolderId)
  ) {
    return { ok: false, code: 'not-configured' };
  }

  return {
    ok: true,
    config: {
      clientEmail,
      privateKey: normalizePrivateKey(rawPrivateKey),
      sleepFolderId,
      rhythmFolderId,
    },
  };
}

async function readNamedJsonFile(
  folderId: string,
  fileName: string,
  token: string,
  fetchFn: typeof fetch,
): Promise<NamedFileRead> {
  const query = `'${folderId}' in parents and name = '${fileName}' and trashed = false`;
  const searchParams = new URLSearchParams({
    q: query,
    fields: 'files(id,name,modifiedTime,size)',
    pageSize: '2',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });

  let listResponse: Response;
  try {
    listResponse = await fetchFn(`${DRIVE_FILES_BASE}?${searchParams.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    return { state: 'error', code: 'read-error' };
  }

  if (!listResponse.ok) {
    return { state: 'error', code: mapHttpStatus(listResponse.status) };
  }

  let files: DriveFileMetadata[];
  try {
    const parsed = (await listResponse.json()) as { files?: unknown };
    if (!Array.isArray(parsed.files)) return { state: 'error', code: 'read-error' };
    files = parsed.files as DriveFileMetadata[];
  } catch {
    return { state: 'error', code: 'read-error' };
  }

  if (files.length === 0) return { state: 'missing' };
  if (files.length !== 1) return { state: 'error', code: 'ambiguous-file' };

  const metadata = files[0];
  if (typeof metadata.id !== 'string' || metadata.name !== fileName) {
    return { state: 'error', code: 'read-error' };
  }

  const declaredSize =
    typeof metadata.size === 'string' && /^\d+$/.test(metadata.size)
      ? Number(metadata.size)
      : Number.NaN;
  if (Number.isFinite(declaredSize) && declaredSize > MAX_JSON_BYTES) {
    return { state: 'error', code: 'too-large' };
  }

  const mediaParams = new URLSearchParams({ alt: 'media', supportsAllDrives: 'true' });
  let mediaResponse: Response;
  try {
    mediaResponse = await fetchFn(
      `${DRIVE_FILES_BASE}/${encodeURIComponent(metadata.id)}?${mediaParams.toString()}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      },
    );
  } catch {
    return { state: 'error', code: 'read-error' };
  }

  if (!mediaResponse.ok) {
    return { state: 'error', code: mapHttpStatus(mediaResponse.status) };
  }

  const contentLength = Number(mediaResponse.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    return { state: 'error', code: 'too-large' };
  }

  let bodyText: string;
  try {
    bodyText = await mediaResponse.text();
  } catch {
    return { state: 'error', code: 'read-error' };
  }

  if (new TextEncoder().encode(bodyText).byteLength > MAX_JSON_BYTES) {
    return { state: 'error', code: 'too-large' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyText) as unknown;
  } catch {
    return { state: 'error', code: 'invalid-json' };
  }

  return {
    state: 'ready',
    file: {
      fileName,
      modifiedAt: typeof metadata.modifiedTime === 'string' ? metadata.modifiedTime : null,
      payload,
    },
  };
}

async function readDayWithToken(
  date: string,
  previous: NormalizedRhythmDay | null | undefined,
  config: RhythmDriveConfig,
  token: string,
  fetchFn: typeof fetch,
): Promise<RhythmDriveDayRead> {
  const [sleepRead, rhythmRead] = await Promise.all([
    readNamedJsonFile(config.sleepFolderId, `HealthSleep-${date}.json`, token, fetchFn),
    readNamedJsonFile(config.rhythmFolderId, `HealthRhythm-${date}.json`, token, fetchFn),
  ]);

  const files = { sleep: fileState(sleepRead), rhythm: fileState(rhythmRead) } as const;
  const hardError =
    sleepRead.state === 'error'
      ? sleepRead.code
      : rhythmRead.state === 'error'
        ? rhythmRead.code
        : null;

  if (hardError) {
    const preserved = matchingPrevious(previous, date);
    return {
      date,
      status: preserved ? 'preserved' : 'unavailable',
      normalized: preserved,
      code: hardError,
      files,
    };
  }

  if (sleepRead.state === 'missing' && rhythmRead.state === 'missing') {
    const preserved = matchingPrevious(previous, date);
    return {
      date,
      status: preserved ? 'preserved' : 'missing',
      normalized: preserved,
      code: null,
      files,
    };
  }

  const normalized = adaptHaeRhythmSources({
    sleepFile: sleepRead.state === 'ready' ? sleepRead.file : null,
    rhythmFile: rhythmRead.state === 'ready' ? rhythmRead.file : null,
    previous: matchingPrevious(previous, date),
  });

  return {
    date,
    status:
      sleepRead.state === 'ready' && rhythmRead.state === 'ready'
        ? 'ready'
        : normalized.date === null
          ? 'invalid'
          : 'partial',
    normalized,
    code: normalized.date === null ? 'read-error' : null,
    files,
  };
}

async function getConfiguredToken(
  env: RhythmDriveEnv,
  deps: RhythmDriveDeps,
): Promise<
  { ok: true; config: RhythmDriveConfig; token: string } | { ok: false; code: RhythmDriveReadCode }
> {
  const resolved = resolveRhythmDriveConfig(env);
  if (!resolved.ok) return resolved;

  const tokenResult = await deps.getToken(
    resolved.config.clientEmail,
    resolved.config.privateKey,
    DRIVE_READONLY_SCOPE,
  );
  if (!tokenResult.ok) {
    return {
      ok: false,
      code: tokenResult.code === 'permission-error' ? 'permission-error' : 'auth-error',
    };
  }
  return { ok: true, config: resolved.config, token: tokenResult.token };
}

export async function readRhythmDayFromDriveCore(
  input: {
    date: string;
    env: RhythmDriveEnv;
    previous?: NormalizedRhythmDay | null;
  },
  deps: RhythmDriveDeps,
): Promise<RhythmDriveDayRead> {
  if (!validDay(input.date)) {
    return {
      date: input.date,
      status: 'invalid',
      normalized: null,
      code: 'invalid-date',
      files: { sleep: 'missing', rhythm: 'missing' },
    };
  }

  const access = await getConfiguredToken(input.env, deps);
  if (!access.ok) {
    return {
      date: input.date,
      status: 'unavailable',
      normalized: null,
      code: access.code,
      files: { sleep: 'missing', rhythm: 'missing' },
    };
  }

  return readDayWithToken(input.date, input.previous, access.config, access.token, deps.fetchFn);
}

export async function readRhythmWindowFromDriveCore(
  input: {
    dates: readonly string[];
    env: RhythmDriveEnv;
    previous?: readonly NormalizedRhythmDay[];
  },
  deps: RhythmDriveDeps,
): Promise<RhythmDriveWindowRead> {
  const dates = [...new Set(input.dates)].sort();
  if (
    dates.length === 0 ||
    dates.length > MAX_WINDOW_DAYS ||
    dates.some((date) => !validDay(date))
  ) {
    return {
      status: 'unavailable',
      code: 'invalid-request',
      days: [],
      input: toRhythmStabilityInput([]),
      reads: [],
    };
  }

  const access = await getConfiguredToken(input.env, deps);
  if (!access.ok) {
    return {
      status: 'unavailable',
      code: access.code,
      days: [],
      input: toRhythmStabilityInput([]),
      reads: [],
    };
  }

  const previousByDate = new Map(
    (input.previous ?? [])
      .filter((day): day is NormalizedRhythmDay & { date: string } => day.date !== null)
      .map((day) => [day.date, day]),
  );
  const reads: RhythmDriveDayRead[] = [];
  for (const date of dates) {
    reads.push(
      await readDayWithToken(
        date,
        previousByDate.get(date),
        access.config,
        access.token,
        deps.fetchFn,
      ),
    );
  }

  const days = reads
    .map((read) => read.normalized)
    .filter((day): day is NormalizedRhythmDay => day !== null && day.date !== null);
  const hasUnavailable = reads.some(
    (read) => read.status === 'unavailable' || read.status === 'invalid',
  );
  const hasPartial = reads.some(
    (read) => read.status === 'partial' || read.status === 'preserved' || read.status === 'missing',
  );

  return {
    status: hasUnavailable ? 'unavailable' : hasPartial ? 'partial' : 'ready',
    code: reads.find((read) => read.code !== null)?.code ?? null,
    days,
    input: toRhythmStabilityInput(days),
    reads,
  };
}
