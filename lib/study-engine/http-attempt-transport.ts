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

function browserFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input, init);
}

function resolveAttemptEndpoint(): string {
  if (typeof globalThis.location?.origin === 'string' && globalThis.location.origin) {
    return new URL('/api/study-engine/v1/attempts', globalThis.location.origin).toString();
  }

  return '/api/study-engine/v1/attempts';
}

export class HttpStudyAttemptTransport implements StudyAttemptTransport {
  private lastFailure: StudyTransportFailure | null = null;

  constructor(private readonly fetchImpl: StudyHttpFetch = browserFetch) {}

  getLastFailure(): StudyTransportFailure | null {
    return this.lastFailure;
  }

  async sendAttempt(attempt: StudyAttemptEvent): Promise<StudyAttemptSyncAck> {
    this.lastFailure = null;

    let response: Response;
    try {
      response = await this.fetchImpl(resolveAttemptEndpoint(), {
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
