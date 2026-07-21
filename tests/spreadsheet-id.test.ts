import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertResolvedSpreadsheetId,
  DisallowedSpreadsheetError,
  isResolvedSpreadsheetId,
} from '@/lib/validation/spreadsheet-id';

const RESOLVED = 'resolved-target-id-aaaaaaaaaaaaaaaaaaaa';

test('el ID resuelto del target es el único permitido', () => {
  assert.equal(isResolvedSpreadsheetId(RESOLVED, RESOLVED), true);
  assert.doesNotThrow(() => assertResolvedSpreadsheetId(RESOLVED, RESOLVED));
});

test('cualquier otro ID (incluido producción) es rechazado', () => {
  const other = '1PRODUCCION_ID_NO_PERMITIDO_aaaaaaaaaaaaaaaaaa';
  assert.equal(isResolvedSpreadsheetId(other, RESOLVED), false);
  assert.throws(() => assertResolvedSpreadsheetId(other, RESOLVED), DisallowedSpreadsheetError);
});
