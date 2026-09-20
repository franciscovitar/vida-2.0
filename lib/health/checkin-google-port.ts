import 'server-only';

import { getGoogleConfig } from '@/lib/data/config';
import { fetchAccessToken, SHEETS_BASE, SPREADSHEETS_SCOPE } from '@/lib/google/auth';
import { readTabValues } from '@/lib/google/sheets-read';
import {
  buildHealthCheckinSnapshot,
  HEALTH_CHECKIN_HEADERS,
  HEALTH_CHECKIN_TAB,
  todayInCordoba,
  type HealthCheckinPortWriteCode,
  type HealthCheckinSheetPort,
  type HealthCheckinSnapshot,
} from '@/lib/health/checkin';

function mapStatus(status: number): HealthCheckinPortWriteCode {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  return 'write-error';
}

export const googleHealthCheckinSheetPort: HealthCheckinSheetPort = {
  async read() {
    return readTabValues(HEALTH_CHECKIN_TAB);
  },

  async writeRow(rowNumber, row) {
    if (
      !Number.isInteger(rowNumber) ||
      rowNumber < 2 ||
      row.length !== HEALTH_CHECKIN_HEADERS.length
    ) {
      return { ok: false, code: 'write-error' };
    }

    const config = getGoogleConfig();
    if (!config.ok) return { ok: false, code: 'not-configured' };
    if (config.config.target !== 'dev' || !config.config.writesAllowed) {
      return { ok: false, code: 'disabled' };
    }

    const token = await fetchAccessToken(
      config.config.clientEmail,
      config.config.privateKey,
      SPREADSHEETS_SCOPE,
    );
    if (!token.ok) {
      if (token.code === 'permission-error') return { ok: false, code: 'permission-error' };
      if (token.code === 'auth-error') return { ok: false, code: 'auth-error' };
      return { ok: false, code: 'write-error' };
    }

    const rangeA1 = `'${HEALTH_CHECKIN_TAB}'!A${rowNumber}:K${rowNumber}`;
    const url =
      `${SHEETS_BASE}/${encodeURIComponent(config.config.spreadsheetId)}/values/${encodeURIComponent(rangeA1)}` +
      '?valueInputOption=RAW';

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `***
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ range: rangeA1, majorDimension: 'ROWS', values: [row] }),
        cache: 'no-store',
      });
      await response.text();
      if (!response.ok) return { ok: false, code: mapStatus(response.status) };
      return { ok: true };
    } catch {
      return { ok: false, code: 'write-error' };
    }
  },
};

export async function loadTodayHealthCheckin(): Promise<HealthCheckinSnapshot> {
  const config = getGoogleConfig();
  const canWrite =
    config.ok && config.config.target === 'dev' && config.config.writesAllowed === true;
  const read = await readTabValues(HEALTH_CHECKIN_TAB);
  return buildHealthCheckinSnapshot(read, todayInCordoba(), canWrite);
}
