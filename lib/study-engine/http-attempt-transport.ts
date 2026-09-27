import type { StudyAttemptEvent } from './attempt-store';
import type { StudyAttemptSyncAck, StudyAttemptTransport } from './sync-engine';

export type StudyHttpFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function parseAck(value: unknown, expectedKey: string): StudyAttemptSyncAck | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.idempotencyKey !== expectedKey ||
    (record.status !== 'accepted' && record.status !== 'duplicate' && record.status !== 'conflict')
  ) {
    return null;
  }

  return {
    idempotencyKey: expectedKey,
    status: record.status,
  };
}

export class HttpStudyAttemptTransport implements StudyAttemptTransport {
  constructor(private readonly fetchImpl: StudyHttpFetch = fetch) {}

  async sendAttempt(attempt: StudyAttemptEvent): Promise<StudyAttemptSyncAck> {
    const response = await this.fetchImpl('/api/study-engine/v1/attempts', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': attempt.idempotencyKey,
      },
      body: JSON.stringify({ attempt }),
    });

    if (response.status !== 200 && response.status !== 409) {
      throw new Error('study-attempt-sync-unavailable');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error('study-attempt-sync-unavailable');
    }

    const ack = parseAck(body, attempt.idempotencyKey);
    if (!ack) throw new Error('study-attempt-sync-unavailable');
    if (response.status === 409 && ack.status !== 'conflict') {
      throw new Error('study-attempt-sync-unavailable');
    }
    if (response.status === 200 && ack.status === 'conflict') {
      throw new Error('study-attempt-sync-unavailable');
    }
    return ack;
  }
}
