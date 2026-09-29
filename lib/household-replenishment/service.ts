import { randomUUID } from 'node:crypto';

import { normalizeCategoryOrder, sanitizeCategory, sortReplenishmentEntries } from './categories';
import { estimateCadence } from './engine';
import { projectNeedListState, type AutomaticListReason } from './list-projection';
import { evaluatePredictionQuality } from './quality';
import type { ReplenishmentRepository } from './repository';
import type {
  CorrectionEvent,
  ProductVariant,
  PurchaseEvent,
  ReplenishmentListEntry,
  ReplenishmentMutationResult,
  ReplenishmentSnapshot,
  ShoppingListItem,
  ShoppingListOrigin,
  UserCorrectionType,
} from './types';

type ServiceDeps = {
  now?: () => Date;
  id?: () => string;
};

function normalizeNeedName(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeVariantName(value: string): string {
  return normalizeNeedName(value);
}

function latestPurchase(events: PurchaseEvent[]): PurchaseEvent | null {
  return [...events].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))[0] ?? null;
}

function reasonForDecision(
  reason: AutomaticListReason,
  expectedIntervalDays: number | null,
): string {
  if (reason === 'CORRECTION_LOW') return 'Marcaste que queda poco';
  if (reason === 'CORRECTION_OUT') return 'Marcaste que se terminó';
  if (reason === 'AUTO_WATCH') {
    return expectedIntervalDays
      ? `Podría tocar pronto · ~${Math.round(expectedIntervalDays)} días`
      : 'Podría tocar pronto';
  }
  if (reason === 'AUTO_DUE') {
    return expectedIntervalDays
      ? `Cadencia estimada: ~${Math.round(expectedIntervalDays)} días`
      : 'Reposición estimada';
  }
  return 'Marcado para comprar';
}

export class ReplenishmentService {
  private readonly now: () => Date;
  private readonly id: () => string;

  constructor(
    private readonly repository: ReplenishmentRepository,
    deps: ServiceDeps = {},
  ) {
    this.now = deps.now ?? (() => new Date());
    this.id = deps.id ?? randomUUID;
  }

  async addManualNeed(input: {
    householdId: string;
    name: string;
    category?: string;
    seedIntervalDays?: number | null;
    operationId: string;
    principalId: string;
  }): Promise<ReplenishmentMutationResult> {
    if (await this.repository.hasOperation(input.householdId, input.operationId)) {
      return {
        ok: true,
        code: 'idempotent',
        snapshot: await this.snapshot(input.householdId),
      };
    }

    const household = await this.repository.getHousehold(input.householdId);
    const trimmedName = input.name.trim();
    if (!household || trimmedName.length === 0 || trimmedName.length > 80) {
      return { ok: false, code: 'invalid-input', message: 'No se pudo agregar ese producto.' };
    }

    const requestedCategory = input.category == null ? null : sanitizeCategory(input.category);

    const seed =
      input.seedIntervalDays == null
        ? null
        : Number.isFinite(input.seedIntervalDays) &&
            input.seedIntervalDays >= 1 &&
            input.seedIntervalDays <= 365
          ? input.seedIntervalDays
          : null;

    let need = await this.repository.findNeedByName(
      input.householdId,
      normalizeNeedName(trimmedName),
    );
    const timestamp = this.now().toISOString();

    if (!need) {
      need = {
        id: this.id(),
        householdId: input.householdId,
        name: trimmedName,
        category: requestedCategory ?? 'Otros',
        manualSeedIntervalDays: seed,
        active: true,
        createdAt: timestamp,
      };
      await this.repository.putNeed(need);
    } else {
      const nextNeed = {
        ...need,
        category: requestedCategory ?? need.category,
        manualSeedIntervalDays:
          need.manualSeedIntervalDays == null && seed != null ? seed : need.manualSeedIntervalDays,
      };
      if (
        nextNeed.category !== need.category ||
        nextNeed.manualSeedIntervalDays !== need.manualSeedIntervalDays
      ) {
        need = nextNeed;
        await this.repository.putNeed(need);
      }
    }

    const items = await this.repository.listShoppingItems(input.householdId);
    const activeItem = items.find((item) => item.needId === need.id && item.state === 'ACTIVE');
    if (activeItem) {
      await this.repository.recordOperation(input.householdId, input.operationId);
      return {
        ok: true,
        code: 'existing',
        snapshot: await this.snapshot(input.householdId),
      };
    }

    const item: ShoppingListItem = {
      id: this.id(),
      householdId: input.householdId,
      needId: need.id,
      origin: 'MANUAL',
      state: 'ACTIVE',
      addedAt: timestamp,
      operationId: input.operationId,
    };
    await this.repository.putShoppingItem(item);

    const correction: CorrectionEvent = {
      id: this.id(),
      householdId: input.householdId,
      needId: need.id,
      type: 'MANUAL_ADD',
      occurredAt: timestamp,
      createdBy: input.principalId,
      operationId: input.operationId,
    };
    await this.repository.appendCorrectionEvent(correction);
    await this.repository.recordOperation(input.householdId, input.operationId);

    return { ok: true, code: 'applied', snapshot: await this.snapshot(input.householdId) };
  }

