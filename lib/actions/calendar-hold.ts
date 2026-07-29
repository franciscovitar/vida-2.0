/**
 * Puerto Calendar hold (Block 3).
 * Constraints: calendario dedicado, visibility private, sin attendees/meet/recurrence/attachments,
 * ownership en extendedProperties.private, eventId real nunca al cliente (solo clave opaca).
 * Provider event ID determinista (multi-instance): sin Maps de proceso.
 * Semántica Google: cancelled tombstones ≠ activos; 404/410 ≠ error genérico.
 * Tests: fake/memory; nunca llaman Google APIs.
 */
import { createHash, createHmac } from 'node:crypto';

import {
  getGoogleCalendarTimezoneForWrites,
  getGoogleCalendarWriteId,
  isWriteActionsEnabled,
} from '@/lib/actions/config';
import { opaqueKey } from '@/lib/actions/opaque';
import type { CalendarHoldCreatePayload } from '@/types/actions';
import type {
  CalendarHoldSnapshot,
  CalendarHoldWritePort,
  OwnershipProof,
} from '@/lib/actions/ports';

export type CalendarHoldInsertInput = {
  calendarId: string;
  title: string;
  start: string;
  end: string;
  note: string | null;
  ownership: OwnershipProof;
  relatedTaskKey: string | null;
  timezone: string;
  /** Deterministic Google custom event id (base32hex). */
  providerEventId?: string;
};

export type CalendarHoldInsertResult =
  { ok: true; providerEventId: string } | { ok: false; message: string };

/** Lookup explícito: active | deleted | absent | unavailable. */
export type CalendarHoldLookupResult =
  | {
      ok: true;
      state: 'active';
      title: string;
      start: string;
      end: string;
      ownership: OwnershipProof | null;
      relatedTaskKey: string | null;
    }
  | {
      ok: true;
      state: 'deleted';
    }
  | {
      ok: true;
      state: 'absent';
    }
  | {
      ok: false;
      code: 'unavailable' | 'not-configured';
      retryable: boolean;
      message: string;
    };

export type CalendarHoldDeleteResult =
  | { ok: true; outcome: 'deleted' | 'already-absent' }
  | { ok: false; code: string; message: string };

export type CalendarHoldApiClient = {
  insertPrivateHold(input: CalendarHoldInsertInput): Promise<CalendarHoldInsertResult>;
  getHoldByProviderId(
    calendarId: string,
    providerEventId: string,
  ): Promise<CalendarHoldLookupResult>;
  deleteHoldByProviderId(
    calendarId: string,
    providerEventId: string,
    ownership: OwnershipProof,
  ): Promise<CalendarHoldDeleteResult>;
  /** Lectura mínima del calendario (calendars.get). */
  getCalendar(calendarId: string): Promise<
    | {
        ok: true;
        id: string;
        primary: boolean;
        timeZone: string | null;
      }
    | { ok: false; message: string }
  >;
};

const BASE32HEX = '0123456789abcdefghijklmnopqrstuv';

const VERIFY_ABSENT_DELAYS_MS = [0, 150, 400, 900] as const;

/** Google custom event id: base32hex lowercase, length 5–1024. */
export function toBase32Hex(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32HEX[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32HEX[(value << (5 - bits)) & 31];
  }
  return out;
}

export function deriveCalendarProviderEventId(input: {
  calendarId: string;
  contractVersion: string;
  clientKey: string;
  hmacKey: Buffer;
}): string {
  const mac = createHmac('sha256', input.hmacKey)
    .update(
      `vida2-cal-hold:${input.calendarId}|${input.contractVersion}|${input.clientKey}`,
      'utf8',
    )
    .digest();
  const id = toBase32Hex(mac);
  // Google requires 5–1024; 52 chars from 32-byte HMAC is stable and valid.
  return id.length >= 5 ? id : id.padEnd(5, '0');
}

export function deriveCalendarHoldClientKey(idempotencyKey: string, payloadDigest: string): string {
  return opaqueKey('hold', `${idempotencyKey}:${payloadDigest}`);
}

