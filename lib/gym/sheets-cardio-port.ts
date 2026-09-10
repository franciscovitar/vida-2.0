/** Lectura read-only de Cardio Sessions desde el spreadsheet canónico de Gimnasio. */
import { readGymTabValues } from '@/lib/gym/sheets-read';
import { CARDIO_SESSIONS_HEADERS } from '@/lib/gym/sheet-schema';
import type { ReadTabResult, SheetReadCode } from '@/lib/google/errors';
import type { GymCardioSession } from '@/types/gym';

export type GymCardioSnapshot = {
  state: 'ready' | 'empty' | 'unavailable' | 'error';
  notice: string | null;
  sessions: readonly GymCardioSession[];
};

type Cell = string | number | boolean | null;
type Row = readonly Cell[];

function textCell(value: Cell | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function numberCell(value: Cell | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function validDate(value: Cell | undefined): string | null {
  const text = textCell(value);
  if (!text) return null;
  return /^(\d{4}-\d{2}-\d{2})/.exec(text)?.[1] ?? null;
}

function headersMatch(row: Row | undefined): boolean {
  if (!row || row.length < CARDIO_SESSIONS_HEADERS.length) return false;
  return CARDIO_SESSIONS_HEADERS.every((name, index) => textCell(row[index]) === name);
}

function noticeFor(code: SheetReadCode): string {
  if (code === 'not-configured') return 'El registro de cardio no está configurado.';
  if (code === 'permission-error') return 'La integración no puede leer Cardio Sessions.';
  if (code === 'missing-tab') return 'Falta la pestaña Cardio Sessions.';
  if (code === 'auth-error') return 'No se pudo autenticar la lectura de Cardio Sessions.';
  return 'No se pudo leer el historial de cardio.';
}

function failure(code: SheetReadCode): GymCardioSnapshot {
  return {
    state:
      code === 'not-configured' || code === 'permission-error' || code === 'missing-tab'
        ? 'unavailable'
        : 'error',
    notice: noticeFor(code),
    sessions: [],
  };
}

function opaqueKey(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return `cardio-${hash.toString(36)}`;
}

function mapRows(rows: readonly Row[]): GymCardioSession[] {
  return rows
    .map((row, index) => {
      const sourceId = textCell(row[0]);
      const date = validDate(row[1]);
      if (!sourceId || !date) return null;
      return {
        key: opaqueKey(`${sourceId}-${index}`),
        date,
        activityType: textCell(row[2]) ?? 'other',
        modality: textCell(row[3]) ?? 'other',
        durationMinutes: numberCell(row[4]),
        distanceKm: numberCell(row[5]),
        averageSpeed: numberCell(row[6]),
        averagePowerWatts: numberCell(row[7]),
        averageHeartRate: numberCell(row[9]),
        maxHeartRate: numberCell(row[10]),
        rpe: numberCell(row[11]),
        note: textCell(row[14]),
      } satisfies GymCardioSession;
    })
    .filter((session): session is GymCardioSession => session !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function loadGymCardioSnapshot(
  read: (tab: string) => Promise<ReadTabResult> = readGymTabValues,
): Promise<GymCardioSnapshot> {
  const result = await read('Cardio Sessions');
  if (!result.ok) return failure(result.code);
  if (!headersMatch(result.values[0])) {
    return {
      state: 'error',
      notice: 'El esquema de Cardio Sessions no coincide con el contrato.',
      sessions: [],
    };
  }

  const sessions = mapRows(result.values.slice(1));
  return {
    state: sessions.length > 0 ? 'ready' : 'empty',
    notice: sessions.length > 0 ? null : 'Cardio Sessions está listo, pero todavía no tiene actividades.',
    sessions,
  };
}