  async updateNeedCategory(input: {
    householdId: string;
    needId: string;
    category: string;
    operationId: string;
  }): Promise<ReplenishmentMutationResult> {
    if (await this.repository.hasOperation(input.householdId, input.operationId)) {
      return {
        ok: true,
        code: 'idempotent',
        snapshot: await this.snapshot(input.householdId),
      };
    }

    const need = await this.repository.getNeed(input.householdId, input.needId);
    if (!need) {
      return { ok: false, code: 'not-found', message: 'Ese producto ya no está disponible.' };
    }

    const category = sanitizeCategory(input.category);
    if (!category || category.length > 60) {
      return { ok: false, code: 'invalid-input', message: 'La categoría no es válida.' };
    }

    await this.repository.putNeed({ ...need, category });
    await this.repository.recordOperation(input.householdId, input.operationId);
    return { ok: true, code: 'applied', snapshot: await this.snapshot(input.householdId) };
  }

  async updateShoppingPreferences(input: {
    householdId: string;
    defaultStore: string | null;
    categoryOrder: string[];
    operationId: string;
  }): Promise<ReplenishmentMutationResult> {
    if (await this.repository.hasOperation(input.householdId, input.operationId)) {
      return {
        ok: true,
        code: 'idempotent',
        snapshot: await this.snapshot(input.householdId),
      };
    }

    const household = await this.repository.getHousehold(input.householdId);
    if (!household) {
      return { ok: false, code: 'not-found', message: 'No se encontró el hogar.' };
    }

    const defaultStore = input.defaultStore?.trim() || null;
    if (defaultStore && defaultStore.length > 80) {
      return { ok: false, code: 'invalid-input', message: 'El supermercado es demasiado largo.' };
    }

    if (!Array.isArray(input.categoryOrder) || input.categoryOrder.length > 30) {
      return { ok: false, code: 'invalid-input', message: 'El orden de categorías no es válido.' };
    }

    const needs = await this.repository.listNeeds(input.householdId);
    const categoryOrder = normalizeCategoryOrder(
      input.categoryOrder,
      needs.map((need) => need.category),
    );

    await this.repository.putHousehold({
      ...household,
      defaultStore,
      categoryOrder,
    });
    await this.repository.recordOperation(input.householdId, input.operationId);
    return { ok: true, code: 'applied', snapshot: await this.snapshot(input.householdId) };
  }

  async markBought(input: {
    householdId: string;
    needId: string;
    variantName?: string | null;
    operationId: string;
    principalId: string;
  }): Promise<ReplenishmentMutationResult> {
    if (await this.repository.hasOperation(input.householdId, input.operationId)) {
      return {
        ok: true,
        code: 'idempotent',
        snapshot: await this.snapshot(input.householdId),
      };
    }

    const need = await this.repository.getNeed(input.householdId, input.needId);
    if (!need) {
      return { ok: false, code: 'not-found', message: 'Ese producto ya no está disponible.' };
    }

    const currentSnapshot = await this.snapshot(input.householdId);
    if (!currentSnapshot.buy.some((entry) => entry.needId === need.id)) {
      await this.repository.recordOperation(input.householdId, input.operationId);
      return { ok: true, code: 'existing', snapshot: currentSnapshot };
    }

    const trimmedVariantName = input.variantName?.trim() ?? '';
    if (trimmedVariantName.length > 100) {
      return { ok: false, code: 'invalid-input', message: 'La variante es demasiado larga.' };
    }

    let variantId: string | null = null;
    if (trimmedVariantName) {
      let variant = await this.repository.findVariantByName(
        input.householdId,
        need.id,
        normalizeVariantName(trimmedVariantName),
      );

      if (!variant) {
        const existingVariants = await this.repository.listVariants(input.householdId, need.id);
        variant = {
          id: this.id(),
          needId: need.id,
          name: trimmedVariantName,
          brand: null,
          gtin: null,
          packSize: null,
          unit: null,
          preferred: existingVariants.length === 0,
        } satisfies ProductVariant;
        await this.repository.putVariant(input.householdId, variant);
      }

      variantId = variant.id;
    }

    const items = await this.repository.listShoppingItems(input.householdId);
    const activeItems = items.filter((item) => item.needId === need.id && item.state === 'ACTIVE');
    const source: ShoppingListOrigin = activeItems[0]?.origin ?? 'AUTO';

    for (const item of activeItems) {
      await this.repository.putShoppingItem({ ...item, state: 'BOUGHT' });
    }

    const timestamp = this.now().toISOString();
    await this.repository.appendPurchaseEvent({
      id: this.id(),
      householdId: input.householdId,
      needId: need.id,
      variantId,
      purchasedAt: timestamp,
      source,
      createdBy: input.principalId,
      operationId: input.operationId,
    });
    await this.repository.recordOperation(input.householdId, input.operationId);

    return { ok: true, code: 'applied', snapshot: await this.snapshot(input.householdId) };
  }

