/**
 * Puerto real de escritura Gym Sessions / Gym Sets (Google Sheets).
 * PUT a filas libres; sin append/clear/delete. Headers exactos obligatorios.
 */
import { getGoogleConfig } from '@/lib/data/config';
import { fetchAccessToken, SHEETS_BASE, SPREADSHEETS_SCOPE } from '@/lib/google/auth';
import { assertResolvedSpreadsheetId } from '@/lib/validation/spreadsheet-id';
import type { GymSessionCreatePayload } from '@/types/actions';
import type { GymSessionRowStatus, GymSheetWritePort } from '@/lib/actions/ports';

export const GYM_SESSIONS_HEADERS = [
  'sessionId',
  'date',
  'routineKey',
  'workoutDayKey',
  'startedAt',
  'finishedAt',
  'durationMinutes',
  'energyBefore',
  'notes',
  'status',
  'idempotencyKey',
  'createdAt',
] as const;

export const GYM_SETS_HEADERS = [
  'sessionId',
  'exerciseKey',
  'exerciseName',
  'setIndex',
  'weight',
  'reps',
  'rir',
  'rpe',
  'completed',
  'notes',
] as const;

export type SheetsValuesClient = {
  getValues(
    rangeA1: string,
  ): Promise<{ ok: true; values: string[][] } | { ok: false; message: string }>;
  putValues(
    rangeA1: string,
    values: readonly (readonly (string | number | boolean | null)[])[],
  ): Promise<{ ok: true } | { ok: false; message: string }>;
};

function cell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function parseSheetTitle(range: string): string {
  const bang = range.indexOf('!');
  const title = bang === -1 ? range : range.slice(0, bang);
  return title.replace(/^'|'$/g, '').trim();
}

function headersMatch(row: readonly string[] | undefined, expected: readonly string[]): boolean {
  if (!row || row.length < expected.length) return false;
  return expected.every((name, index) => (row[index] ?? '').trim() === name);
}

function findSessionRow(values: readonly (readonly string[])[], sessionId: string): number {
  for (let i = 1; i < values.length; i += 1) {
    if ((values[i]?.[0] ?? '').trim() === sessionId) return i;
  }
  return -1;
}

function findIdempotencyRow(
  values: readonly (readonly string[])[],
  idempotencyKey: string,
): number {
  const col = GYM_SESSIONS_HEADERS.indexOf('idempotencyKey');
  for (let i = 1; i < values.length; i += 1) {
    if ((values[i]?.[col] ?? '').trim() === idempotencyKey) return i;
  }
  return -1;
}

function firstFreeRow(values: readonly (readonly string[])[]): number {
  for (let i = 1; i < values.length; i += 1) {
    if (!(values[i]?.[0] ?? '').trim()) return i + 1; // 1-based sheet row
  }
  return values.length + 1;
}

function countSetsForSession(values: readonly (readonly string[])[], sessionId: string): number {
  let count = 0;
  for (let i = 1; i < values.length; i += 1) {
    if ((values[i]?.[0] ?? '').trim() === sessionId) count += 1;
  }
  return count;
}

