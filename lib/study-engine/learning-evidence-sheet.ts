import { normalizePrivateKey } from '@/lib/data/config';
import { fetchAccessToken, SHEETS_BASE, SPREADSHEETS_SCOPE } from '@/lib/google/auth';
import type { StudyAttemptEvent } from '@/lib/study-engine/attempt-store';
import {
  CONCEPT_INVENTORY_HEADERS,
  FRESH_EVIDENCE_HEADERS,
  headersMatch,
  mapStudyAttemptToFreshEvidence,
  parseConceptMappings,
  sameFreshEvidenceRow,
  type FreshEvidenceCell,
} from '@/lib/study-engine/fresh-evidence';

export type LearningEvidenceWriteStatus =
  'written' | 'duplicate' | 'unmapped' | 'conflict' | 'unavailable';

export interface LearningEvidenceWriteResult {
  status: LearningEvidenceWriteStatus;
  evidenceId: string | null;
}

export interface StudyLearningEvidenceBridge {
  recordAttempt(attempt: StudyAttemptEvent): Promise<LearningEvidenceWriteResult>;
}

export interface LearningSheetsValuesClient {
  getValues(rangeA1: string): Promise<{ ok: true; values: unknown[][] } | { ok: false }>;
  putValues(
    rangeA1: string,
    values: readonly (readonly FreshEvidenceCell[])[],
  ): Promise<{ ok: true } | { ok: false }>;
}

type LearningEvidenceEnv = Readonly<Record<string, string | undefined>>;

const SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;
const FRESH_EVIDENCE_RANGE = 'FreshEvidence!A1:R';
const CONCEPT_INVENTORY_RANGE = 'ConceptInventory!A1:H';

interface LearningEvidenceConfig {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
}

export function getLearningEvidenceWriteConfig(
  env: LearningEvidenceEnv = process.env,
): LearningEvidenceConfig | null {
  if (env.GOOGLE_LEARNING_SHEETS_ALLOW_WRITES !== 'true') return null;

  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawPrivateKey = env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = env.GOOGLE_LEARNING_SPREADSHEET_ID?.trim();

  if (
    !clientEmail ||
    !rawPrivateKey?.trim() ||
    !spreadsheetId ||
    !SPREADSHEET_ID_PATTERN.test(spreadsheetId)
  ) {
    return null;
  }

  return {
    clientEmail,
    privateKey: normalizePrivateKey(rawPrivateKey),
    spreadsheetId,
  };
}

function nextEvidenceRow(values: readonly (readonly unknown[])[]): number {
  return Math.max(2, values.length + 1);
}

function existingEvidenceIndex(
  values: readonly (readonly unknown[])[],
  evidenceId: string,
): number {
  const evidenceColumn = FRESH_EVIDENCE_HEADERS.indexOf('evidence_id');
  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index]?.[evidenceColumn] ?? '').trim() === evidenceId) return index;
  }
  return -1;
}

export function createLearningEvidenceBridge(input: {
  sheets: LearningSheetsValuesClient;
}): StudyLearningEvidenceBridge {
  return {
    async recordAttempt(attempt) {
      const concepts = await input.sheets.getValues(CONCEPT_INVENTORY_RANGE);
      if (!concepts.ok || !headersMatch(concepts.values[0], CONCEPT_INVENTORY_HEADERS)) {
        return { status: 'unavailable', evidenceId: null };
      }

      const mapped = mapStudyAttemptToFreshEvidence(attempt, parseConceptMappings(concepts.values));
      if (mapped.status === 'unmapped') {
        return { status: 'unmapped', evidenceId: null };
      }

      const evidence = await input.sheets.getValues(FRESH_EVIDENCE_RANGE);
      if (!evidence.ok || !headersMatch(evidence.values[0], FRESH_EVIDENCE_HEADERS)) {
        return { status: 'unavailable', evidenceId: mapped.evidenceId };
      }

      const existingIndex = existingEvidenceIndex(evidence.values, mapped.evidenceId);
      if (existingIndex >= 0) {
        return {
          status: sameFreshEvidenceRow(evidence.values[existingIndex] ?? [], mapped.row)
            ? 'duplicate'
            : 'conflict',
          evidenceId: mapped.evidenceId,
        };
      }

      const rowNumber = nextEvidenceRow(evidence.values);
      const range = `FreshEvidence!A${rowNumber}:R${rowNumber}`;
      const write = await input.sheets.putValues(range, [mapped.row]);
      if (!write.ok) return { status: 'unavailable', evidenceId: mapped.evidenceId };

      const verify = await input.sheets.getValues(FRESH_EVIDENCE_RANGE);
      if (!verify.ok) return { status: 'unavailable', evidenceId: mapped.evidenceId };

      const verifyIndex = existingEvidenceIndex(verify.values, mapped.evidenceId);
      if (verifyIndex < 0) return { status: 'unavailable', evidenceId: mapped.evidenceId };

      return {
        status: sameFreshEvidenceRow(verify.values[verifyIndex] ?? [], mapped.row)
          ? 'written'
          : 'conflict',
        evidenceId: mapped.evidenceId,
      };
    },
  };
}

export function createGoogleLearningSheetsClient(
  config: LearningEvidenceConfig,
): LearningSheetsValuesClient {
  async function withToken(): Promise<string | null> {
    const token = await fetchAccessToken(config.clientEmail, config.privateKey, SPREADSHEETS_SCOPE);
    return token.ok ? token.token : null;
  }

  return {
    async getValues(rangeA1) {
      const token = await withToken();
      if (!token) return { ok: false };

      const url =
        `${SHEETS_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(rangeA1)}` +
        '?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';

      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const text = await response.text();
        if (!response.ok) return { ok: false };
        const parsed = JSON.parse(text) as { values?: unknown[][] };
        return { ok: true, values: Array.isArray(parsed.values) ? parsed.values : [] };
      } catch {
        return { ok: false };
      }
    },

    async putValues(rangeA1, values) {
      const token = await withToken();
      if (!token) return { ok: false };

      const url =
        `${SHEETS_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(rangeA1)}` +
        '?valueInputOption=USER_ENTERED';

      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            range: rangeA1,
            majorDimension: 'ROWS',
            values,
          }),
          cache: 'no-store',
        });
        await response.text();
        return response.ok ? { ok: true } : { ok: false };
      } catch {
        return { ok: false };
      }
    },
  };
}

export function createLearningEvidenceBridgeFromEnv(
  env: LearningEvidenceEnv = process.env,
): StudyLearningEvidenceBridge | null {
  const config = getLearningEvidenceWriteConfig(env);
  if (!config) return null;
  return createLearningEvidenceBridge({
    sheets: createGoogleLearningSheetsClient(config),
  });
}