/** Payload conceptual que respetaría la API Google (sin enviarlo en tests). */
export function buildPrivateHoldEventBody(input: CalendarHoldInsertInput): {
  summary: string;
  description: string | null;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  visibility: 'private';
  attendees: never[];
  conferenceData: null;
  recurrence: never[];
  attachments: never[];
  extendedProperties: {
    private: {
      vida2Ownership: string;
      vida2RelatedTaskKey: string;
      vida2Hold: '1';
      vida2ClientKey: string;
    };
  };
} {
  return {
    summary: input.title,
    description: input.note,
    start: { dateTime: input.start, timeZone: input.timezone },
    end: { dateTime: input.end, timeZone: input.timezone },
    visibility: 'private',
    attendees: [],
    conferenceData: null,
    recurrence: [],
    attachments: [],
    extendedProperties: {
      private: {
        vida2Ownership: input.ownership,
        vida2RelatedTaskKey: input.relatedTaskKey ?? '',
        vida2Hold: '1',
        vida2ClientKey: '',
      },
    },
  };
}

function ownershipFromSeed(seed: string): OwnershipProof {
  return createHash('sha256').update(`own:${seed}`).digest('hex').slice(0, 24);
}

function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createNotConfiguredCalendarHoldPort(message: string): CalendarHoldWritePort {
  return {
    async createHold() {
      return { ok: false, message };
    },
    async getHold() {
      return null;
    },
    async deleteHoldWithOwnership() {
      return { ok: false, code: 'not-configured', message };
    },
    async verifyHoldAbsent() {
      return { ok: false, code: 'not-configured', message };
    },
    async checkReady() {
      return { ok: false, code: 'not-configured', message };
    },
  };
}

/**
 * Memoria inyectable (tests / WRITE_ACTIONS_USE_MEMORY local).
 * Usa la misma derivación determinista cuando se provee hmacKey+contractVersion+calendarId.
 */
export function createMemoryCalendarHoldPort(options?: {
  calendarId?: string;
  contractVersion?: string;
  hmacKey?: Buffer;
  failReady?: boolean;
  /** Fuerza verifyHoldAbsent a fail cerrado. */
  failVerify?: boolean;
}): CalendarHoldWritePort & {
  holds: Map<string, CalendarHoldSnapshot & { deleted?: boolean; providerEventId?: string }>;
} {
  const holds = new Map<
    string,
    CalendarHoldSnapshot & { deleted?: boolean; providerEventId?: string }
  >();
  const calendarId = options?.calendarId ?? 'memory-cal';
  const contractVersion = options?.contractVersion ?? 'vida2-writes-v1';
  const hmacKey = options?.hmacKey ?? createHash('sha256').update('memory-hold-hmac').digest();

  return {
    holds,
    async createHold(payload: CalendarHoldCreatePayload, meta) {
      const digest = meta.payloadDigest ?? createHash('sha256').update(payload.title).digest('hex');
      const key = deriveCalendarHoldClientKey(meta.idempotencyKey, digest);
      const providerEventId = deriveCalendarProviderEventId({
        calendarId,
        contractVersion: meta.contractVersion ?? contractVersion,
        clientKey: key,
        hmacKey,
      });
      const snapshot: CalendarHoldSnapshot & { deleted?: boolean; providerEventId?: string } = {
        key,
        title: payload.title,
        start: payload.start,
        end: payload.end,
        ownership: meta.ownership,
        relatedTaskKey: payload.relatedTaskKey ?? null,
        providerEventId,
      };
      holds.set(key, snapshot);
      return { ok: true, key, ownership: meta.ownership };
    },
    async getHold(key) {
      const row = holds.get(key);
      if (!row || row.deleted) return null;
      return {
        key: row.key,
        title: row.title,
        start: row.start,
        end: row.end,
        ownership: row.ownership,
        relatedTaskKey: row.relatedTaskKey,
      };
    },
    async deleteHoldWithOwnership(key, ownership) {
      const row = holds.get(key);
      if (!row || row.deleted) {
        return { ok: true, outcome: 'already-absent' };
      }
      if (row.ownership !== ownership) {
        return { ok: false, code: 'ownership-mismatch', message: 'Ownership inválido.' };
      }
      row.deleted = true;
      return { ok: true, outcome: 'deleted' };
    },
    async verifyHoldAbsent(key) {
      if (options?.failVerify) {
        return {
          ok: false,
          code: 'unavailable',
          message: 'No se pudo verificar la ausencia del hold.',
        };
      }
      const row = holds.get(key);
      if (!row || row.deleted) return { ok: true, absent: true };
      return { ok: true, absent: false };
    },
    async checkReady() {
      if (options?.failReady) {
        return {
          ok: false,
          code: 'unavailable' as const,
          message: 'Calendario dedicado no accesible.',
        };
      }
      return { ok: true };
    },
  };
}