export function createGymSheetWritePort(input: {
  sessionsRange: string;
  setsRange: string;
  sheets: SheetsValuesClient;
}): GymSheetWritePort {
  const sessionsSheet = parseSheetTitle(input.sessionsRange);
  const setsSheet = parseSheetTitle(input.setsRange);
  const sessionsReadRange = `${sessionsSheet}!A1:L`;
  const setsReadRange = `${setsSheet}!A1:J`;

  async function loadSessions(): Promise<
    { ok: true; values: string[][] } | { ok: false; message: string }
  > {
    const res = await input.sheets.getValues(sessionsReadRange);
    if (!res.ok) return res;
    if (!headersMatch(res.values[0], GYM_SESSIONS_HEADERS)) {
      return { ok: false, message: 'Esquema Gym Sessions inválido.' };
    }
    return res;
  }

  async function loadSets(): Promise<
    { ok: true; values: string[][] } | { ok: false; message: string }
  > {
    const res = await input.sheets.getValues(setsReadRange);
    if (!res.ok) return res;
    if (!headersMatch(res.values[0], GYM_SETS_HEADERS)) {
      return { ok: false, message: 'Esquema Gym Sets inválido.' };
    }
    return res;
  }

  return {
    async createPendingSession(payload, meta) {
      const loaded = await loadSessions();
      if (!loaded.ok) return { ok: false, message: loaded.message };

      const existingIdem = findIdempotencyRow(loaded.values, meta.idempotencyKey);
      if (existingIdem >= 0) {
        const existingId = (loaded.values[existingIdem]?.[0] ?? '').trim();
        if (existingId && existingId !== meta.sessionId) {
          return { ok: false, message: 'Sesión ya registrada con esta clave de idempotencia.' };
        }
        return { ok: true };
      }

      const existingSession = findSessionRow(loaded.values, meta.sessionId);
      if (existingSession >= 0) return { ok: true };

      const rowNumber = firstFreeRow(loaded.values);
      const row = [
        meta.sessionId,
        payload.date,
        payload.routineKey,
        payload.workoutDayKey,
        cell(payload.startedAt),
        cell(payload.finishedAt),
        cell(payload.durationMinutes),
        cell(payload.energyBefore),
        cell(payload.notes),
        'pending',
        meta.idempotencyKey,
        meta.createdAt,
      ];
      const range = `${sessionsSheet}!A${rowNumber}:L${rowNumber}`;
      const written = await input.sheets.putValues(range, [row]);
      if (!written.ok) return { ok: false, message: written.message };

      const verify = await loadSessions();
      if (!verify.ok) return { ok: false, message: verify.message };
      const idx = findSessionRow(verify.values, meta.sessionId);
      if (idx < 0 || (verify.values[idx]?.[9] ?? '') !== 'pending') {
        return { ok: false, message: 'Verificación de sesión pendiente fallida.' };
      }
      return { ok: true };
    },

    async writeSets(sessionId, sets) {
      const loaded = await loadSets();
      if (!loaded.ok) return { ok: false, written: 0, message: loaded.message };

      const ordered = [...sets].sort((a, b) => a.setIndex - b.setIndex);
      let written = 0;
      let rowNumber = firstFreeRow(loaded.values);

      for (const set of ordered) {
        const row = [
          sessionId,
          set.exerciseKey,
          set.exerciseName,
          set.setIndex,
          cell(set.weight),
          cell(set.reps),
          cell(set.rir),
          cell(set.rpe),
          cell(set.completed),
          cell(set.notes),
        ];
        // No convertir ausentes a cero: cell(null) => ''.
        const range = `${setsSheet}!A${rowNumber}:J${rowNumber}`;
        const put = await input.sheets.putValues(range, [row]);
        if (!put.ok) {
          return { ok: false, written, message: put.message };
        }
        written += 1;
        rowNumber += 1;
      }

      const verify = await loadSets();
      if (!verify.ok) return { ok: false, written, message: verify.message };
      const count = countSetsForSession(verify.values, sessionId);
      if (count < written) {
        return { ok: false, written, message: 'Verificación de sets incompleta.' };
      }
      return { ok: true, written };
    },

    async verifySession(sessionId, expectedSets) {
      const sessions = await loadSessions();
      if (!sessions.ok) return { ok: false, message: sessions.message };
      if (findSessionRow(sessions.values, sessionId) < 0) {
        return { ok: false, message: 'Sesión ausente.' };
      }
      const sets = await loadSets();
      if (!sets.ok) return { ok: false, message: sets.message };
      const count = countSetsForSession(sets.values, sessionId);
      if (count !== expectedSets) {
        return { ok: false, message: 'Cantidad de sets distinta a la esperada.' };
      }
      return { ok: true };
    },

    async setSessionStatus(sessionId, status: GymSessionRowStatus) {
      const loaded = await loadSessions();
      if (!loaded.ok) return { ok: false, message: loaded.message };
      const idx = findSessionRow(loaded.values, sessionId);
      if (idx < 0) return { ok: false, message: 'Sesión ausente.' };
      const rowNumber = idx + 1;
      const statusCol = GYM_SESSIONS_HEADERS.indexOf('status');
      const colLetter = String.fromCharCode('A'.charCodeAt(0) + statusCol);
      const range = `${sessionsSheet}!${colLetter}${rowNumber}`;
      const put = await input.sheets.putValues(range, [[status]]);
      if (!put.ok) return { ok: false, message: put.message };
      const verify = await loadSessions();
      if (!verify.ok) return { ok: false, message: verify.message };
      if ((verify.values[idx]?.[statusCol] ?? '') !== status) {
        return { ok: false, message: 'Estado de sesión no verificado.' };
      }
      return { ok: true };
    },
  };
}

