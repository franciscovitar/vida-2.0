import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ALLOWED_SPREADSHEET_ID,
  assertAllowedSpreadsheetId,
  DisallowedSpreadsheetError,
  isAllowedSpreadsheetId,
} from '@/lib/validation/spreadsheet-id';

test('el Sheet DEV es el único ID permitido', () => {
  assert.equal(isAllowedSpreadsheetId(ALLOWED_SPREADSHEET_ID), true);
  assert.doesNotThrow(() => assertAllowedSpreadsheetId(ALLOWED_SPREADSHEET_ID));
});

test('cualquier otro ID (incluido producción) es rechazado', () => {
  const productionLikeId = '1PRODUCCION_ID_NO_PERMITIDO_aaaaaaaaaaaaaaaaaa';
  assert.equal(isAllowedSpreadsheetId(productionLikeId), false);
  assert.throws(() => assertAllowedSpreadsheetId(productionLikeId), DisallowedSpreadsheetError);
});
