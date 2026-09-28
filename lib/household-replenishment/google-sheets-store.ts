import 'server-only';

import { fetchAccessToken, SHEETS_BASE, SPREADSHEETS_SCOPE } from '@/lib/google/auth';

import type { ReplenishmentRepository } from './repository';
import type { HouseholdReplenishmentSheetsConfig } from './sheets-config';
import type {
  CorrectionEvent,
  Household,
  PurchaseEvent,
  ReplenishmentNeed,
  ShoppingListItem,
} from './types';

type SheetScalar = string | number | boolean | null;
type FetchLike = typeof fetch;

type TokenResult = { ok: true; token: string } | { ok: false; code: string };

type RowRecord<T> = {
  rowNumber: number;
  value: T;
};

type StoreDeps = {
  fetchImpl?: FetchLike;
  tokenProvider?: () => Promise<TokenResult>;
  now?: () => Date;
};

const TABS = {
  households: {
    title: 'Households',
    sheetId: 990469925,
    range: 'A:C',
    headers: ['id', 'name', 'created_at'],
  },
  needs: {
    title: 'Needs',
    sheetId: 1001,
    range: 'A:G',
    headers: [
      'id',
      'household_id',
      'name',
      'category',
      'manual_seed_interval_days',
      'active',
      'created_at',
    ],
  },
  shoppingItems: {
    title: 'ShoppingItems',
    sheetId: 1003,
    range: 'A:G',
    headers: ['id', 'household_id', 'need_id', 'origin', 'state', 'added_at', 'operation_id'],
  },
  purchaseEvents: {
    title: 'PurchaseEvents',
    sheetId: 1004,
    range: 'A:G',
    headers: [
      'id',
      'household_id',
      'need_id',
      'purchased_at',
      'source',
      'created_by',
      'operation_id',
    ],
  },
  correctionEvents: {
    title: 'CorrectionEvents',
    sheetId: 1005,
    range: 'A:G',
    headers: [
      'id',
      'household_id',
      'need_id',
      'type',
      'occurred_at',
      'created_by',
      'operation_id',
    ],
  },
  operations: {
    title: 'Operations',
    sheetId: 1006,
    range: 'A:C',
    headers: ['household_id', 'operation_id', 'recorded_at'],
  },
} as const;

type TabKey = keyof typeof TABS;

function normalizeName(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return String(value).trim().toLowerCase() === 'true';
}

function cellData(value: SheetScalar) {
  if (typeof value === 'boolean') {
    return { userEnteredValue: { boolValue: value } };
  }
  if (typeof value === 'number') {
    return { userEnteredValue: { numberValue: value } };
  }
  return { userEnteredValue: { stringValue: value == null ? '' : String(value) } };
}

function rowData(values: readonly SheetScalar[]) {
  return { values: values.map(cellData) };
}

function assertHeaders(actual: unknown[], expected: readonly string[], title: string) {
  const normalized = actual.slice(0, expected.length).map(asString);
  if (
    normalized.length !== expected.length ||
    normalized.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`Household Replenishment sheet schema mismatch: ${title}`);
  }
}

export class GoogleSheetsReplenishmentRepository implements ReplenishmentRepository {
  private readonly fetchImpl: FetchLike;
  private readonly tokenProvider: () => Promise<TokenResult>;
  private readonly now: () => Date;
  private readonly cache = new Map<TabKey, unknown[][]>();
  private readonly pendingRequests: Record<string, unknown>[] = [];