/** Cliente Sheets real reutilizando auth/target existentes. */
export function createGoogleSheetsValuesClient(): SheetsValuesClient {
  async function withAuth(): Promise<
    { ok: true; token: string; spreadsheetId: string } | { ok: false; message: string }
  > {
    const config = getGoogleConfig();
    if (!config.ok) return { ok: false, message: 'Google Sheets no configurado.' };
    if (!config.config.writesAllowed) {
      return { ok: false, message: 'Escrituras de Sheets no autorizadas en este entorno.' };
    }
    try {
      assertResolvedSpreadsheetId(config.config.spreadsheetId, config.config.spreadsheetId);
    } catch {
      return { ok: false, message: 'Target de spreadsheet inválido.' };
    }
    const token = await fetchAccessToken(
      config.config.clientEmail,
      config.config.privateKey,
      SPREADSHEETS_SCOPE,
    );
    if (!token.ok) return { ok: false, message: 'Autenticación Google fallida.' };
    return { ok: true, token: token.token, spreadsheetId: config.config.spreadsheetId };
  }

  return {
    async getValues(rangeA1) {
      const auth = await withAuth();
      if (!auth.ok) return auth;
      const url =
        `${SHEETS_BASE}/${encodeURIComponent(auth.spreadsheetId)}/values/${encodeURIComponent(rangeA1)}` +
        `?majorDimension=ROWS`;
      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${auth.token}` },
          cache: 'no-store',
        });
        const text = await response.text();
        if (!response.ok) return { ok: false, message: 'Lectura Sheets fallida.' };
        const parsed = JSON.parse(text) as { values?: unknown[][] };
        const values = (parsed.values ?? []).map((row) =>
          (row ?? []).map((cellValue) => (cellValue == null ? '' : String(cellValue))),
        );
        return { ok: true, values };
      } catch {
        return { ok: false, message: 'Lectura Sheets fallida.' };
      }
    },

    async putValues(rangeA1, values) {
      if (rangeA1.includes('append')) {
        return { ok: false, message: 'Operación no permitida.' };
      }
      const auth = await withAuth();
      if (!auth.ok) return auth;
      const url =
        `${SHEETS_BASE}/${encodeURIComponent(auth.spreadsheetId)}/values/${encodeURIComponent(rangeA1)}` +
        `?valueInputOption=USER_ENTERED`;
      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${auth.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            range: rangeA1,
            majorDimension: 'ROWS',
            values: values.map((row) => row.map((value) => (value == null ? '' : value))),
          }),
          cache: 'no-store',
        });
        await response.text();
        if (!response.ok) return { ok: false, message: 'Escritura Sheets fallida.' };
        return { ok: true };
      } catch {
        return { ok: false, message: 'Escritura Sheets fallida.' };
      }
    },
  };
}

export function createGymSheetWritePortFromEnv(env: {
  sessionsRange: string;
  setsRange: string;
}): GymSheetWritePort {
  return createGymSheetWritePort({
    sessionsRange: env.sessionsRange,
    setsRange: env.setsRange,
    sheets: createGoogleSheetsValuesClient(),
  });
}

/** Expuesto para tests de payload gym (no convierte null → 0). */
export function gymSetRowCells(
  sessionId: string,
  set: GymSessionCreatePayload['sets'][number],
): string[] {
  return [
    sessionId,
    set.exerciseKey,
    set.exerciseName,
    String(set.setIndex),
    cell(set.weight),
    cell(set.reps),
    cell(set.rir),
    cell(set.rpe),
    cell(set.completed),
    cell(set.notes),
  ];
}