export type FakeCalendarHoldEvent = {
  title: string;
  start: string;
  end: string;
  ownership: OwnershipProof;
  relatedTaskKey: string | null;
  /** deleted = cancelled tombstone; absent removes the map entry semantics via flag. */
  state?: 'active' | 'cancelled' | 'absent';
  deleted?: boolean;
};

/**
 * Fake estructurado para tests: registra llamadas, nunca toca red.
 * Shared across port instances for multi-instance proofs.
 */
export function createFakeCalendarHoldApiClient(options?: {
  failInsert?: boolean;
  failDelete?: boolean;
  ownershipMismatch?: boolean;
  failGetCalendar?: boolean;
  primaryCalendar?: boolean;
  /** Optional shared events map for multi-instance tests. */
  events?: Map<string, FakeCalendarHoldEvent>;
  /** Secuencia de lookups por intento (consume shifts). */
  lookupQueue?: CalendarHoldLookupResult[];
  /** Secuencia de resultados de DELETE HTTP (tras ownership ok). */
  deleteQueue?: CalendarHoldDeleteResult[];
}): CalendarHoldApiClient & {
  inserts: CalendarHoldInsertInput[];
  deletes: { calendarId: string; providerEventId: string; ownership: OwnershipProof }[];
  events: Map<string, FakeCalendarHoldEvent>;
  lookupCalls: number;
  deleteCalls: number;
} {
  const events = options?.events ?? new Map<string, FakeCalendarHoldEvent>();
  const inserts: CalendarHoldInsertInput[] = [];
  const deletes: { calendarId: string; providerEventId: string; ownership: OwnershipProof }[] = [];
  const lookupQueue = options?.lookupQueue ? [...options.lookupQueue] : [];
  const deleteQueue = options?.deleteQueue ? [...options.deleteQueue] : [];
  let lookupCalls = 0;
  let deleteCalls = 0;

  function resolveFromMap(providerEventId: string): CalendarHoldLookupResult {
    const row = events.get(providerEventId);
    if (!row || row.state === 'absent') {
      return { ok: true, state: 'absent' };
    }
    if (row.deleted || row.state === 'cancelled') {
      return { ok: true, state: 'deleted' };
    }
    return {
      ok: true,
      state: 'active',
      title: row.title,
      start: row.start,
      end: row.end,
      ownership: row.ownership,
      relatedTaskKey: row.relatedTaskKey,
    };
  }

  return {
    inserts,
    deletes,
    events,
    get lookupCalls() {
      return lookupCalls;
    },
    get deleteCalls() {
      return deleteCalls;
    },
    async insertPrivateHold(input) {
      inserts.push(input);
      const body = buildPrivateHoldEventBody(input);
      if (body.visibility !== 'private' || body.attendees.length > 0) {
        return { ok: false, message: 'Constraint violation.' };
      }
      if (options?.failInsert) return { ok: false, message: 'Fake insert failed.' };
      const providerEventId =
        input.providerEventId ??
        opaqueKey('gevt', input.title + input.start + String(inserts.length));
      events.set(providerEventId, {
        title: input.title,
        start: input.start,
        end: input.end,
        ownership: input.ownership,
        relatedTaskKey: input.relatedTaskKey,
        state: 'active',
      });
      return { ok: true, providerEventId };
    },
    async getHoldByProviderId(_calendarId, providerEventId) {
      lookupCalls += 1;
      if (lookupQueue.length > 0) {
        return lookupQueue.shift()!;
      }
      return resolveFromMap(providerEventId);
    },
    async deleteHoldByProviderId(calendarId, providerEventId, ownership) {
      deletes.push({ calendarId, providerEventId, ownership });
      deleteCalls += 1;

      const lookup = resolveFromMap(providerEventId);
      if (lookup.ok && (lookup.state === 'deleted' || lookup.state === 'absent')) {
        return { ok: true, outcome: 'already-absent' };
      }
      if (!lookup.ok) {
        return { ok: false, code: lookup.code, message: lookup.message };
      }
      if (options?.ownershipMismatch || !lookup.ownership || lookup.ownership !== ownership) {
        return { ok: false, code: 'ownership-mismatch', message: 'Ownership inválido.' };
      }
      if (options?.failDelete) {
        return { ok: false, code: 'failed', message: 'Fake delete failed.' };
      }
      if (deleteQueue.length > 0) {
        const queued = deleteQueue.shift()!;
        if (queued.ok && queued.outcome === 'deleted') {
          const row = events.get(providerEventId);
          if (row) {
            row.state = 'cancelled';
            row.deleted = true;
          }
        }
        return queued;
      }
      const row = events.get(providerEventId);
      if (row) {
        row.state = 'cancelled';
        row.deleted = true;
      }
      return { ok: true, outcome: 'deleted' };
    },
    async getCalendar(calendarId) {
      if (options?.failGetCalendar) {
        return { ok: false, message: 'Calendario dedicado no accesible.' };
      }
      if (!calendarId.trim()) {
        return { ok: false, message: 'Calendario dedicado no accesible.' };
      }
      return {
        ok: true,
        id: calendarId,
        primary: Boolean(options?.primaryCalendar),
        timeZone: 'America/Argentina/Buenos_Aires',
      };
    },
  };
}

