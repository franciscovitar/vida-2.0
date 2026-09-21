import 'server-only';

import { getGoogleConfig } from '@/lib/data/config';
import { sanitizeSheetValues } from '@/lib/data/plain';
import { fetchAccessToken, SHEETS_BASE, SPREADSHEETS_SCOPE } from '@/lib/google/auth';
import { readTabValues } from '@/lib/google/sheets-read';
import {
  INTELLIGENCE_FEEDBACK_HEADERS,
  INTELLIGENCE_FEEDBACK_TAB,
  type IntelligenceFeedbackCell,
  type IntelligenceFeedbackRecord,
  type IntelligenceFeedbackSheetPort,
  parseIntelligenceFeedbackSnapshot,
} from '@/lib/intelligence/feedback';

function mapStatus(
  status: number,
): 'permission-error' | 'auth-error' | 'read-error' | 'write-error' {
  if (status === 401) return 'auth-error';
  if (status === 403) return 'permission-error';
  return status >= 400 && status < 500 ? 'write-error' : 'read-error';
}

async function withSheetAuth(): Promise<
  | { ok: true; token: string; spreadsheetId: string }
  | { ok: false; code: 'not-configured' | 'auth-error' | 'permission-error' | 'write-error' }
> {
  const config = getGoogleConfig();
  if (!config.ok || !config.config.writesAllowed) {
    return { ok: false, code: 'not-configured' };
  }

  const token = await fetchAccessToken(
    config.config.clientEmail,
    config.config.privateKey,
    SPREADSHEETS_SCOPE,
  );
  if (!token.ok) {
    return {
      ok: false,
      code: token.code === 'permission-error' ? 'permission-error' : 'auth-error',
    };
  }

  return {
    ok: true,
    token: token.token,
    spreadsheetId: config.config.spreadsheetId,
  };
}

export const googleIntelligenceFeedbackSheetPort: IntelligenceFeedbackSheetPort = {
  async readAll() {
    const auth = await withSheetAuth();
    if (!auth.ok) {
      const code = auth.code === 'write-error' ? 'read-error' : auth.code;
      return { ok: false, code };
    }

    const range = encodeURIComponent(INTELLIGENCE_FEEDBACK_TAB);
    const url =
      `${SHEETS_BASE}/${encodeURIComponent(auth.spreadsheetId)}/values/${range}` +
      '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${auth.token}` },
        cache: 'no-store',
      });
      const bodyText = await response.text();
      if (!response.ok) {
        const code = mapStatus(response.status);
        return {
          ok: false,
          code: code === 'write-error' ? 'read-error' : code,
        };
      }

      const parsed = JSON.parse(bodyText) as { values?: unknown };
      const values = Array.isArray(parsed.values) ? (parsed.values as unknown[][]) : [];
      return {
        ok: true,
        values: sanitizeSheetValues(values) as IntelligenceFeedbackCell[][],
      };
    } catch {
      return { ok: false, code: 'read-error' };
    }
  },

  async writeRow(rangeA1, values) {
    const match = /^'Intelligence Feedback'!A(\d+):D(\d+)$/.exec(rangeA1);
    if (!match || match[1] !== match[2] || values.length !== INTELLIGENCE_FEEDBACK_HEADERS.length) {
      return { ok: false, code: 'write-error' };
    }

    const auth = await withSheetAuth();
    if (!auth.ok) return auth;

    const url =
      `${SHEETS_BASE}/${encodeURIComponent(auth.spreadsheetId)}/values/${encodeURIComponent(rangeA1)}` +
      '?valueInputOption=RAW';

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
          values: [[...values]],
        }),
        cache: 'no-store',
      });
      await response.text();
      if (!response.ok) {
        const code = mapStatus(response.status);
        return {
          ok: false,
          code: code === 'read-error' ? 'write-error' : code,
        };
      }
      return { ok: true };
    } catch {
      return { ok: false, code: 'write-error' };
    }
  },
};

export interface IntelligenceFeedbackSnapshot {
  writable: boolean;
  state: 'ready' | 'empty' | 'unavailable' | 'error';
  notice: string | null;
  feedback: IntelligenceFeedbackRecord | null;
}

export async function loadIntelligenceFeedbackSnapshot(
  articleId: string,
): Promise<IntelligenceFeedbackSnapshot> {
  const config = getGoogleConfig();
  if (!config.ok) {
    return {
      writable: false,
      state: 'unavailable',
      notice: 'El feedback no está disponible para este destino.',
      feedback: null,
    };
  }

  const read = await readTabValues(INTELLIGENCE_FEEDBACK_TAB);
  if (!read.ok) {
    return {
      writable: false,
      state: read.code === 'read-error' || read.code === 'auth-error' ? 'error' : 'unavailable',
      notice:
        read.code === 'missing-tab'
          ? 'Falta la pestaña Intelligence Feedback.'
          : 'No se pudo leer Intelligence Feedback.',
      feedback: null,
    };
  }

  const parsed = parseIntelligenceFeedbackSnapshot(read.values, articleId);
  if (!parsed.ok) {
    return {
      writable: false,
      state: 'error',
      notice:
        parsed.code === 'duplicate-article'
          ? 'Intelligence Feedback contiene artículos duplicados.'
          : 'Intelligence Feedback no coincide con el contrato V1.',
      feedback: null,
    };
  }

  return {
    writable: config.config.writesAllowed,
    state: parsed.feedback ? 'ready' : 'empty',
    notice: null,
    feedback: parsed.feedback,
  };
}
