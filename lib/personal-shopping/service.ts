import { randomUUID } from 'node:crypto';

import {
  buildPersonalPurchaseDetailUpdate,
  buildPersonalPurchaseTransition,
  canTransitionPersonalPurchase,
  isPersonalPurchaseState,
  normalizePersonalPurchaseTitle,
  validatePersonalPurchaseItem,
} from './core';
import type { PersonalShoppingRepository } from './repository';
import type {
  PersonalPurchaseDetailPatch,
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
  | { ok: false; code: 'invalid-input' | 'not-found' | 'storage-error'; message: string };

type ServiceDeps = {
  now?: () => Date;
  id?: () => string;
};

function activeState(value: string): value is PersonalShoppingActiveState {
  return value === 'BUY' || value === 'RESEARCH' || value === 'REPLENISH';
}

function validOperationId(value: string): boolean {
  return value.trim().length >= 8 && value.trim().length <= 120;
}

function validItemId(value: string): boolean {
  return value.trim().length >= 3 && value.trim().length <= 180;
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

    if (!validOperationId(input.operationId)) {
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

    return this.persist(mutation);
  }

  async updateDetails(input: {
    itemId: string;
    operationId: string;
    patch: PersonalPurchaseDetailPatch;
  }): Promise<PersonalShoppingMutationResult> {
    if (!validItemId(input.itemId) || !validOperationId(input.operationId)) {
      return { ok: false, code: 'invalid-input', message: 'La operación no es válida.' };
    }
    if (await this.repository.hasOperation(input.operationId)) {
      return { ok: true, code: 'idempotent', snapshot: await this.snapshot() };
    }

    const item = await this.repository.getItem(input.itemId);
    if (!item || item.recordStatus !== 'active') {
      return { ok: false, code: 'not-found', message: 'No encontramos ese ítem.' };
    }

    let mutation: PersonalPurchaseMutation | null;
    try {
      mutation = buildPersonalPurchaseDetailUpdate({
        item,
        patch: input.patch,
        occurredAt: this.now().toISOString(),
        eventId: `pse_${this.id()}`,
        operationId: input.operationId,
      });
    } catch {
      return {
        ok: false,
        code: 'invalid-input',
        message: 'Revisá los detalles: precios, moneda, textos y links deben ser válidos.',
      };
    }

    if (!mutation) {
      return { ok: true, code: 'idempotent', snapshot: await this.snapshot() };
    }
    return this.persist(mutation);
  }

  async transition(input: {
    itemId: string;
    toState: string;
    operationId: string;
  }): Promise<PersonalShoppingMutationResult> {
    if (
      !validItemId(input.itemId) ||
      !validOperationId(input.operationId) ||
      !isPersonalPurchaseState(input.toState)
    ) {
      return { ok: false, code: 'invalid-input', message: 'La transición no es válida.' };
    }
    if (await this.repository.hasOperation(input.operationId)) {
      return { ok: true, code: 'idempotent', snapshot: await this.snapshot() };
    }

    const item = await this.repository.getItem(input.itemId);
    if (!item || item.recordStatus !== 'active') {
      return { ok: false, code: 'not-found', message: 'No encontramos ese ítem.' };
    }
    if (item.state === input.toState) {
      return { ok: true, code: 'idempotent', snapshot: await this.snapshot() };
    }
    if (!canTransitionPersonalPurchase(item.state, input.toState)) {
      return {\n        ok: false,\n        code: 'invalid-input',\n        message: 'Ese cambio de estado no está permitido.',\n      };
    }

    const mutation = buildPersonalPurchaseTransition({
      item,
      toState: input.toState,
      occurredAt: this.now().toISOString(),
      eventId: `pse_${this.id()}`,
      operationId: input.operationId,
    });
    return this.persist(mutation);
  }

  private async persist(\n    mutation: PersonalPurchaseMutation,\n  ): Promise<PersonalShoppingMutationResult> {
    try {
      await this.repository.saveItemsWithEvents([mutation]);
      return { ok: true, code: 'applied', snapshot: await this.snapshot() };
    } catch {
      return {
        ok: false,
        code: 'storage-error',
        message: 'No se pudo guardar el cambio. Probá de nuevo.',
      };
    }
  }
}
