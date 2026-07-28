/**
 * Puerto Calendar hold (Block 3).
 * Constraints: calendario dedicado, visibility private, sin attendees/meet/recurrence/attachments,
 * ownership en extendedProperties.private, eventId real nunca al cliente (solo clave opaca).
 * Tests: fake/memory; nunca llaman Google APIs.
 */
import { createHash } from 'node:crypto';

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
};

export type CalendarHoldInsertResult =
  { ok: true; providerEventId: string } | { ok: false; message: string };

export type CalendarHoldApiClient = {
  insertPrivateHold(input: CalendarHoldInsertInput): Promise<CalendarHoldInsertResult>;
  getHoldByProviderId(
    calendarId: string,
    providerEventId: string,
  ): Promise<
    | {
        ok: true;
        title: string;
        start: string;
        end: string;
        ownership: OwnershipProof | null;
        relatedTaskKey: string | null;
      }
    | { ok: false; message: string }
  >;
  deleteHoldByProviderId(
    calendarId: string,
    providerEventId: string,
    ownership: OwnershipProof,
  ): Promise<{ ok: true } | { ok: false; code: string; message: string }>;
};

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
      },
    },
  };
}

function ownershipFromSeed(seed: string): OwnershipProof {
  return createHash('sha256').update(`own:${seed}`).digest('hex').slice(0, 24);
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
  };
}

/**
 * Memoria inyectable (tests / WRITE_ACTIONS_USE_MEMORY local).
 */
export function createMemoryCalendarHoldPort(): CalendarHoldWritePort & {
  holds: Map<string, CalendarHoldSnapshot & { deleted?: boolean; providerEventId?: string }>;
} {
  const holds = new Map<
    string,
    CalendarHoldSnapshot & { deleted?: boolean; providerEventId?: string }
  >();
  return {
    holds,
    async createHold(payload: CalendarHoldCreatePayload, meta) {
      const key = opaqueKey('hold', meta.idempotencyKey + payload.title);
      const snapshot: CalendarHoldSnapshot & { deleted?: boolean; providerEventId?: string } = {
        key,
        title: payload.title,
        start: payload.start,
        end: payload.end,
        ownership: meta.ownership,
        relatedTaskKey: payload.relatedTaskKey ?? null,
        providerEventId: `mem-${key}`,
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
        return { ok: false, code: 'not-found', message: 'Hold no encontrado.' };
      }
      if (row.ownership !== ownership) {
        return { ok: false, code: 'ownership-mismatch', message: 'Ownership inválido.' };
      }
      row.deleted = true;
      return { ok: true };
    },
  };
}

/**
 * Fake estructurado para tests: registra llamadas, nunca toca red.
 */
export function createFakeCalendarHoldApiClient(options?: {
  failInsert?: boolean;
  failDelete?: boolean;
  ownershipMismatch?: boolean;
}): CalendarHoldApiClient & {
  inserts: CalendarHoldInsertInput[];
  deletes: { calendarId: string; providerEventId: string; ownership: OwnershipProof }[];
  events: Map<
    string,
    {
      title: string;
      start: string;
      end: string;
      ownership: OwnershipProof;
      relatedTaskKey: string | null;
      deleted?: boolean;
    }
  >;
} {
  const events = new Map<
    string,
    {
      title: string;
      start: string;
      end: string;
      ownership: OwnershipProof;
      relatedTaskKey: string | null;
      deleted?: boolean;
    }
  >();
  const inserts: CalendarHoldInsertInput[] = [];
  const deletes: { calendarId: string; providerEventId: string; ownership: OwnershipProof }[] = [];

  return {
    inserts,
    deletes,
    events,
    async insertPrivateHold(input) {
      inserts.push(input);
      // Enforce conceptual constraints in fake (no attendees/meet/etc. in body builder).
      const body = buildPrivateHoldEventBody(input);
      if (body.visibility !== 'private' || body.attendees.length > 0) {
        return { ok: false, message: 'Constraint violation.' };
      }
      if (options?.failInsert) return { ok: false, message: 'Fake insert failed.' };
      const providerEventId = opaqueKey('gevt', input.title + input.start + inserts.length);
      events.set(providerEventId, {
        title: input.title,
        start: input.start,
        end: input.end,
        ownership: input.ownership,
        relatedTaskKey: input.relatedTaskKey,
      });
      return { ok: true, providerEventId };
    },
    async getHoldByProviderId(_calendarId, providerEventId) {
      const row = events.get(providerEventId);
      if (!row || row.deleted) return { ok: false, message: 'Hold no encontrado.' };
      return {
        ok: true,
        title: row.title,
        start: row.start,
        end: row.end,
        ownership: row.ownership,
        relatedTaskKey: row.relatedTaskKey,
      };
    },
    async deleteHoldByProviderId(calendarId, providerEventId, ownership) {
      deletes.push({ calendarId, providerEventId, ownership });
      const row = events.get(providerEventId);
      if (!row || row.deleted) {
        return { ok: false, code: 'not-found', message: 'Hold no encontrado.' };
      }
      if (options?.failDelete || options?.ownershipMismatch || row.ownership !== ownership) {
        return { ok: false, code: 'ownership-mismatch', message: 'Ownership inválido.' };
      }
      row.deleted = true;
      return { ok: true };
    },
  };
}