  constructor(
    private readonly config: HouseholdReplenishmentSheetsConfig,
    deps: StoreDeps = {},
  ) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.tokenProvider =
      deps.tokenProvider ??
      (() =>
        fetchAccessToken(
          this.config.clientEmail,
          this.config.privateKey,
          SPREADSHEETS_SCOPE,
        ));
    this.now = deps.now ?? (() => new Date());
  }

  private async token(): Promise<string> {
    const result = await this.tokenProvider();
    if (!result.ok) {
      throw new Error(`Household Replenishment Google auth failed: ${result.code}`);
    }
    return result.token;
  }

  private async readTab(key: TabKey): Promise<unknown[][]> {
    const cached = this.cache.get(key);
    if (cached) return cached;

    const tab = TABS[key];
    const token = await this.token();
    const range = encodeURIComponent(`${tab.title}!${tab.range}`);
    const url =
      `${SHEETS_BASE}/${encodeURIComponent(this.config.spreadsheetId)}/values/${range}` +
      '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';

    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Household Replenishment sheet read failed: ${response.status}`);
    }

    const parsed = JSON.parse(bodyText) as { values?: unknown[][] };
    const values = Array.isArray(parsed.values) ? parsed.values : [];
    const headers = values[0] ?? [];
    assertHeaders(headers, tab.headers, tab.title);
    this.cache.set(key, values);
    return values;
  }

  private rows<T>(
    values: unknown[][],
    parser: (row: unknown[]) => T | null,
  ): RowRecord<T>[] {
    const result: RowRecord<T>[] = [];
    for (let index = 1; index < values.length; index += 1) {
      const value = parser(values[index] ?? []);
      if (value) {
        result.push({ rowNumber: index + 1, value });
      }
    }
    return result;
  }

  private stageAppend(key: TabKey, values: readonly SheetScalar[]) {
    this.pendingRequests.push({
      appendCells: {
        sheetId: TABS[key].sheetId,
        rows: [rowData(values)],
        fields: 'userEnteredValue',
      },
    });
  }

  private stageUpdate(key: TabKey, rowNumber: number, values: readonly SheetScalar[]) {
    this.pendingRequests.push({
      updateCells: {
        range: {
          sheetId: TABS[key].sheetId,
          startRowIndex: rowNumber - 1,
          endRowIndex: rowNumber,
          startColumnIndex: 0,
          endColumnIndex: values.length,
        },
        rows: [rowData(values)],
        fields: 'userEnteredValue',
      },
    });
  }

  private async commitPending() {
    if (this.pendingRequests.length === 0) return;

    const token = await this.token();
    const url = `${SHEETS_BASE}/${encodeURIComponent(this.config.spreadsheetId)}:batchUpdate`;
    const requests = [...this.pendingRequests];

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
      cache: 'no-store',
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Household Replenishment sheet write failed: ${response.status}`);
    }

    this.pendingRequests.splice(0, this.pendingRequests.length);
    this.cache.clear();
  }

  private parseHouseholds(values: unknown[][]): RowRecord<Household>[] {
    return this.rows(values, (row) => {
      const id = asString(row[0]).trim();
      if (!id) return null;
      return {
        id,
        name: asString(row[1]).trim() || 'Lista de casa',
        createdAt: asString(row[2]).trim(),
      };
    });
  }

  private parseNeeds(values: unknown[][]): RowRecord<ReplenishmentNeed>[] {
    return this.rows(values, (row) => {
      const id = asString(row[0]).trim();
      const householdId = asString(row[1]).trim();
      if (!id || !householdId) return null;
      return {
        id,
        householdId,
        name: asString(row[2]).trim(),
        category: asString(row[3]).trim() || 'Otros',
        manualSeedIntervalDays: asNullableNumber(row[4]),
        active: asBoolean(row[5]),
        createdAt: asString(row[6]).trim(),
      };
    });
  }

  private parseShoppingItems(values: unknown[][]): RowRecord<ShoppingListItem>[] {
    return this.rows(values, (row) => {
      const id = asString(row[0]).trim();
      const householdId = asString(row[1]).trim();
      const needId = asString(row[2]).trim();
      if (!id || !householdId || !needId) return null;
      const origin = asString(row[3]).trim();
      const state = asString(row[4]).trim();
      if (!['AUTO', 'MANUAL', 'CORRECTION'].includes(origin)) return null;
      if (!['ACTIVE', 'BOUGHT', 'SKIPPED', 'SNOOZED'].includes(state)) return null;
      return {
        id,
        householdId,
        needId,
        origin: origin as ShoppingListItem['origin'],
        state: state as ShoppingListItem['state'],
        addedAt: asString(row[5]).trim(),
        operationId: asString(row[6]).trim(),
      };
    });
  }

  private parsePurchaseEvents(values: unknown[][]): RowRecord<PurchaseEvent>[] {
    return this.rows(values, (row) => {
      const id = asString(row[0]).trim();
      const householdId = asString(row[1]).trim();
      const needId = asString(row[2]).trim();
      const source = asString(row[4]).trim();
      if (!id || !householdId || !needId) return null;
      if (!['AUTO', 'MANUAL', 'CORRECTION'].includes(source)) return null;
      return {
        id,
        householdId,
        needId,
        purchasedAt: asString(row[3]).trim(),
        source: source as PurchaseEvent['source'],
        createdBy: asString(row[5]).trim(),
        operationId: asString(row[6]).trim(),
      };
    });
  }

  private parseCorrectionEvents(values: unknown[][]): RowRecord<CorrectionEvent>[] {
    return this.rows(values, (row) => {
      const id = asString(row[0]).trim();
      const householdId = asString(row[1]).trim();
      const needId = asString(row[2]).trim();
      const type = asString(row[3]).trim();
      if (!id || !householdId || !needId) return null;
      if (
        !['STILL_HAVE', 'LOW', 'OUT', 'SNOOZE', 'MANUAL_ADD', 'ALREADY_BOUGHT'].includes(type)
      ) {
        return null;
      }
      return {
        id,
        householdId,
        needId,
        type: type as CorrectionEvent['type'],
        occurredAt: asString(row[4]).trim(),
        createdBy: asString(row[5]).trim(),
        operationId: asString(row[6]).trim(),
      };
    });
  }

  async getHousehold(householdId: string): Promise<Household | null> {
    const rows = this.parseHouseholds(await this.readTab('households'));
    return rows.find((row) => row.value.id === householdId)?.value ?? null;
  }

  async putHousehold(household: Household): Promise<void> {
    const rows = this.parseHouseholds(await this.readTab('households'));
    const existing = rows.find((row) => row.value.id === household.id);
    const values = [household.id, household.name, household.createdAt] as const;
    if (existing) this.stageUpdate('households', existing.rowNumber, values);
    else this.stageAppend('households', values);
  }

  async listNeeds(householdId: string): Promise<ReplenishmentNeed[]> {
    return this.parseNeeds(await this.readTab('needs'))
      .map((row) => row.value)
      .filter((need) => need.householdId === householdId);
  }

  async getNeed(householdId: string, needId: string): Promise<ReplenishmentNeed | null> {
    return (
      this.parseNeeds(await this.readTab('needs'))
        .map((row) => row.value)
        .find((need) => need.householdId === householdId && need.id === needId) ?? null
    );
  }

  async findNeedByName(
    householdId: string,
    normalizedName: string,
  ): Promise<ReplenishmentNeed | null> {
    return (
      this.parseNeeds(await this.readTab('needs'))
        .map((row) => row.value)
        .find(
          (need) =>
            need.householdId === householdId && normalizeName(need.name) === normalizedName,
        ) ?? null
    );
  }

  async putNeed(need: ReplenishmentNeed): Promise<void> {
    const rows = this.parseNeeds(await this.readTab('needs'));
    const existing = rows.find((row) => row.value.id === need.id);
    const values = [
      need.id,
      need.householdId,
      need.name,
      need.category,
      need.manualSeedIntervalDays,
      need.active,
      need.createdAt,
    ] as const;
    if (existing) this.stageUpdate('needs', existing.rowNumber, values);
    else this.stageAppend('needs', values);
  }

  async listShoppingItems(householdId: string): Promise<ShoppingListItem[]> {
    return this.parseShoppingItems(await this.readTab('shoppingItems'))
      .map((row) => row.value)
      .filter((item) => item.householdId === householdId);
  }

  async putShoppingItem(item: ShoppingListItem): Promise<void> {
    const rows = this.parseShoppingItems(await this.readTab('shoppingItems'));
    const existing = rows.find((row) => row.value.id === item.id);
    const values = [
      item.id,
      item.householdId,
      item.needId,
      item.origin,
      item.state,
      item.addedAt,
      item.operationId,
    ] as const;
    if (existing) this.stageUpdate('shoppingItems', existing.rowNumber, values);
    else this.stageAppend('shoppingItems', values);
  }

  async listPurchaseEvents(householdId: string, needId?: string): Promise<PurchaseEvent[]> {
    return this.parsePurchaseEvents(await this.readTab('purchaseEvents'))
      .map((row) => row.value)
      .filter(
        (event) =>
          event.householdId === householdId && (needId == null || event.needId === needId),
      );
  }

  async appendPurchaseEvent(event: PurchaseEvent): Promise<void> {
    this.stageAppend('purchaseEvents', [
      event.id,
      event.householdId,
      event.needId,
      event.purchasedAt,
      event.source,
      event.createdBy,
      event.operationId,
    ]);
  }

  async listCorrectionEvents(
    householdId: string,
    needId?: string,
  ): Promise<CorrectionEvent[]> {
    return this.parseCorrectionEvents(await this.readTab('correctionEvents'))
      .map((row) => row.value)
      .filter(
        (event) =>
          event.householdId === householdId && (needId == null || event.needId === needId),
      );
  }

  async appendCorrectionEvent(event: CorrectionEvent): Promise<void> {
    this.stageAppend('correctionEvents', [
      event.id,
      event.householdId,
      event.needId,
      event.type,
      event.occurredAt,
      event.createdBy,
      event.operationId,
    ]);
  }

  async hasOperation(householdId: string, operationId: string): Promise<boolean> {
    const values = await this.readTab('operations');
    return this.rows(values, (row) => {
      const rowHouseholdId = asString(row[0]).trim();
      const rowOperationId = asString(row[1]).trim();
      if (!rowHouseholdId || !rowOperationId) return null;
      return { householdId: rowHouseholdId, operationId: rowOperationId };
    }).some(
      (row) => row.value.householdId === householdId && row.value.operationId === operationId,
    );
  }

  async recordOperation(householdId: string, operationId: string): Promise<void> {
    this.stageAppend('operations', [householdId, operationId, this.now().toISOString()]);
    await this.commitPending();
  }
}
