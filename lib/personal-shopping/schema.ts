export const PERSONAL_SHOPPING_SCHEMA_VERSION = 'personal-shopping-sheets-v1.0.0';

export const PERSONAL_SHOPPING_SHEETS = {
  items: {
    title: 'Items',
    sheetId: 543005895,
    range: 'A:U',
    headers: [
      'item_id',
      'title',
      'state',
      'need',
      'quantity_text',
      'category',
      'currency',
      'estimated_price_minor',
      'target_price_minor',
      'purchase_condition',
      'notes',
      'candidate_links_json',
      'focus',
      'created_at',
      'updated_at',
      'purchased_at',
      'discarded_at',
      'source_ref',
      'finance_movement_id',
      'finance_link_state',
      'record_status',
    ],
  },
  events: {
    title: 'Events',
    sheetId: 543005896,
    range: 'A:H',
    headers: [
      'event_id',
      'item_id',
      'event_type',
      'from_state',
      'to_state',
      'occurred_at',
      'operation_id',
      'changed_fields_json',
    ],
  },
  meta: {
    title: 'Meta',
    sheetId: 543005897,
    range: 'A:B',
    headers: ['key', 'value'],
  },
} as const;

export type PersonalShoppingSheetKey = keyof typeof PERSONAL_SHOPPING_SHEETS;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function hasPersonalShoppingHeaders(
  rows: readonly (readonly unknown[])[],
  expected: readonly string[],
): boolean {
  const header = rows[0] ?? [];
  if (header.length < expected.length) return false;
  return expected.every((value, index) => asString(header[index]) === value);
}
