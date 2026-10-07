import { randomUUID } from 'node:crypto';

import { normalizePersonalPurchaseTitle, validatePersonalPurchaseItem } from './core';
import type { PersonalShoppingRepository } from './repository';
import type {
  PersonalPurchaseEvent,
  PersonalPurchaseItem,
  PersonalPurchaseMutation,
  PersonalPurchaseState,
} from './types';

export type PersonalShoppingActiveState = Extract<
  PersonalPurchaseState,
  'BUY' | 'RESEARCH' | 'REPLENISH'
>;

export interface PersonalShoppingSnapshot {
  items: PersonalPurchaseItem[];
  counts: Record<PersonalPurchaseState, number>;
}

export type PersonalShoppingMutationResult =
  | { ok: true; code: 'applied' | 'idempotent' | 'existing'; snapshot: PersonalShoppingSnapshot }
  | { ok: false; code: 'invalid-input' | 'storage-error'; message: string };

type ServiceDeps = {
  now?: () => Date;
  id?: () => string;
};

function activeState(value: string): value is PersonalShoppingActiveState {
  return value === 'BUY' || value === 'RESEARCH' || value === 'REPLENISH';
}

function emptyCounts(): Record<PersonalPurchaseState, number> {
  return { BUY: 0, RESEARCH: 0, REPLENISH: 0, PURCHASED: 0, DISCARDED: 0 };
}

function normalizedKey(value: string): string {
  return normalizePersonalPurchaseTitle(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export class PersonalShoppingService {
  private readonly now: () => Date;
  private readonly id: () => string;

  constructor(
    private readonly repository: PersonalShoppingRepository,
    deps: ServiceDeps = {},
  ) {
    this.now = deps.now ?? (() => new Date());
    this.id = deps.id ?? randomUUID;
  }

  async snapshot(): Promise<PersonalShoppingSnapshot> {
    const items = (await this.repository.listItems())
      .filter((item) => item.recordStatus === 'active')
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.title.localeCompare(right.title, 'es'),
      );
    const counts = emptyCounts();
    for (const item of items) counts[item.state] += 1;
    return { items, counts };
  }

  async add(input: {
    title: string;
    state: string;
    operationId: string;
  }): Promise<PersonalShoppingMutationResult> {
    const title = normalizePersonalPurchaseTitle(input.title);
    if (!title || title.length > 180 || !activeState(input.state)) {
      return {
        ok: false,
        code: 'invalid-input',
        message: 'Ingresá una compra válida y elegí Comprar, Investigar o Reponer.',
      };
    }

    if (input.operationId.length < 8 || input.operationId.length > 120) {
      return { ok: false, code: 'invalid-input', message: 'La operación no es válida.' };
    }

    if (await this.repository.hasOperation(input.operationId)) {
      return { ok: true, code: 'idempotent', snapshot: await this.snapshot() };
    }

    const existing = (await this.repository.listItems()).find(
      (item) =>
        item.recordStatus === 'active' &&
        !['PURCHASED', 'DISCARDED'].includes(item.state) &&
        normalizedKey(item.title) === normalizedKey(title),
    );
    if (existing) {
      return { ok: true, code: 'existing', snapshot: await this.snapshot() };
    }

    const timestamp = this.now().toISOString();
    const item: PersonalPurchaseItem = {
      id: `ps_${this.id()}`,
      title,
      state: input.state,
      need: null,
      quantityText: null,
      category: null,
      currency: null,
      estimatedPriceMinor: null,
      targetPriceMinor: null,
      purchaseCondition: null,
      notes: null,
      candidateLinks: [],
      focus: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      purchasedAt: null,
      discardedAt: null,
      sourceRef: null,
      financeMovementId: null,
      financeLinkState: 'none',
      recordStatus: 'active',
    };
    validatePersonalPurchaseItem(item);

    const event: PersonalPurchaseEvent = {
      id: `pse_${this.id()}`,
      itemId: item.id,
      eventType: 'CREATED',
      fromState: null,
      toState: item.state,
      occurredAt: timestamp,
      operationId: input.operationId,
      changedFields: { title: item.title, state: item.state },
    };
    const mutation: PersonalPurchaseMutation = { item, event };

    try {
      await this.repository.saveItemsWithEvents([mutation]);
      return { ok: true, code: 'applied', snapshot: await this.snapshot() };
    } catch {
      return {
        ok: false,
        code: 'storage-error',
        message: 'No se pudo guardar la compra. Probá de nuevo.',
      };
    }
  }
}
