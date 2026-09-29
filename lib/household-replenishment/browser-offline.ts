'use client';

import type { ReplenishmentMutationSuccess, ReplenishmentSnapshot } from './types';
import {
  HouseholdMutationSyncEngine,
  type HouseholdMutation,
  type HouseholdMutationFlushResult,
  type HouseholdMutationOutboxStore,
  type HouseholdMutationSyncAck,
  type HouseholdMutationTransport,
  type PendingHouseholdMutation,
} from './offline-sync';

const DATABASE_NAME = 'vida-2-household-replenishment';
const DATABASE_VERSION = 1;
const OUTBOX_STORE = 'outbox';
const SNAPSHOT_STORE = 'snapshots';
const PRIMARY_SNAPSHOT_KEY = 'primary-household';

type SnapshotRecord = {
  key: string;
  snapshot: ReplenishmentSnapshot;
  savedAt: string;
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB transaction aborted')),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB transaction failed')),
      { once: true },
    );
  });
}

function sameMutation(left: HouseholdMutation, right: HouseholdMutation): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function openHouseholdReplenishmentDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.addEventListener(
      'upgradeneeded',
      () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
          const outbox = database.createObjectStore(OUTBOX_STORE, {
            keyPath: 'operationId',
          });
          outbox.createIndex('by-enqueued-at', 'enqueuedAt');
        }
        if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
          database.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' });
        }
      },
      { once: true },
    );

    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

export class IndexedDbHouseholdMutationOutboxStore implements HouseholdMutationOutboxStore {
  async persistMutation(
    mutation: HouseholdMutation,
    enqueuedAt: string = new Date().toISOString(),
  ): Promise<void> {
    const database = await openHouseholdReplenishmentDatabase();
    const transaction = database.transaction(OUTBOX_STORE, 'readwrite');
    const outbox = transaction.objectStore(OUTBOX_STORE);

    try {
      const existing = (await requestResult(outbox.get(mutation.operationId))) as
        PendingHouseholdMutation | undefined;

      if (existing) {
        if (sameMutation(existing.mutation, mutation)) {
          await transactionDone(transaction);
          return;
        }
        transaction.abort();
        throw new Error('Household mutation operation conflict');
      }

      outbox.add({
        operationId: mutation.operationId,
        mutation,
        enqueuedAt,
      } satisfies PendingHouseholdMutation);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }

  async listPendingMutations(): Promise<PendingHouseholdMutation[]> {
    const database = await openHouseholdReplenishmentDatabase();
    const transaction = database.transaction(OUTBOX_STORE, 'readonly');

    try {
      const pending = (await requestResult(
        transaction.objectStore(OUTBOX_STORE).getAll(),
      )) as PendingHouseholdMutation[];
      await transactionDone(transaction);
      return pending.sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));
    } finally {
      database.close();
    }
  }

  async markMutationSynced(operationId: string): Promise<void> {
    const database = await openHouseholdReplenishmentDatabase();
    const transaction = database.transaction(OUTBOX_STORE, 'readwrite');

    try {
      transaction.objectStore(OUTBOX_STORE).delete(operationId);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }

  async saveSnapshot(snapshot: ReplenishmentSnapshot): Promise<void> {
    const database = await openHouseholdReplenishmentDatabase();
    const transaction = database.transaction(SNAPSHOT_STORE, 'readwrite');

    try {
      transaction.objectStore(SNAPSHOT_STORE).put({
        key: PRIMARY_SNAPSHOT_KEY,
        snapshot,
        savedAt: new Date().toISOString(),
      } satisfies SnapshotRecord);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }

  async loadSnapshot(): Promise<ReplenishmentSnapshot | null> {
    const database = await openHouseholdReplenishmentDatabase();
    const transaction = database.transaction(SNAPSHOT_STORE, 'readonly');

    try {
      const record = (await requestResult(
        transaction.objectStore(SNAPSHOT_STORE).get(PRIMARY_SNAPSHOT_KEY),
      )) as SnapshotRecord | undefined;
      await transactionDone(transaction);
      return record?.snapshot ?? null;
    } finally {
      database.close();
    }
  }
}

export class HttpHouseholdMutationTransport implements HouseholdMutationTransport {
  async sendMutation(mutation: HouseholdMutation): Promise<HouseholdMutationSyncAck> {
    const response = await fetch('/api/household-replenishment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutation),
    });

    const data = (await response.json()) as Partial<ReplenishmentMutationSuccess> & {
      error?: unknown;
    };

    if (!response.ok || data.ok !== true || !data.snapshot || !data.code) {
      return {
        operationId: mutation.operationId,
        status: 'conflict',
      };
    }

    return {
      operationId: mutation.operationId,
      status: data.code === 'applied' ? 'accepted' : 'duplicate',
      code: data.code,
      snapshot: data.snapshot,
    };
  }
}

export async function fetchCanonicalHouseholdSnapshot(): Promise<ReplenishmentSnapshot | null> {
  const response = await fetch('/api/household-replenishment', {
    method: 'GET',
    cache: 'no-store',
  });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    ok?: unknown;
    snapshot?: ReplenishmentSnapshot;
  };
  return data.ok === true && data.snapshot ? data.snapshot : null;
}

export interface BrowserOnlineSource {
  addEventListener(type: 'online', listener: () => void): void;
  removeEventListener(type: 'online', listener: () => void): void;
}

export interface HouseholdReconnectController {
  flushNow(): Promise<HouseholdMutationFlushResult>;
  dispose(): void;
}

export function attachHouseholdReconnectSync(
  store: HouseholdMutationOutboxStore,
  transport: HouseholdMutationTransport,
  onFlush?: (result: HouseholdMutationFlushResult) => void,
  source: BrowserOnlineSource = window,
  isOnline: () => boolean = () => navigator.onLine,
): HouseholdReconnectController {
  const engine = new HouseholdMutationSyncEngine(store, transport);

  const flushNow = async () => {
    const result = await engine.flush();
    onFlush?.(result);
    return result;
  };

  const onOnline = () => {
    void flushNow();
  };

  source.addEventListener('online', onOnline);

  if (isOnline()) {
    void flushNow();
  }

  return {
    flushNow,
    dispose() {
      source.removeEventListener('online', onOnline);
    },
  };
}
