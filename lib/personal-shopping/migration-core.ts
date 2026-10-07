import { createHash } from 'node:crypto';

import { LEGACY_PERSONAL_PURCHASE_SEED } from './migration-seed';
import type {
  PersonalPurchaseEvent,
  PersonalPurchaseItem,
  PersonalPurchaseMutation,
} from './types';

function stableSuffix(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function migrationItemId(sourceRef: string): string {
  return `ps_${stableSuffix(`item:${sourceRef}`)}`;
}

function migrationEventId(sourceRef: string): string {
  return `pse_${stableSuffix(`event:${sourceRef}`)}`;
}

function migrationOperationId(sourceRef: string): string {
  return `migration:${stableSuffix(sourceRef)}`;
}

export interface PersonalShoppingMigrationPlan {
  sourceCounts: Record<'BUY' | 'RESEARCH' | 'REPLENISH', number>;
  toCreate: PersonalPurchaseMutation[];
  skippedSourceRefs: string[];
}

function emptyCounts(): PersonalShoppingMigrationPlan['sourceCounts'] {
  return { BUY: 0, RESEARCH: 0, REPLENISH: 0 };
}

export function buildLegacyPersonalShoppingMigrationPlan(input: {
  existingItems: readonly PersonalPurchaseItem[];
  migratedAt: string;
}): PersonalShoppingMigrationPlan {
  const existingSourceRefs = new Set(
    input.existingItems
      .map((item) => item.sourceRef)
      .filter((value): value is string => Boolean(value)),
  );
  const sourceCounts = emptyCounts();
  const toCreate: PersonalPurchaseMutation[] = [];
  const skippedSourceRefs: string[] = [];

  for (const seed of LEGACY_PERSONAL_PURCHASE_SEED) {
    sourceCounts[seed.state] += 1;

    if (existingSourceRefs.has(seed.sourceRef)) {
      skippedSourceRefs.push(seed.sourceRef);
      continue;
    }

    const item: PersonalPurchaseItem = {
      id: migrationItemId(seed.sourceRef),
      title: seed.title,
      state: seed.state,
      need: null,
      quantityText: null,
      category: null,
      currency: null,
      estimatedPriceMinor: null,
      targetPriceMinor: null,
      purchaseCondition: null,
      notes: seed.notes ?? null,
      candidateLinks: [],
      focus: false,
      createdAt: input.migratedAt,
      updatedAt: input.migratedAt,
      purchasedAt: null,
      discardedAt: null,
      sourceRef: seed.sourceRef,
      financeMovementId: null,
      financeLinkState: 'none',
      recordStatus: 'active',
    };

    const event: PersonalPurchaseEvent = {
      id: migrationEventId(seed.sourceRef),
      itemId: item.id,
      eventType: 'MIGRATED',
      fromState: null,
      toState: seed.state,
      occurredAt: input.migratedAt,
      operationId: migrationOperationId(seed.sourceRef),
      changedFields: {
        source: 'legacy-notion',
        sourceRef: seed.sourceRef,
      },
    };

    toCreate.push({ item, event });
  }

  return { sourceCounts, toCreate, skippedSourceRefs };
}

export function assertLegacyPersonalShoppingSourceShape(plan: PersonalShoppingMigrationPlan): void {
  if (
    plan.sourceCounts.BUY !== 12 ||
    plan.sourceCounts.REPLENISH !== 0 ||
    plan.sourceCounts.RESEARCH !== 19
  ) {
    throw new Error(
      'Legacy Personal Shopping source shape changed; review migration before writing',
    );
  }
}
