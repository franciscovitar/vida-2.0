/**
 * Resolución del target Google Sheets (solo servidor).
 * Reexporta el núcleo puro e impone server-only para no importar desde cliente.
 */
import 'server-only';

import {
  resolveSpreadsheetTarget,
  type SpreadsheetTargetEnv,
  type SpreadsheetTargetResult,
} from './spreadsheet-target-core';

export type {
  SheetsTargetName,
  SpreadsheetTargetEnv,
  SpreadsheetTargetFail,
  SpreadsheetTargetFailReason,
  SpreadsheetTargetOk,
  SpreadsheetTargetResult,
} from './spreadsheet-target-core';

export {
  isProdTargetEnvironmentAllowed,
  isProdWritesAllowed,
  resolveSpreadsheetTarget,
} from './spreadsheet-target-core';

/** Resuelve el target desde process.env (servidor). */
export function getSpreadsheetTarget(
  env: SpreadsheetTargetEnv = process.env,
): SpreadsheetTargetResult {
  return resolveSpreadsheetTarget(env);
}
