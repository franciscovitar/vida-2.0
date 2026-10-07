import { fetchAccessToken, SHEETS_BASE, SPREADSHEETS_SCOPE } from '@/lib/google/auth';

import type { PersonalShoppingRepository } from './repository';
import { hasPersonalShoppingHeaders, PERSONAL_SHOPPING_SHEETS } from './schema';
import type {
  PersonalPurchaseEvent,
  PersonalPurchaseEventType,
  PersonalPurchaseFinanceLinkState,
  PersonalPurchaseItem,
  PersonalPurchaseMutation,
  PersonalPurchaseRecordStatus,
  PersonalPurchaseState,
} from './types';

type SheetScalar = string | number | boolean | null;
type FetchLike = typeof fetch;
type TokenResult = { ok: true; token: string } | { ok: false; code: string };

type StoreDeps = {
  fetchImpl?: FetchLike;
  tokenProvider?: () => Promise<TokenResult>;
};

export interface GoogleSheetsPersonalShoppingConfig {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
  writesEnabled: boolean;
}

type RowRecord<T> = { rowNumber: number; value: T };

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asNullableString(value: unknown): string | null {
  const normalized = asString(value).trim();
  return normalized || null;
}

function asNullableMinor(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return asString(value).trim().toLowerCase() === 'true';
}

