import type { StudyAttemptEvent } from './attempt-store';
import type { StudyAttemptSyncAck, StudyAttemptTransport } from './sync-engine';

export type StudyHttpFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type StudyTransportFailure = 'red' | 'sesión' | 'servidor' | 'respuesta inválida' | 'http';

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
  private lastFailure: StudyTransportFailure | null = null;

  constructor(private readonly fetchImpl: StudyHttpFetch = fetch) {}

  getLastFailure(): StudyTransportFailure | null {
    return this.lastFailure;
  }

  async sendAttempt(attempt: StudyAttemptEvent): Promise<StudyAttemptSyncAck> {
    this.lastFailure = null;

    let response: Response;
    try {
      response = await this.fetchImpl('/api/study-engine/v1/attempts', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': attempt.idempotencyKey,
        },
        body: JSON.stringify({ attempt }),
      });
    } catch {
      this.lastFailure = 'red';
      throw new Error('study-attempt-sync-unavailable');
    }

    if (response.status !== 200 && response.status !== 409) {
      this.lastFailure =
        response.status === 401 ? 'sesión' : response.status === 503 ? 'servidor' : 'http';
      throw new Error('study-attempt-sync-unavailable');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      this.lastFailure = 'respuesta inválida';
      throw new Error('study-attempt-sync-unavailable');
    }

    const ack = parseAck(body, attempt.idempotencyKey);
    if (!ack) {
      this.lastFailure = 'respuesta inválida';
      throw new Error('study-attempt-sync-unavailable');
    }

    if (response.status === 409 && ack.status !== 'conflict') {
      this.lastFailure = 'respuesta inválida';
      throw new Error('study-attempt-sync-unavailable');
    }

    if (response.status === 200 && ack.status === 'conflict') {
      this.lastFailure = 'respuesta inválida';
      throw new Error('study-attempt-sync-unavailable');
    }

    return ack;
  }
}
