/**
 * Feature flag y configuración de escrituras (solo servidor).
 */
export function isWriteActionsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.WRITE_ACTIONS_ENABLED === 'true';
}

export type WriteActionsConfig =
  | {
      ok: true;
      inboxPageId: string | null;
      actionsDataSourceId: string | null;
      gymSessionsRange: string | null;
      gymSetsRange: string | null;
    }
  | { ok: false; reason: 'flag-disabled' };

export function getWriteActionsConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): WriteActionsConfig {
  if (!isWriteActionsEnabled(env)) {
    return { ok: false, reason: 'flag-disabled' };
  }
  return {
    ok: true,
    inboxPageId: env.NOTION_INBOX_PAGE_ID?.trim() || null,
    actionsDataSourceId: env.NOTION_ACTIONS_DATA_SOURCE_ID?.trim() || null,
    gymSessionsRange: env.SHEETS_GYM_SESSIONS_RANGE?.trim() || null,
    gymSetsRange: env.SHEETS_GYM_SETS_RANGE?.trim() || null,
  };
}
