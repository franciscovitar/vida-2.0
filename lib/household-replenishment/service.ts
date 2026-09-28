import { randomUUID } from 'node:crypto';

import { estimateCadence } from './engine';
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

function sortEntries(entries: ReplenishmentListEntry[]): ReplenishmentListEntry[] {
  return [...entries].sort(
    (a, b) => a.category.localeCompare(b.category, 'es') || a.name.localeCompare(b.name, 'es'),
  );
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
        category: input.category?.trim() || 'Otros',
        manualSeedIntervalDays: seed,
        active: true,
        createdAt: timestamp,
      };
      await this.repository.putNeed(need);
    } else if (need.manualSeedIntervalDays == null && seed != null) {
      need = { ...need, manualSeedIntervalDays: seed };
      await this.repository.putNeed(need);
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
        const existingVariants = await this.repository.listVariants(
          input.householdId,
          need.id,
        );
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
      return { householdName: 'Lista de casa', buy: [], watch: [] };
    }

    const [needs, variants, items, purchases, corrections] = await Promise.all([
      this.repository.listNeeds(householdId),
      this.repository.listVariants(householdId),
      this.repository.listShoppingItems(householdId),
      this.repository.listPurchaseEvents(householdId),
      this.repository.listCorrectionEvents(householdId),
    ]);
    const now = this.now();
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
          (a, b) =>
            Number(b.preferred) - Number(a.preferred) ||
            a.name.localeCompare(b.name, 'es'),
        );
      const lastPurchase = latestPurchase(needPurchases);
      const lastVariant =
        lastPurchase?.variantId == null
          ? null
          : needVariants.find((variant) => variant.id === lastPurchase.variantId) ?? null;
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

      if (activeItem) {
        buy.push({
          needId: need.id,
          name: need.name,
          category: need.category,
          origin: activeItem.origin,
          confidence: estimate.confidence,
          reason: activeItem.origin === 'MANUAL' ? 'Agregado manualmente' : 'Marcado para comprar',
          expectedIntervalDays: estimate.expectedIntervalDays,
          nextExpectedAt: estimate.nextExpectedAt,
          ...variantFields,
        });
        continue;
      }

      if (estimate.state === 'ADD_TO_LIST' || estimate.state === 'OVERDUE') {
        const forced = estimate.forcedByCorrection;
        buy.push({
          needId: need.id,
          name: need.name,
          category: need.category,
          origin: forced ? 'CORRECTION' : 'AUTO',
          confidence: estimate.confidence,
          reason:
            forced === 'LOW'
              ? 'Marcaste que queda poco'
              : forced === 'OUT'
                ? 'Marcaste que se terminó'
                : estimate.expectedIntervalDays
                  ? `Cadencia estimada: ~${Math.round(estimate.expectedIntervalDays)} días`
                  : 'Reposición estimada',
          expectedIntervalDays: estimate.expectedIntervalDays,
          nextExpectedAt: estimate.nextExpectedAt,
          ...variantFields,
        });
      } else if (estimate.state === 'WATCH') {
        watch.push({
          needId: need.id,
          name: need.name,
          category: need.category,
          origin: 'AUTO',
          confidence: estimate.confidence,
          reason: estimate.expectedIntervalDays
            ? `Podría tocar pronto · ~${Math.round(estimate.expectedIntervalDays)} días`
            : 'Podría tocar pronto',
          expectedIntervalDays: estimate.expectedIntervalDays,
          nextExpectedAt: estimate.nextExpectedAt,
          ...variantFields,
        });
      }
    }

    return {
      householdName: household.name,
      buy: sortEntries(buy),
      watch: sortEntries(watch),
    };
  }
}
