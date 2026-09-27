'use client';

import type {
  AttemptOutboxStore,
  PendingStudyAttempt,
  StudyAttemptEvent,
} from './attempt-store';

const DATABASE_NAME = 'vida-2-study-engine';
const DATABASE_VERSION = 1;
const ATTEMPTS_STORE = 'attempts';
const OUTBOX_STORE = 'outbox';
const DEVICE_ID_KEY = 'vida2.study-engine.device-id';

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

function sameAttempt(left: StudyAttemptEvent, right: StudyAttemptEvent): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function openStudyEngineDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.addEventListener(
      'upgradeneeded',
      () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ATTEMPTS_STORE)) {
          database.createObjectStore(ATTEMPTS_STORE, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
          const outbox = database.createObjectStore(OUTBOX_STORE, {
            keyPath: 'idempotencyKey',
          });
          outbox.createIndex('by-enqueued-at', 'enqueuedAt');
        }
      },
      { once: true },
    );

    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

export function getOrCreateStudyDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export class IndexedDbAttemptOutboxStore implements AttemptOutboxStore {
  async persistAttempt(attempt: StudyAttemptEvent): Promise<void> {
    const database = await openStudyEngineDatabase();
    const transaction = database.transaction(
      [ATTEMPTS_STORE, OUTBOX_STORE],
      'readwrite',
    );
    const attempts = transaction.objectStore(ATTEMPTS_STORE);
    const outbox = transaction.objectStore(OUTBOX_STORE);

    try {
      const [existingAttempt, existingPending] = await Promise.all([
        requestResult(attempts.get(attempt.id)) as Promise<StudyAttemptEvent | undefined>,
        requestResult(outbox.get(attempt.idempotencyKey)) as Promise<PendingStudyAttempt | undefined>,
      ]);

      if (existingAttempt || existingPending) {
        if (
          existingAttempt &&
          existingPending?.attemptId === attempt.id &&
          sameAttempt(existingAttempt, attempt)
        ) {
          await transactionDone(transaction);
          return;
        }

        transaction.abort();
        throw new Error('Attempt id/idempotency conflict');
      }

      attempts.add(attempt);
      outbox.add({
        idempotencyKey: attempt.idempotencyKey,
        attemptId: attempt.id,
        enqueuedAt: attempt.answeredAt,
      } satisfies PendingStudyAttempt);

      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }

  async listAttempts(): Promise<StudyAttemptEvent[]> {
    const database = await openStudyEngineDatabase();
    const transaction = database.transaction(ATTEMPTS_STORE, 'readonly');

    try {
      const attempts = (await requestResult(
        transaction.objectStore(ATTEMPTS_STORE).getAll(),
      )) as StudyAttemptEvent[];
      await transactionDone(transaction);
      return attempts.sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
    } finally {
      database.close();
    }
  }

  async listPendingAttempts(): Promise<StudyAttemptEvent[]> {
    const database = await openStudyEngineDatabase();
    const transaction = database.transaction(
      [ATTEMPTS_STORE, OUTBOX_STORE],
      'readonly',
    );

    try {
      const [attempts, pending] = await Promise.all([
        requestResult(transaction.objectStore(ATTEMPTS_STORE).getAll()) as Promise<
          StudyAttemptEvent[]
        >,
        requestResult(transaction.objectStore(OUTBOX_STORE).getAll()) as Promise<
          PendingStudyAttempt[]
        >,
      ]);
      await transactionDone(transaction);

      const byId = new Map(attempts.map((attempt) => [attempt.id, attempt]));
      return pending
        .sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt))
        .map((entry) => byId.get(entry.attemptId))
        .filter((attempt): attempt is StudyAttemptEvent => Boolean(attempt));
    } finally {
      database.close();
    }
  }

  async markAttemptSynced(idempotencyKey: string): Promise<void> {
    const database = await openStudyEngineDatabase();
    const transaction = database.transaction(OUTBOX_STORE, 'readwrite');

    try {
      transaction.objectStore(OUTBOX_STORE).delete(idempotencyKey);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }
}
