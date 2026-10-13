/**
 * OFFLINE-ONLY authenticated-source preflight for Planning V2 execution.
 * This is NOT an API, deployed issuer, durable consent store or permission
 * to send to Google. Callbacks here are test/trusted-server interfaces; they
 * must NEVER be populated from browser-asserted flags or arbitrary rows.
 */
import { createHash } from 'node:crypto';

import { verifySessionCore, type SessionLike } from '@/lib/auth/session-core';
import { compilePlanningV2AppendCells } from '@/lib/daily-planning/append-cells-v2';
import { resolveSpreadsheetTarget } from '@/lib/google/spreadsheet-target-core';

const REPORT = /^[a-f0-9]{32,64}$/;
const EXECUTION_ID = /^vida2:tasks-daily-planning:v2:execution:[a-f0-9]{64}$/;

export interface PlanningV2TrustedReport {
  source: 'authenticated-user-checkin';
  actorId: string;
  reportId: string;
  executionRow: readonly unknown[];
}

export interface PlanningV2IssuerPreflightPorts {
  /** Must be the server's Auth.js session, never an untrusted request object. */
  getSession: () => Promise<SessionLike>;
  /** Must resolve a report from authoritative server-side evidence for this actor. */
  loadTrustedReport: (actorId: string) => Promise<PlanningV2TrustedReport | null>;
  /** Must check the stored, explicit normalized-persistence opt-in for this exact report. */
  confirmOptIn: (binding: {
    actorId: string;
    reportId: string;
    observationId: string;
    rowDigest: string;
    devWorkbookId: string;
  }) => Promise<boolean>;
}

export type PlanningV2IssuerPreflight =
  | { status: 'blocked' }
  | {
      status: 'ready-offline';
      /** INTERNAL ONLY: do not serialize this or return it to a browser. */
      executionRow: readonly unknown[];
      actorId: string;
      devWorkbookId: string;
      rowDigest: string;
    };

function blocked(): PlanningV2IssuerPreflight {
  return { status: 'blocked' };
}

/**
 * Checks an Auth.js-equivalent server session, an independently resolved
 * normalized check-in and separately verified consent. Makes ZERO writes.
 * Source/consent callbacks are intentionally not yet wired to a live store.
 */
export async function preflightPlanningV2ExecutionIssuer(
  env: Readonly<Record<string, string | undefined>>,
  ports: PlanningV2IssuerPreflightPorts,
): Promise<PlanningV2IssuerPreflight> {
  if (
    env.PLANNING_V2_DEV_ISSUER_PREFLIGHT_ENABLED !== 'true' ||
    env.VERCEL_ENV !== 'preview' ||
    env.VERCEL_GIT_COMMIT_REF !== 'vida-qa' ||
    env.GOOGLE_SHEETS_TARGET !== 'dev' ||
    env.DATA_SOURCE !== 'google'
  ) {
    return blocked();
  }

  const workbook = resolveSpreadsheetTarget(env);
  const prodId = env.GOOGLE_SHEETS_PROD_ID?.trim();
  if (
    !workbook.ok ||
    workbook.target !== 'dev' ||
    workbook.spreadsheetId.length < 10 ||
    !prodId ||
    prodId === workbook.spreadsheetId
  ) {
    return blocked();
  }

  try {
    const session = await verifySessionCore({ getSession: ports.getSession, env });
    if (!session.ok) return blocked();

    const report = await ports.loadTrustedReport(session.userId);
    if (
      !report ||
      report.source !== 'authenticated-user-checkin' ||
      report.actorId !== session.userId ||
      !REPORT.test(report.reportId) ||
      !Array.isArray(report.executionRow) ||
      report.executionRow.length !== 17 ||
      typeof report.executionRow[0] !== 'string' ||
      !EXECUTION_ID.test(report.executionRow[0]) ||
      report.executionRow[13] !== 'user_report' ||
      !compilePlanningV2AppendCells({
        kind: 'execution',
        row: report.executionRow,
        sheetId: 0,
        target: 'dev',
      }).ok
    ) {
      return blocked();
    }

    const raw = JSON.stringify(['execution', report.executionRow]);
    if (!raw || Buffer.byteLength(raw, 'utf8') > 32 * 1024) return blocked();
    const rowDigest = createHash('sha256').update(raw, 'utf8').digest('hex');
    const allowed = await ports.confirmOptIn({
      actorId: session.userId,
      reportId: report.reportId,
      observationId: report.executionRow[0],
      rowDigest,
      devWorkbookId: workbook.spreadsheetId,
    });
    if (allowed !== true) return blocked();

    return {
      status: 'ready-offline',
      executionRow: Object.freeze([...report.executionRow]),
      actorId: session.userId,
      devWorkbookId: workbook.spreadsheetId,
      rowDigest,
    };
  } catch {
    // No fallback to user-supplied assertions or another Sheets credential.
    return blocked();
  }
}
