import {
  assertFinanceRowWidth,
  FINANCE_SHEETS,
  type FinanceSheetKey,
  type FinanceSheetScalar,
} from '@/lib/finance/store/schema';

export type FinanceSheetIds = Partial<Record<FinanceSheetKey, number>>;

export type FinanceMutation =
  | {
      kind: 'append';
      sheet: FinanceSheetKey;
      rows: readonly (readonly FinanceSheetScalar[])[];
    }
  | {
      kind: 'update-row';
      sheet: FinanceSheetKey;
      rowNumber: number;
      values: readonly FinanceSheetScalar[];
    };

function cellData(value: FinanceSheetScalar) {
  if (typeof value === 'boolean') {
    return { userEnteredValue: { boolValue: value } };
  }
  if (typeof value === 'number') {
    return { userEnteredValue: { numberValue: value } };
  }
  return { userEnteredValue: { stringValue: value == null ? '' : String(value) } };
}

function rowData(values: readonly FinanceSheetScalar[]) {
  return { values: values.map(cellData) };
}

function requireSheetId(ids: FinanceSheetIds, sheet: FinanceSheetKey): number {
  const id = ids[sheet];
  if (!Number.isInteger(id) || id == null || id < 0) {
    throw new Error(`Missing Finance sheet id for ${FINANCE_SHEETS[sheet].title}`);
  }
  return id;
}

export function buildFinanceBatchRequests(
  ids: FinanceSheetIds,
  mutations: readonly FinanceMutation[],
): Record<string, unknown>[] {
  const requests: Record<string, unknown>[] = [];

  for (const mutation of mutations) {
    const sheetId = requireSheetId(ids, mutation.sheet);

    if (mutation.kind === 'append') {
      for (const row of mutation.rows) assertFinanceRowWidth(mutation.sheet, row);
      if (mutation.rows.length === 0) continue;
      requests.push({
        appendCells: {
          sheetId,
          rows: mutation.rows.map(rowData),
          fields: 'userEnteredValue',
        },
      });
      continue;
    }

    if (!Number.isInteger(mutation.rowNumber) || mutation.rowNumber < 2) {
      throw new RangeError('Finance row updates may only target data rows >= 2');
    }
    assertFinanceRowWidth(mutation.sheet, mutation.values);
    requests.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: mutation.rowNumber - 1,
          endRowIndex: mutation.rowNumber,
          startColumnIndex: 0,
          endColumnIndex: mutation.values.length,
        },
        rows: [rowData(mutation.values)],
        fields: 'userEnteredValue',
      },
    });
  }

  return requests;
}
