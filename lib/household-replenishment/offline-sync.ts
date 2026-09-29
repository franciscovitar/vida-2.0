import type { ReplenishmentMutationCode, ReplenishmentSnapshot, UserCorrectionType } from './types';

export type HouseholdMutation =
  | {
      action: 'add';
      name: string;
      category: string;
      seedIntervalDays: number | null;
      operationId: string;
    }
  | {
      action: 'add-existing';
      needId: string;
      operationId: string;
    }
  | {
      action: 'remove-from-list';
      needId: string;
      operationId: string;
    }
  | {
      action: 'categorize';
      needId: string;
      category: string;
      operationId: string;
    }
  | {
      action: 'preferences';
      defaultStore: string | null;
      categoryOrder: string[];
      operationId: string;
    }
  | {
      action: 'bought';
      needId: string;
      variantName: string | null;
      operationId: string;
    }
  | {
      action: 'correct';
      needId: string;
      type: UserCorrectionType;
      operationId: string;
    };

export interface PendingHouseholdMutation {
  operationId: string;
  mutation: HouseholdMutation;
  enqueuedAt: string;
}

export interface HouseholdMutationOutboxStore {
  persistMutation(mutation: HouseholdMutation, enqueuedAt?: string): Promise<void>;
  listPendingMutations(): Promise<PendingHouseholdMutation[]>;
  markMutationSynced(operationId: string): Promise<void>;
}

function sameMutation(left: HouseholdMutation, right: HouseholdMutation): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class MemoryHouseholdMutationOutboxStore implements HouseholdMutationOutboxStore {
  private readonly pending = new Map<string, PendingHouseholdMutation>();

  async persistMutation(
    mutation: HouseholdMutation,
    enqueuedAt: string = new Date().toISOString(),
  ): Promise<void> {
    const existing = this.pending.get(mutation.operationId);
    if (existing) {
      if (sameMutation(existing.mutation, mutation)) return;
      throw new Error('Household mutation operation conflict');
    }

    this.pending.set(mutation.operationId, {
      operationId: mutation.operationId,
      mutation: structuredClone(mutation),
      enqueuedAt,
    });
  }

  async listPendingMutations(): Promise<PendingHouseholdMutation[]> {
    return [...this.pending.values()]
      .map((entry) => structuredClone(entry))
      .sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));
  }

  async markMutationSynced(operationId: string): Promise<void> {
    this.pending.delete(operationId);
  }
}

export type HouseholdMutationSyncStatus = 'accepted' | 'duplicate' | 'conflict';

export interface HouseholdMutationSyncAck {
  operationId: string;
  status: HouseholdMutationSyncStatus;
  code?: ReplenishmentMutationCode;
  snapshot?: ReplenishmentSnapshot;
}

export interface HouseholdMutationTransport {
  sendMutation(mutation: HouseholdMutation): Promise<HouseholdMutationSyncAck>;
}

export interface HouseholdMutationFlushResult {
  attempted: number;
  acknowledged: number;
  remaining: number;
  stoppedOn: 'none' | 'transport-error' | 'conflict';
  snapshot: ReplenishmentSnapshot | null;
}

async function pendingCount(store: HouseholdMutationOutboxStore): Promise<number> {
  return (await store.listPendingMutations()).length;
}

export class HouseholdMutationSyncEngine {
  private activeFlush: Promise<HouseholdMutationFlushResult> | null = null;

  constructor(
    private readonly store: HouseholdMutationOutboxStore,
    private readonly transport: HouseholdMutationTransport,
  ) {}

  flush(): Promise<HouseholdMutationFlushResult> {
    if (this.activeFlush) return this.activeFlush;

    this.activeFlush = this.flushOnce().finally(() => {
      this.activeFlush = null;
    });

    return this.activeFlush;
  }

  private async flushOnce(): Promise<HouseholdMutationFlushResult> {
    const pending = await this.store.listPendingMutations();
    let attempted = 0;
    let acknowledged = 0;
    let latestSnapshot: ReplenishmentSnapshot | null = null;

    for (const entry of pending) {
      attempted += 1;

      let ack: HouseholdMutationSyncAck;
      try {
        ack = await this.transport.sendMutation(entry.mutation);
      } catch {
        return {
          attempted,
          acknowledged,
          remaining: await pendingCount(this.store),
          stoppedOn: 'transport-error',
          snapshot: latestSnapshot,
        };
      }

      if (ack.operationId !== entry.operationId || ack.status === 'conflict') {
        return {
          attempted,
          acknowledged,
          remaining: await pendingCount(this.store),
          stoppedOn: 'conflict',
          snapshot: latestSnapshot,
        };
      }

      await this.store.markMutationSynced(entry.operationId);
      acknowledged += 1;
      if (ack.snapshot) latestSnapshot = ack.snapshot;
    }

    return {
      attempted,
      acknowledged,
      remaining: await pendingCount(this.store),
      stoppedOn: 'none',
      snapshot: latestSnapshot,
    };
  }
}