function asStringArray(value: unknown): string[] {
  const raw = asString(value).trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function asObject(value: unknown): Record<string, unknown> {
  const raw = asString(value).trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isState(value: string): value is PersonalPurchaseState {
  return ['BUY', 'RESEARCH', 'REPLENISH', 'PURCHASED', 'DISCARDED'].includes(value);
}

function isFinanceLinkState(value: string): value is PersonalPurchaseFinanceLinkState {
  return ['none', 'suggested', 'linked'].includes(value);
}

function isRecordStatus(value: string): value is PersonalPurchaseRecordStatus {
  return ['active', 'superseded'].includes(value);
}

function isEventType(value: string): value is PersonalPurchaseEventType {
  return [
    'CREATED',
    'MIGRATED',
    'STATE_CHANGED',
    'DETAIL_UPDATED',
    'PURCHASED',
    'DISCARDED',
    'RESTORED',
    'FINANCE_LINKED',
  ].includes(value);
}

function cellData(value: SheetScalar) {
  if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
  if (typeof value === 'number') return { userEnteredValue: { numberValue: value } };
  return { userEnteredValue: { stringValue: value == null ? '' : String(value) } };
}

function rowData(values: readonly SheetScalar[]) {
  return { values: values.map(cellData) };
}

export class GoogleSheetsPersonalShoppingRepository implements PersonalShoppingRepository {
  private readonly fetchImpl: FetchLike;
  private readonly tokenProvider: () => Promise<TokenResult>;
  private readonly cache = new Map<'items' | 'events', unknown[][]>();

  constructor(
    private readonly config: GoogleSheetsPersonalShoppingConfig,
    deps: StoreDeps = {},
  ) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.tokenProvider =
      deps.tokenProvider ??
      (() => fetchAccessToken(config.clientEmail, config.privateKey, SPREADSHEETS_SCOPE));
  }

  private async token(): Promise<string> {
    const result = await this.tokenProvider();
    if (!result.ok) throw new Error(`Personal Shopping Google auth failed: ${result.code}`);
    return result.token;
  }

  private async readTab(key: 'items' | 'events'): Promise<unknown[][]> {
    const cached = this.cache.get(key);
    if (cached) return cached;

    const tab = PERSONAL_SHOPPING_SHEETS[key];
    const token = await this.token();
    const range = encodeURIComponent(`${tab.title}!${tab.range}`);
    const response = await this.fetchImpl(
      `${SHEETS_BASE}/${encodeURIComponent(this.config.spreadsheetId)}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      },
    );
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Personal Shopping sheet read failed: ${response.status}`);
    }

    const parsed = JSON.parse(bodyText) as { values?: unknown[][] };
    const values = Array.isArray(parsed.values) ? parsed.values : [];
    if (!hasPersonalShoppingHeaders(values, tab.headers)) {
      throw new Error(`Personal Shopping sheet schema mismatch: ${tab.title}`);
    }
    this.cache.set(key, values);
    return values;
  }

  private rows<T>(values: unknown[][], parser: (row: unknown[]) => T | null): RowRecord<T>[] {
    const output: RowRecord<T>[] = [];
    for (let index = 1; index < values.length; index += 1) {
      const parsed = parser(values[index] ?? []);
      if (parsed) output.push({ rowNumber: index + 1, value: parsed });
    }
    return output;
  }

  private parseItems(values: unknown[][]): RowRecord<PersonalPurchaseItem>[] {
    return this.rows(values, (row) => {
      const id = asString(row[0]).trim();
      const title = asString(row[1]).trim();
      const state = asString(row[2]).trim();
      const financeLinkState = asString(row[19]).trim() || 'none';
      const recordStatus = asString(row[20]).trim() || 'active';
      if (!id || !title || !isState(state)) return null;
      if (!isFinanceLinkState(financeLinkState) || !isRecordStatus(recordStatus)) return null;

      return {
        id,
        title,
        state,
        need: asNullableString(row[3]),
        quantityText: asNullableString(row[4]),
        category: asNullableString(row[5]),
        currency: asNullableString(row[6]),
        estimatedPriceMinor: asNullableMinor(row[7]),
        targetPriceMinor: asNullableMinor(row[8]),
        purchaseCondition: asNullableString(row[9]),
        notes: asNullableString(row[10]),
        candidateLinks: asStringArray(row[11]),
        focus: asBoolean(row[12]),
        createdAt: asString(row[13]).trim(),
        updatedAt: asString(row[14]).trim(),
        purchasedAt: asNullableString(row[15]),
        discardedAt: asNullableString(row[16]),
        sourceRef: asNullableString(row[17]),
        financeMovementId: asNullableString(row[18]),
        financeLinkState,
        recordStatus,
      };
    });
  }

  private parseEvents(values: unknown[][]): RowRecord<PersonalPurchaseEvent>[] {
    return this.rows(values, (row) => {
      const id = asString(row[0]).trim();
      const itemId = asString(row[1]).trim();
      const eventType = asString(row[2]).trim();
      const fromState = asString(row[3]).trim();
      const toState = asString(row[4]).trim();
      const operationId = asString(row[6]).trim();
      if (!id || !itemId || !operationId || !isEventType(eventType)) return null;
      if (fromState && !isState(fromState)) return null;
      if (toState && !isState(toState)) return null;

      return {
        id,
        itemId,
        eventType,
        fromState: fromState ? (fromState as PersonalPurchaseState) : null,
        toState: toState ? (toState as PersonalPurchaseState) : null,
        occurredAt: asString(row[5]).trim(),
        operationId,
        changedFields: asObject(row[7]),
      };
    });
  }

  private itemRow(item: PersonalPurchaseItem): readonly SheetScalar[] {
    return [
      item.id,
      item.title,
      item.state,
      item.need,
      item.quantityText,
      item.category,
      item.currency,
      item.estimatedPriceMinor,
      item.targetPriceMinor,
      item.purchaseCondition,
      item.notes,
      JSON.stringify(item.candidateLinks),
      item.focus,
      item.createdAt,
      item.updatedAt,
      item.purchasedAt,
      item.discardedAt,
      item.sourceRef,
      item.financeMovementId,
      item.financeLinkState,
      item.recordStatus,
    ];
  }

  private eventRow(event: PersonalPurchaseEvent): readonly SheetScalar[] {
    return [
      event.id,
      event.itemId,
      event.eventType,
      event.fromState,
      event.toState,
      event.occurredAt,
      event.operationId,
      JSON.stringify(event.changedFields),
    ];
  }

  async listItems(): Promise<PersonalPurchaseItem[]> {
    return this.parseItems(await this.readTab('items')).map((row) => row.value);
  }

  async getItem(itemId: string): Promise<PersonalPurchaseItem | null> {
    return (await this.listItems()).find((item) => item.id === itemId) ?? null;
  }

  async findItemBySourceRef(sourceRef: string): Promise<PersonalPurchaseItem | null> {
    return (await this.listItems()).find((item) => item.sourceRef === sourceRef) ?? null;
  }

  async listEvents(itemId?: string): Promise<PersonalPurchaseEvent[]> {
    return this.parseEvents(await this.readTab('events'))
      .map((row) => row.value)
      .filter((event) => itemId == null || event.itemId === itemId);
  }

  async hasOperation(operationId: string): Promise<boolean> {
    return (await this.listEvents()).some((event) => event.operationId === operationId);
  }

  async saveItemsWithEvents(mutations: readonly PersonalPurchaseMutation[]): Promise<void> {
    if (!this.config.writesEnabled) {
      throw new Error('Personal Shopping writes are disabled');
    }
    if (mutations.length === 0) return;

    const [itemRows, events] = await Promise.all([
      this.readTab('items').then((values) => this.parseItems(values)),
      this.listEvents(),
    ]);
    const itemById = new Map(itemRows.map((row) => [row.value.id, row]));
    const existingOperations = new Set(events.map((event) => event.operationId));
    const requests: Record<string, unknown>[] = [];

    for (const mutation of mutations) {
      if (mutation.item.id !== mutation.event.itemId) {
        throw new Error('Personal Shopping mutation item/event mismatch');
      }
      if (existingOperations.has(mutation.event.operationId)) continue;

      const existing = itemById.get(mutation.item.id);
      const values = this.itemRow(mutation.item);
      if (existing) {
        requests.push({
          updateCells: {
            range: {
              sheetId: PERSONAL_SHOPPING_SHEETS.items.sheetId,
              startRowIndex: existing.rowNumber - 1,
              endRowIndex: existing.rowNumber,
              startColumnIndex: 0,
              endColumnIndex: values.length,
            },
            rows: [rowData(values)],
            fields: 'userEnteredValue',
          },
        });
      } else {
        requests.push({
          appendCells: {
            sheetId: PERSONAL_SHOPPING_SHEETS.items.sheetId,
            rows: [rowData(values)],
            fields: 'userEnteredValue',
          },
        });
      }

      requests.push({
        appendCells: {
          sheetId: PERSONAL_SHOPPING_SHEETS.events.sheetId,
          rows: [rowData(this.eventRow(mutation.event))],
          fields: 'userEnteredValue',
        },
      });
      existingOperations.add(mutation.event.operationId);
    }

    if (requests.length === 0) return;

    const token = await this.token();
    const response = await this.fetchImpl(
      `${SHEETS_BASE}/${encodeURIComponent(this.config.spreadsheetId)}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
        cache: 'no-store',
      },
    );
    await response.text();
    if (!response.ok) {
      throw new Error(`Personal Shopping sheet write failed: ${response.status}`);
    }

    this.cache.clear();
  }
}