/**
 * Puerto real inyectable: usa CalendarHoldApiClient (fake en tests; nunca Google en suite).
 * Mapea providerEventId → clave opaca; el cliente solo ve la clave opaca.
 */
export function createCalendarHoldWritePort(input: {
  calendarId: string;
  timezone: string;
  client: CalendarHoldApiClient;
}): CalendarHoldWritePort & {
  /** Solo tests: mapa opaco → provider (nunca al cliente). */
  opaqueToProvider: Map<string, string>;
} {
  const calendarId = input.calendarId.trim();
  const opaqueToProvider = new Map<string, string>();
  const providerToOpaque = new Map<string, string>();

  return {
    opaqueToProvider,
    async createHold(payload, meta) {
      if (!calendarId) {
        return { ok: false, message: 'Calendar write ID ausente.' };
      }
      const ownership = meta.ownership || ownershipFromSeed(meta.idempotencyKey + payload.title);
      const inserted = await input.client.insertPrivateHold({
        calendarId,
        title: payload.title,
        start: payload.start,
        end: payload.end,
        note: payload.note ?? null,
        ownership,
        relatedTaskKey: payload.relatedTaskKey ?? null,
        timezone: input.timezone,
      });
      if (!inserted.ok) return inserted;
      const key = opaqueKey('hold', meta.idempotencyKey + inserted.providerEventId);
      opaqueToProvider.set(key, inserted.providerEventId);
      providerToOpaque.set(inserted.providerEventId, key);
      return { ok: true, key, ownership };
    },
    async getHold(key) {
      const providerEventId = opaqueToProvider.get(key);
      if (!providerEventId) return null;
      const got = await input.client.getHoldByProviderId(calendarId, providerEventId);
      if (!got.ok) return null;
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
      const providerEventId = opaqueToProvider.get(key);
      if (!providerEventId) {
        return { ok: false, code: 'not-found', message: 'Hold no encontrado.' };
      }
      return input.client.deleteHoldByProviderId(calendarId, providerEventId, ownership);
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
): CalendarHoldWritePort {
  if (!isWriteActionsEnabled(env)) {
    return createNotConfiguredCalendarHoldPort('Escrituras desactivadas.');
  }
  const calendarId = getGoogleCalendarWriteId(env);
  if (!calendarId) {
    return createNotConfiguredCalendarHoldPort('GOOGLE_CALENDAR_WRITE_ID ausente.');
  }
  if (!client) {
    return createNotConfiguredCalendarHoldPort(
      'Cliente Calendar hold no cableado (fail-closed; sin llamadas Google).',
    );
  }
  return createCalendarHoldWritePort({
    calendarId,
    timezone: getGoogleCalendarTimezoneForWrites(env),
    client,
  });
}
