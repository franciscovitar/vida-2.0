import type { AttemptOutboxStore, StudyAttemptEvent } from './attempt-store';

export type StudyAttemptSyncStatus = 'accepted' | 'duplicate' | 'conflict';

export interface StudyAttemptSyncAck {
  idempotencyKey: string;
  status: StudyAttemptSyncStatus;
}

export interface StudyAttemptTransport {
  sendAttempt(attempt: StudyAttemptEvent): Promise<StudyAttemptSyncAck>;
}

export interface StudyAttemptFlushResult {
  attempted: number;
  acknowledged: number;
  remaining: number;
  stoppedOn: 'none' | 'transport-error' | 'conflict';
}

async function pendingCount(store: AttemptOutboxStore): Promise<number> {
  return (await store.listPendingAttempts()).length;
}

export class StudyAttemptSyncEngine {
  private activeFlush: Promise<StudyAttemptFlushResult> | null = null;

  constructor(
    private readonly store: AttemptOutboxStore,
    private readonly transport: StudyAttemptTransport,
  ) {}

  flush(): Promise<StudyAttemptFlushResult> {
    if (this.activeFlush) return this.activeFlush;

    this.activeFlush = this.flushOnce().finally(() => {
      this.activeFlush = null;
    });

    return this.activeFlush;
  }

  private async flushOnce(): Promise<StudyAttemptFlushResult> {
    const pending = await this.store.listPendingAttempts();
    let attempted = 0;
    let acknowledged = 0;

    for (const attempt of pending) {
      attempted += 1;

      let ack: StudyAttemptSyncAck;
      try {
        ack = await this.transport.sendAttempt(attempt);
      } catch {
        return {
          attempted,
          acknowledged,
          remaining: await pendingCount(this.store),
          stoppedOn: 'transport-error',
        };
      }

      if (ack.idempotencyKey !== attempt.idempotencyKey || ack.status === 'conflict') {
        return {
          attempted,
          acknowledged,
          remaining: await pendingCount(this.store),
          stoppedOn: 'conflict',
        };
      }

      await this.store.markAttemptSynced(attempt.idempotencyKey);
      acknowledged += 1;
    }

    return {
      attempted,
      acknowledged,
      remaining: await pendingCount(this.store),
      stoppedOn: 'none',
    };
  }
}
