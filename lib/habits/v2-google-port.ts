import 'server-only';

import { getGoogleConfig } from '@/lib/data/config';
import { fetchAccessToken, SHEETS_BASE, SPREADSHEETS_SCOPE } from '@/lib/google/auth';
import { REGISTRO_DIARIO_TAB } from '@/lib/google/constants';
import { readTabValues } from '@/lib/google/sheets-read';
import type { SpreadsheetTargetEnv } from '@/lib/google/spreadsheet-target-core';
import { isHabitsV2WritesEnabled } from '@/lib/habits/v2-config';
import { HABIT_LOG_V2_TAB, HABIT_REGISTRY_TAB } from '@/lib/habits/v2-contract';
import type { HabitV2SheetPort } from '@/lib/habits/v2-write-core';

function allowedWriteRange(rangeA1: string): boolean {
  if (rangeA1.includes('append') || rangeA1.includes('clear')) return false;

  const registry = new RegExp(
    '^' + HABIT_REGISTRY_TAB.replace(/[.*+?^$\\{\\}()|[\\]\\\\]/g, '\\function allowedWriteRange(rangeA1: string): boolean {
  if (rangeA1.includes('append') || rangeA1.includes('clear')) return false;
  return (
    rangeA1.startsWith(`${HABIT_REGISTRY_TAB}!`) ||
    rangeA1.startsWith(`${HABIT_LOG_V2_TAB}!`)
  );
}') +
      '!(?:A\\\\d+:M\\\\d+|D\\\\d+:J\\\\d+)

export function createGoogleHabitsV2Port(
  env: SpreadsheetTargetEnv = process.env,
): HabitV2SheetPort {
  return {
    async readRegistry() {
      const result = await readTabValues(HABIT_REGISTRY_TAB);
      return result.ok ? { ok: true, values: result.values } : { ok: false };
    },

    async readLog() {
      const result = await readTabValues(HABIT_LOG_V2_TAB);
      return result.ok ? { ok: true, values: result.values } : { ok: false };
    },

    async readLegacy() {
      const result = await readTabValues(REGISTRO_DIARIO_TAB);
      return result.ok ? { ok: true, values: result.values } : { ok: false };
    },

    async putValues(rangeA1, values) {
      if (!allowedWriteRange(rangeA1) || !isHabitsV2WritesEnabled(env)) return { ok: false };

      const config = getGoogleConfig(env);
      if (!config.ok || !config.config.writesAllowed) return { ok: false };

      const token = await fetchAccessToken(
        config.config.clientEmail,
        config.config.privateKey,
        SPREADSHEETS_SCOPE,
      );
      if (!token.ok) return { ok: false };

      const url =
        `${SHEETS_BASE}/${encodeURIComponent(config.config.spreadsheetId)}/values/${encodeURIComponent(rangeA1)}` +
        '?valueInputOption=USER_ENTERED';

      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token.token}`,
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

export { allowedWriteRange as isAllowedHabitsV2WriteRange };
,
  );
  const log = new RegExp(
    '^' + HABIT_LOG_V2_TAB.replace(/[.*+?^$\\{\\}()|[\\]\\\\]/g, '\\function allowedWriteRange(rangeA1: string): boolean {
  if (rangeA1.includes('append') || rangeA1.includes('clear')) return false;
  return (
    rangeA1.startsWith(`${HABIT_REGISTRY_TAB}!`) ||
    rangeA1.startsWith(`${HABIT_LOG_V2_TAB}!`)
  );
}') +
      '!A\\\\d+:H\\\\d+

export function createGoogleHabitsV2Port(
  env: SpreadsheetTargetEnv = process.env,
): HabitV2SheetPort {
  return {
    async readRegistry() {
      const result = await readTabValues(HABIT_REGISTRY_TAB);
      return result.ok ? { ok: true, values: result.values } : { ok: false };
    },

    async readLog() {
      const result = await readTabValues(HABIT_LOG_V2_TAB);
      return result.ok ? { ok: true, values: result.values } : { ok: false };
    },

    async readLegacy() {
      const result = await readTabValues(REGISTRO_DIARIO_TAB);
      return result.ok ? { ok: true, values: result.values } : { ok: false };
    },

    async putValues(rangeA1, values) {
      if (!allowedWriteRange(rangeA1) || !isHabitsV2WritesEnabled(env)) return { ok: false };

      const config = getGoogleConfig(env);
      if (!config.ok || !config.config.writesAllowed) return { ok: false };

      const token = await fetchAccessToken(
        config.config.clientEmail,
        config.config.privateKey,
        SPREADSHEETS_SCOPE,
      );
      if (!token.ok) return { ok: false };

      const url =
        `${SHEETS_BASE}/${encodeURIComponent(config.config.spreadsheetId)}/values/${encodeURIComponent(rangeA1)}` +
        '?valueInputOption=USER_ENTERED';

      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token.token}`,
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

export { allowedWriteRange as isAllowedHabitsV2WriteRange };
,
  );
  return registry.test(rangeA1) || log.test(rangeA1);
}

export function createGoogleHabitsV2Port(
  env: SpreadsheetTargetEnv = process.env,
): HabitV2SheetPort {
  return {
    async readRegistry() {
      const result = await readTabValues(HABIT_REGISTRY_TAB);
      return result.ok ? { ok: true, values: result.values } : { ok: false };
    },

    async readLog() {
      const result = await readTabValues(HABIT_LOG_V2_TAB);
      return result.ok ? { ok: true, values: result.values } : { ok: false };
    },

    async readLegacy() {
      const result = await readTabValues(REGISTRO_DIARIO_TAB);
      return result.ok ? { ok: true, values: result.values } : { ok: false };
    },

    async putValues(rangeA1, values) {
      if (!allowedWriteRange(rangeA1) || !isHabitsV2WritesEnabled(env)) return { ok: false };

      const config = getGoogleConfig(env);
      if (!config.ok || !config.config.writesAllowed) return { ok: false };

      const token = await fetchAccessToken(
        config.config.clientEmail,
        config.config.privateKey,
        SPREADSHEETS_SCOPE,
      );
      if (!token.ok) return { ok: false };

      const url =
        `${SHEETS_BASE}/${encodeURIComponent(config.config.spreadsheetId)}/values/${encodeURIComponent(rangeA1)}` +
        '?valueInputOption=USER_ENTERED';

      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token.token}`,
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

export { allowedWriteRange as isAllowedHabitsV2WriteRange };