function findEntry(snapshot: ReplenishmentSnapshot, needId: string) {
  return (
    snapshot.buy.find((entry) => entry.needId === needId) ??
    snapshot.watch.find((entry) => entry.needId === needId) ??
    null
  );
}

export function applyOptimisticHouseholdMutation(
  snapshot: ReplenishmentSnapshot,
  mutation: HouseholdMutation,
): ReplenishmentSnapshot {
  if (mutation.action === 'add') {
    return structuredClone(snapshot);
  }

  if (mutation.action === 'add-existing') {
    const catalogEntry = snapshot.catalog.find((entry) => entry.needId === mutation.needId);
    if (!catalogEntry) return structuredClone(snapshot);

    const buyEntry = {
      needId: catalogEntry.needId,
      name: catalogEntry.name,
      category: catalogEntry.category,
      origin: 'MANUAL' as const,
      confidence: catalogEntry.confidence,
      reason: 'Lo agregaste vos · pendiente de sincronizar',
      expectedIntervalDays: catalogEntry.expectedIntervalDays,
      nextExpectedAt: catalogEntry.nextExpectedAt,
      lastPurchasedAt: catalogEntry.lastPurchasedAt,
      lastPurchasedVariantId: catalogEntry.lastPurchasedVariantId,
      lastPurchasedVariantName: catalogEntry.lastPurchasedVariantName,
      variants: structuredClone(catalogEntry.variants),
    };

    return {
      ...structuredClone(snapshot),
      catalog: snapshot.catalog.map((entry) =>
        entry.needId === mutation.needId ? { ...entry, status: 'BUY' as const } : entry,
      ),
      buy: snapshot.buy.some((entry) => entry.needId === mutation.needId)
        ? structuredClone(snapshot.buy)
        : [...structuredClone(snapshot.buy), buyEntry],
      watch: snapshot.watch.filter((entry) => entry.needId !== mutation.needId),
    };
  }

  if (mutation.action === 'remove-from-list') {
    return {
      ...structuredClone(snapshot),
      catalog: snapshot.catalog.map((entry) =>
        entry.needId === mutation.needId ? { ...entry, status: 'IDLE' as const } : entry,
      ),
      buy: snapshot.buy.filter((entry) => entry.needId !== mutation.needId),
      watch: snapshot.watch.filter((entry) => entry.needId !== mutation.needId),
    };
  }

  if (mutation.action === 'preferences') {
    return {
      ...structuredClone(snapshot),
      shoppingPreferences: {
        defaultStore: mutation.defaultStore,
        categoryOrder: [...mutation.categoryOrder],
      },
    };
  }

  if (mutation.action === 'categorize') {
    const update = (entries: ReplenishmentSnapshot['buy']) =>
      entries.map((entry) =>
        entry.needId === mutation.needId ? { ...entry, category: mutation.category } : entry,
      );
    return {
      ...structuredClone(snapshot),
      catalog: snapshot.catalog.map((entry) =>
        entry.needId === mutation.needId ? { ...entry, category: mutation.category } : entry,
      ),
      buy: update(snapshot.buy),
      watch: update(snapshot.watch),
    };
  }

  if (
    mutation.action === 'bought' ||
    (mutation.action === 'correct' && mutation.type === 'STILL_HAVE')
  ) {
    return {
      ...structuredClone(snapshot),
      catalog: snapshot.catalog.map((entry) =>
        entry.needId === mutation.needId ? { ...entry, status: 'IDLE' as const } : entry,
      ),
      buy: snapshot.buy.filter((entry) => entry.needId !== mutation.needId),
      watch: snapshot.watch.filter((entry) => entry.needId !== mutation.needId),
    };
  }

  const entry = findEntry(snapshot, mutation.needId);
  if (!entry) return structuredClone(snapshot);

  const promoted = {
    ...structuredClone(entry),
    origin: 'CORRECTION' as const,
    reason:
      mutation.type === 'LOW'
        ? 'Queda poco · pendiente de sincronizar'
        : 'Sin stock · pendiente de sincronizar',
  };

  return {
    ...structuredClone(snapshot),
    catalog: snapshot.catalog.map((candidate) =>
      candidate.needId === mutation.needId ? { ...candidate, status: 'BUY' as const } : candidate,
    ),
    buy: [...snapshot.buy.filter((candidate) => candidate.needId !== mutation.needId), promoted],
    watch: snapshot.watch.filter((candidate) => candidate.needId !== mutation.needId),
  };
}