/**
 * Puerto real inyectable: usa CalendarHoldApiClient (fake en tests; nunca Google en suite).
 * Sin Maps de proceso: providerEventId se re-deriva desde la clave opaca + HMAC.
 */
export function createCalendarHoldWritePort(input: {
  calendarId: string;
  timezone: string;
  client: CalendarHoldApiClient;
  contractVersion: string;
  hmacKey: Buffer;
  sleep?: (ms: number) => Promise<void>;
}): CalendarHoldWritePort {
  const calendarId = input.calendarId.trim();
  const contractVersion = input.contractVersion.trim() || 'vida2-writes-v1';
  const sleep = input.sleep ?? defaultSleep;

  function providerIdForKey(clientKey: string, version?: string): string {
    return deriveCalendarProviderEventId({
      calendarId,
      contractVersion: version ?? contractVersion,
      clientKey,
      hmacKey: input.hmacKey,
    });
  }

  return {
    async createHold(payload, meta) {
      if (!calendarId) {
        return { ok: false, message: 'Calendar write ID ausente.' };
      }
      const digest =
        meta.payloadDigest ?? createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      const version = meta.contractVersion ?? contractVersion;
      const ownership = meta.ownership || ownershipFromSeed(meta.idempotencyKey + payload.title);
      const key = deriveCalendarHoldClientKey(meta.idempotencyKey, digest);
      const providerEventId = providerIdForKey(key, version);
      const inserted = await input.client.insertPrivateHold({
        calendarId,
        title: payload.title,
        start: payload.start,
        end: payload.end,
        note: payload.note ?? null,
        ownership,
        relatedTaskKey: payload.relatedTaskKey ?? null,
        timezone: input.timezone,
        providerEventId,
      });
      if (!inserted.ok) return inserted;
      return { ok: true, key, ownership };
    },
    async getHold(key) {
      const providerEventId = providerIdForKey(key);
      const got = await input.client.getHoldByProviderId(calendarId, providerEventId);
      if (!got.ok || got.state !== 'active') return null;
      return {
        key,
        title: got.title,
        start: got.start,
        end: got.end,
        ownership: got.ownership ?? '',
        relatedTaskKey: got.relatedTaskKey,
      };
    },
    async deleteHoldWithOwnership(key, ownership) {
      const providerEventId = providerIdForKey(key);
      return input.client.deleteHoldByProviderId(calendarId, providerEventId, ownership);
    },

    async verifyHoldAbsent(key) {
      const providerEventId = providerIdForKey(key);
      let lastUnavailable: { code: string; message: string } | null = null;

      for (let attempt = 0; attempt < VERIFY_ABSENT_DELAYS_MS.length; attempt += 1) {
        const delay = VERIFY_ABSENT_DELAYS_MS[attempt] ?? 0;
        if (delay > 0) await sleep(delay);
        const got = await input.client.getHoldByProviderId(calendarId, providerEventId);
        if (!got.ok) {
          lastUnavailable = { code: got.code, message: got.message };
          if (got.retryable && attempt < VERIFY_ABSENT_DELAYS_MS.length - 1) {
            continue;
          }
          return {
            ok: false,
            code: got.code,
            message: 'No se pudo verificar la ausencia del hold.',
          };
        }
        if (got.state === 'deleted' || got.state === 'absent') {
          return { ok: true, absent: true };
        }
        // active — reintentar si quedan lecturas
        if (attempt < VERIFY_ABSENT_DELAYS_MS.length - 1) {
          continue;
        }
        return { ok: true, absent: false };
      }

      if (lastUnavailable) {
        return {
          ok: false,
          code: lastUnavailable.code,
          message: 'No se pudo verificar la ausencia del hold.',
        };
      }
      return { ok: true, absent: false };
    },

    async checkReady() {
      if (!calendarId) {
        return {
          ok: false,
          code: 'not-configured' as const,
          message: 'Calendar write ID ausente.',
        };
      }
      const meta = await input.client.getCalendar(calendarId);
      if (!meta.ok) {
        return {
          ok: false,
          code: 'unavailable' as const,
          message: 'Calendario dedicado no accesible.',
        };
      }
      if (meta.id !== calendarId) {
        return {
          ok: false,
          code: 'misconfigured' as const,
          message: 'Calendario dedicado no coincide.',
        };
      }
      if (meta.primary) {
        return {
          ok: false,
          code: 'misconfigured' as const,
          message: 'El calendario primario no está permitido.',
        };
      }
      return { ok: true };
    },
  };
}

