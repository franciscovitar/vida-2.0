/**
 * Lectura real y estrictamente read-only de Gym Sessions / Gym Sets.
 * Usa el scope readonly existente y nunca escribe, limpia ni agrega filas.
 */
import { readTabValues } from '@/lib/google/sheets-read';
import { GYM_SESSIONS_HEADERS, GYM_SETS_HEADERS } from '@/lib/gym/sheet-schema';
import type { ReadTabResult, SheetReadCode } from '@/lib/google/errors';
import type {
  GymExerciseProgress,
  GymExerciseResult,
  GymSession,
  GymSessionSummary,
  GymSet,
} from '@/types/gym';

export type GymSessionsSnapshot = {
  state: 'ready' | 'empty' | 'unavailable' | 'error';
  notice: string | null;
  sessions: readonly GymSession[];
  summaries: readonly GymSessionSummary[];
  exerciseProgress: readonly GymExerciseProgress[];
};

type Cell = string | number | boolean | null;
type Row = readonly Cell[];

function opaqueKey(prefix: string, seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `${prefix}-${hash.toString(36)}`;
}

function textCell(value: Cell | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function numberCell(value: Cell | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim().replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerCell(value: Cell | undefined): number | null {
  const parsed = numberCell(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function booleanCell(value: Cell | undefined): boolean | null {
  if (typeof value === 'boolean') return value;
  const normalized = textCell(value)?.toLowerCase();
  if (!normalized) return null;
  if (['true', '1', 'yes', 'sí', 'si', 'done', 'complete'].includes(normalized)) return true;
  if (['false', '0', 'no', 'pending', 'partial'].includes(normalized)) return false;
  return null;
}

function validDate(value: Cell | undefined): string | null {
  const text = textCell(value);
  if (!text) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match?.[1] ?? null;
}

function headersMatch(row: Row | undefined, expected: readonly string[]): boolean {
  if (!row || row.length < expected.length) return false;
  return expected.every((name, index) => textCell(row[index]) === name);
}

function readCodeNotice(code: SheetReadCode): string {
  if (code === 'not-configured') return 'Google Sheets no está configurado.';
  if (code === 'permission-error') return 'La integración no puede leer las pestañas de gimnasio.';
  if (code === 'missing-tab') return 'Falta una pestaña contractual de gimnasio.';
  if (code === 'auth-error') return 'No se pudo autenticar la lectura de Google Sheets.';
  return 'No se pudo leer el historial de gimnasio.';
}

function failureSnapshot(code: SheetReadCode): GymSessionsSnapshot {
  return {
    state:
      code === 'not-configured' || code === 'permission-error' || code === 'missing-tab'
        ? 'unavailable'
        : 'error',
    notice: readCodeNotice(code),
    sessions: [],
    summaries: [],
    exerciseProgress: [],
  };
}

function mapSet(
  row: Row,
  sessionId: string,
  index: number,
): GymSet & { exerciseKey: string; exerciseName: string } {
  const exerciseKey = textCell(row[1]) ?? opaqueKey('exercise-source', `${sessionId}-${index}`);
  const exerciseName = textCell(row[2]) ?? 'Ejercicio sin nombre';
  const setIndex = integerCell(row[3]) ?? index + 1;
  return {
    key: opaqueKey('set', `${sessionId}-${exerciseKey}-${setIndex}`),
    exerciseKey,
    exerciseName,
    setNumber: setIndex,
    load: textCell(row[4]),
    reps: integerCell(row[5]),
    rir: numberCell(row[6]),
    rpe: numberCell(row[7]),
    note: textCell(row[9]),
  };
}

function buildExerciseResults(sessionId: string, rows: readonly Row[]): GymExerciseResult[] {
  const byExercise = new Map<string, { name: string; sets: GymSet[]; firstIndex: number }>();
  rows.forEach((row, index) => {
    const completed = booleanCell(row[8]);
    if (completed === false) return;
    const mapped = mapSet(row, sessionId, index);
    const existing = byExercise.get(mapped.exerciseKey);
    if (existing) existing.sets.push(mapped);
    else {
      byExercise.set(mapped.exerciseKey, {
        name: mapped.exerciseName,
        sets: [mapped],
        firstIndex: index,
      });
    }
  });

  return [...byExercise.entries()]
    .sort((a, b) => a[1].firstIndex - b[1].firstIndex)
    .map(([sourceKey, exercise], index) => ({
      key: opaqueKey('exercise', `${sessionId}-${sourceKey}`),
      exerciseName: exercise.name,
      order: index + 1,
      sets: exercise.sets.slice().sort((a, b) => a.setNumber - b.setNumber),
      note: exercise.sets.map((set) => set.note).find(Boolean) ?? null,
    }));
}

type SessionWithStatus = { session: GymSession; status: string | null };

function mapSessions(sessionRows: readonly Row[], setRows: readonly Row[]): SessionWithStatus[] {
  const setsBySession = new Map<string, Row[]>();
  for (const row of setRows) {
    const sessionId = textCell(row[0]);
    if (!sessionId) continue;
    const current = setsBySession.get(sessionId) ?? [];
    current.push(row);
    setsBySession.set(sessionId, current);
  }

  const sessions: SessionWithStatus[] = [];
  for (const row of sessionRows) {
    const sourceId = textCell(row[0]);
    const date = validDate(row[1]);
    if (!sourceId || !date) continue;
    const status = textCell(row[9])?.toLowerCase() ?? null;
    sessions.push({
      status,
      session: {
        key: opaqueKey('session', sourceId),
        date,
        routineName: textCell(row[2]),
        dayLabel: textCell(row[3]),
        startedAt: textCell(row[4]),
        endedAt: textCell(row[5]),
        durationMinutes: integerCell(row[6]),
        exercises: buildExerciseResults(sourceId, setsBySession.get(sourceId) ?? []),
        note: textCell(row[8]),
      },
    });
  }

  return sessions.sort((a, b) => b.session.date.localeCompare(a.session.date));
}

function summariesFromSessions(sessions: readonly SessionWithStatus[]): GymSessionSummary[] {
  return sessions.map(({ session, status }) => ({
    key: session.key,
    date: session.date,
    label: session.dayLabel ?? session.routineName,
    durationMinutes: session.durationMinutes,
    completed:
      status === 'complete' ? true : status === 'pending' || status === 'partial' ? false : null,
  }));
}

function numericLoad(value: string | null): number | null {
  if (!value) return null;
  const match = value.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function summarizeExerciseProgress(sessions: readonly GymSession[]): GymExerciseProgress[] {
  const byName = new Map<
    string,
    {
      display: string;
      latestDate: string;
      latestLoad: string | null;
      latestReps: number | null;
      bestLoad: string | null;
      bestLoadNumber: number | null;
      completedSets: number;
    }
  >();

  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const normalized = exercise.exerciseName.trim().toLocaleLowerCase('es');
      if (!normalized) continue;
      const latestSet = exercise.sets.find((set) => set.load !== null || set.reps !== null) ?? null;
      const existing = byName.get(normalized);
      const current = existing ?? {
        display: exercise.exerciseName,
        latestDate: session.date,
        latestLoad: latestSet?.load ?? null,
        latestReps: latestSet?.reps ?? null,
        bestLoad: null,
        bestLoadNumber: null,
        completedSets: 0,
      };

      if (session.date > current.latestDate) {
        current.latestDate = session.date;
        current.latestLoad = latestSet?.load ?? null;
        current.latestReps = latestSet?.reps ?? null;
      }

      for (const set of exercise.sets) {
        current.completedSets += 1;
        const load = numericLoad(set.load);
        if (load !== null && (current.bestLoadNumber === null || load > current.bestLoadNumber)) {
          current.bestLoadNumber = load;
          current.bestLoad = set.load;
        }
      }
      byName.set(normalized, current);
    }
  }

  return [...byName.entries()]
    .map(([normalized, value]) => ({
      key: opaqueKey('progress', normalized),
      exerciseName: value.display,
      latestDate: value.latestDate,
      latestLoad: value.latestLoad,
      bestLoad: value.bestLoad,
      latestReps: value.latestReps,
      completedSets: value.completedSets,
    }))
    .sort(
      (a, b) =>
        b.latestDate.localeCompare(a.latestDate) ||
        a.exerciseName.localeCompare(b.exerciseName, 'es'),
    );
}

export async function loadGymSessionsSnapshot(
  read: (tab: string) => Promise<ReadTabResult> = readTabValues,
): Promise<GymSessionsSnapshot> {
  const [sessionResult, setsResult] = await Promise.all([read('Gym Sessions'), read('Gym Sets')]);
  if (!sessionResult.ok) return failureSnapshot(sessionResult.code);
  if (!setsResult.ok) return failureSnapshot(setsResult.code);

  if (!headersMatch(sessionResult.values[0], GYM_SESSIONS_HEADERS)) {
    return {
      state: 'error',
      notice: 'El esquema de Gym Sessions no coincide con el contrato.',
      sessions: [],
      summaries: [],
      exerciseProgress: [],
    };
  }
  if (!headersMatch(setsResult.values[0], GYM_SETS_HEADERS)) {
    return {
      state: 'error',
      notice: 'El esquema de Gym Sets no coincide con el contrato.',
      sessions: [],
      summaries: [],
      exerciseProgress: [],
    };
  }

  const mapped = mapSessions(sessionResult.values.slice(1), setsResult.values.slice(1));
  const sessions = mapped.map((item) => item.session);
  const summaries = summariesFromSessions(mapped);
  return {
    state: sessions.length === 0 ? 'empty' : 'ready',
    notice:
      sessions.length === 0 ? 'Las pestañas están listas, pero todavía no hay sesiones.' : null,
    sessions,
    summaries,
    exerciseProgress: summarizeExerciseProgress(sessions),
  };
}