  async correctNeed(input: {
    householdId: string;
    needId: string;
    type: UserCorrectionType;
    operationId: string;
    principalId: string;
  }): Promise<ReplenishmentMutationResult> {
    if (await this.repository.hasOperation(input.householdId, input.operationId)) {
      return {
        ok: true,
        code: 'idempotent',
        snapshot: await this.snapshot(input.householdId),
      };
    }

    const need = await this.repository.getNeed(input.householdId, input.needId);
    if (!need) {
      return { ok: false, code: 'not-found', message: 'Ese producto ya no está disponible.' };
    }

    const timestamp = this.now().toISOString();
    await this.repository.appendCorrectionEvent({
      id: this.id(),
      householdId: input.householdId,
      needId: need.id,
      type: input.type,
      occurredAt: timestamp,
      createdBy: input.principalId,
      operationId: input.operationId,
    });

    if (input.type === 'STILL_HAVE') {
      const items = await this.repository.listShoppingItems(input.householdId);
      for (const item of items) {
        if (item.needId === need.id && item.state === 'ACTIVE') {
          await this.repository.putShoppingItem({ ...item, state: 'SNOOZED' });
        }
      }
    }

    await this.repository.recordOperation(input.householdId, input.operationId);
    return { ok: true, code: 'applied', snapshot: await this.snapshot(input.householdId) };
  }

  async snapshot(householdId: string): Promise<ReplenishmentSnapshot> {
    const household = await this.repository.getHousehold(householdId);
    if (!household) {
      return {
        householdName: 'Lista de casa',
        shoppingPreferences: {
          defaultStore: null,
          categoryOrder: normalizeCategoryOrder([]),
        },
        quality: evaluatePredictionQuality({
          needs: [],
          purchases: [],
          corrections: [],
        }),
        buy: [],
        watch: [],
      };
    }

    const [needs, variants, items, purchases, corrections] = await Promise.all([
      this.repository.listNeeds(householdId),
      this.repository.listVariants(householdId),
      this.repository.listShoppingItems(householdId),
      this.repository.listPurchaseEvents(householdId),
      this.repository.listCorrectionEvents(householdId),
    ]);
    const now = this.now();
    const categoryOrder = normalizeCategoryOrder(
      household.categoryOrder,
      needs.map((need) => need.category),
    );
    const quality = evaluatePredictionQuality({
      needs,
      purchases,
      corrections,
    });
    const buy: ReplenishmentListEntry[] = [];
    const watch: ReplenishmentListEntry[] = [];

    for (const need of needs.filter((candidate) => candidate.active)) {
      const needPurchases = purchases.filter((event) => event.needId === need.id);
      const needCorrections = corrections.filter((event) => event.needId === need.id);
      const estimate = estimateCadence({
        need,
        purchases: needPurchases,
        corrections: needCorrections,
        now,
      });
      const activeItem = items.find((item) => item.needId === need.id && item.state === 'ACTIVE');
      const needVariants = variants
        .filter((variant) => variant.needId === need.id)
        .sort(
          (a, b) => Number(b.preferred) - Number(a.preferred) || a.name.localeCompare(b.name, 'es'),
        );
      const lastPurchase = latestPurchase(needPurchases);
      const lastVariant =
        lastPurchase?.variantId == null
          ? null
          : (needVariants.find((variant) => variant.id === lastPurchase.variantId) ?? null);
      const variantFields = {
        lastPurchasedAt: lastPurchase?.purchasedAt ?? null,
        lastPurchasedVariantId: lastVariant?.id ?? null,
        lastPurchasedVariantName: lastVariant?.name ?? null,
        variants: needVariants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          preferred: variant.preferred,
        })),
      };

      const decision = projectNeedListState({
        activeItem: activeItem ?? null,
        estimate,
      });

      if (decision.bucket === 'BUY' && decision.origin) {
        buy.push({
          needId: need.id,
          name: need.name,
          category: need.category,
          origin: decision.origin,
          confidence: estimate.confidence,
          reason:
            decision.reason === 'ACTIVE_ITEM' && activeItem?.origin === 'MANUAL'
              ? 'Agregado manualmente'
              : reasonForDecision(decision.reason, estimate.expectedIntervalDays),
          expectedIntervalDays: estimate.expectedIntervalDays,
          nextExpectedAt: estimate.nextExpectedAt,
          ...variantFields,
        });
      } else if (decision.bucket === 'WATCH' && decision.origin) {
        watch.push({
          needId: need.id,
          name: need.name,
          category: need.category,
          origin: decision.origin,
          confidence: estimate.confidence,
          reason: reasonForDecision(decision.reason, estimate.expectedIntervalDays),
          expectedIntervalDays: estimate.expectedIntervalDays,
          nextExpectedAt: estimate.nextExpectedAt,
          ...variantFields,
        });
      }
    }

    return {
      householdName: household.name,
      shoppingPreferences: {
        defaultStore: household.defaultStore ?? null,
        categoryOrder,
      },
      quality,
      buy: sortReplenishmentEntries(buy, categoryOrder),
      watch: sortReplenishmentEntries(watch, categoryOrder),
    };
  }
}