/**
 * Stub env-backed: fail-closed si escrituras on y falta GOOGLE_CALENDAR_WRITE_ID.
 * Sin cliente API inyectado no llama Google (fail-closed / not-configured).
 */
export function createCalendarHoldWritePortFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
  client?: CalendarHoldApiClient,
  options?: {
    contractVersion?: string;
    hmacKey?: Buffer;
    sleep?: (ms: number) => Promise<void>;
  },
): CalendarHoldWritePort {
  if (!isWriteActionsEnabled(env)) {
    return createNotConfiguredCalendarHoldPort('Escrituras desactivadas.');
  }
  const calendarId = getGoogleCalendarWriteId(env);
  if (!calendarId) {
    return createNotConfiguredCalendarHoldPort('GOOGLE_CALENDAR_WRITE_ID ausente.');
  }
  if (!client || !options?.hmacKey) {
    return createNotConfiguredCalendarHoldPort(
      'Cliente Calendar hold no cableado (fail-closed; sin llamadas Google).',
    );
  }
  return createCalendarHoldWritePort({
    calendarId,
    timezone: getGoogleCalendarTimezoneForWrites(env),
    client,
    contractVersion: options.contractVersion ?? 'vida2-writes-v1',
    hmacKey: options.hmacKey,
    sleep: options.sleep,
  });
}
