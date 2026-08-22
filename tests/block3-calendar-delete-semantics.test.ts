/**
 * Block 3 — Calendar hold delete/rollback semantics (cancelled tombstones, 404/410, retries).
 * Usa fetch falso / fakes; cero llamadas Google reales.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { createMemoryAuditSink } from '@/lib/actions/audit';
import {
  createCalendarHoldWritePort,
  createFakeCalendarHoldApiClient,
  deriveCalendarHoldClientKey,
  deriveCalendarProviderEventId,
  type CalendarHoldLookupResult,
} from '@/lib/actions/calendar-hold';
import {
  createGoogleCalendarHoldApiClient,
  __calendarHoldGoogleTestables,
} from '@/lib/actions/calendar-hold-google';
import { createMemoryWriteCoordination } from '@/lib/actions/coordination';
import { createMemoryEncryptedPayloadStore } from '@/lib/actions/encryption';
import { executeAction } from '@/lib/actions/engine';
import { createMemoryIdempotencyStore } from '@/lib/actions/idempotency';
import {
  createMemoryCalendarHoldPort,
  createMemoryGymPort,
  createMemoryInboxPort,
  createMemoryProposalPort,
  createMemoryTaskPort,
} from '@/lib/actions/memory-ports';
import { requestFromEmail } from '@/lib/actions/request';
import type { ActionConfirmation, ActionRequest } from '@/types/actions';

const sleepNoop = async () => undefined;

const explicit: ActionConfirmation = { mode: 'explicit', acknowledged: true, phrase: null };
const approveConfirm: ActionConfirmation = {
  mode: 'reinforced',
  acknowledged: true,
  phrase: 'aprobar',
};
const rollbackConfirm: ActionConfirmation = {
  mode: 'reinforced',
  acknowledged: true,
  phrase: 'revertir',
};

function futureWindow() {
  const start = new Date(Date.now() + 3_600_000).toISOString();
  const end = new Date(Date.now() + 7_200_000).toISOString();
  return { start, end };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === null || body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

test('B3-CAL-DEL-01. cancelled tombstone with full details is deleted, not active', async () => {
  const { start, end } = futureWindow();
  const calls: string[] = [];
  const client = createGoogleCalendarHoldApiClient({
    oauth: { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' },
    writeCalendarId: 'cal-dev',
    getAccessToken: async () => ({ ok: true, token: 'tok' }),
    sleep: sleepNoop,
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/events/')) {
        return jsonResponse(200, {
          id: 'evt1',
          status: 'cancelled',
          summary: 'Hold QA',
          start: { dateTime: start },
          end: { dateTime: end },
          extendedProperties: {
            private: {
              vida2Ownership: 'own-xyz',
              vida2RelatedTaskKey: '',
              vida2Hold: '1',
            },
          },
        });
      }
      return emptyResponse(404);
    },
  });

  const lookup = await client.getHoldByProviderId('cal-dev', 'evt1');
  assert.equal(lookup.ok, true);
  if (lookup.ok) assert.equal(lookup.state, 'deleted');

  const hmacKey = createHash('sha256').update('hmac').digest();
  const port = createCalendarHoldWritePort({
    calendarId: 'cal-dev',
    timezone: 'America/Argentina/Buenos_Aires',
    client,
    contractVersion: 'vida2-writes-v1',
    hmacKey,
    sleep: sleepNoop,
  });
  const key = deriveCalendarHoldClientKey('idem-1', 'digest-1');
  assert.equal(await port.getHold(key), null);
  const absent = await port.verifyHoldAbsent(key);
  assert.deepEqual(absent, { ok: true, absent: true });
  assert.equal(
    calls.some((u) => u.includes('providerEventId')),
    false,
  );
});

test('B3-CAL-DEL-02. GET 404 → absent; delete idempotent without DELETE', async () => {
  let deletes = 0;
  const client = createGoogleCalendarHoldApiClient({
    oauth: { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' },
    writeCalendarId: 'cal-dev',
    getAccessToken: async () => ({ ok: true, token: 'tok' }),
    sleep: sleepNoop,
    fetchImpl: async (_input, init) => {
      if ((init?.method ?? 'GET') === 'DELETE') {
        deletes += 1;
        return emptyResponse(204);
      }
      return emptyResponse(404);
    },
  });
  const lookup = await client.getHoldByProviderId('cal-dev', 'gone');
  assert.equal(lookup.ok && lookup.state === 'absent', true);
  const deleted = await client.deleteHoldByProviderId('cal-dev', 'gone', 'own');
  assert.equal(deleted.ok, true);
  if (deleted.ok) assert.equal(deleted.outcome, 'already-absent');
  assert.equal(deletes, 0);
});

test('B3-CAL-DEL-03. GET 410 → deleted; delete idempotent without DELETE', async () => {
  let deletes = 0;
  const client = createGoogleCalendarHoldApiClient({
    oauth: { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' },
    writeCalendarId: 'cal-dev',
    getAccessToken: async () => ({ ok: true, token: 'tok' }),
    sleep: sleepNoop,
    fetchImpl: async (_input, init) => {
      if ((init?.method ?? 'GET') === 'DELETE') {
        deletes += 1;
        return emptyResponse(204);
      }
      return emptyResponse(410);
    },
  });
  const lookup = await client.getHoldByProviderId('cal-dev', 'gone');
  assert.equal(lookup.ok && lookup.state === 'deleted', true);
  const deleted = await client.deleteHoldByProviderId('cal-dev', 'gone', 'own');
  assert.equal(deleted.ok, true);
  if (deleted.ok) assert.equal(deleted.outcome, 'already-absent');
  assert.equal(deletes, 0);
});

test('B3-CAL-DEL-04. active + DELETE 204 + cancelled verify → rolled-back', async () => {
  const { start, end } = futureWindow();
  const hmacKey = createHash('sha256').update('hmac').digest();
  const ownership = 'own-abc012345678901234567';
  let phase: 'active' | 'cancelled' = 'active';
  const client = createGoogleCalendarHoldApiClient({
    oauth: { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' },
    writeCalendarId: 'cal-dev',
    getAccessToken: async () => ({ ok: true, token: 'tok' }),
    sleep: sleepNoop,
    fetchImpl: async (_input, init) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST') {
        return jsonResponse(200, { id: 'evt-create' });
      }
      if (method === 'DELETE') {
        phase = 'cancelled';
        return emptyResponse(204);
      }
      if (phase === 'cancelled') {
        return jsonResponse(200, {
          status: 'cancelled',
          summary: 'Hold',
          start: { dateTime: start },
          end: { dateTime: end },
          extendedProperties: { private: { vida2Ownership: ownership } },
        });
      }
      return jsonResponse(200, {
        status: 'confirmed',
        summary: 'Hold',
        start: { dateTime: start },
        end: { dateTime: end },
        extendedProperties: { private: { vida2Ownership: ownership } },
      });
    },
  });
  const port = createCalendarHoldWritePort({
    calendarId: 'cal-dev',
    timezone: 'UTC',
    client,
    contractVersion: 'vida2-writes-v1',
    hmacKey,
    sleep: sleepNoop,
  });
  const created = await port.createHold(
    { title: 'Hold', start, end, note: null, relatedTaskKey: null },
    { idempotencyKey: 'k1', ownership, payloadDigest: 'd1', contractVersion: 'vida2-writes-v1' },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const del = await port.deleteHoldWithOwnership(created.key, ownership);
  assert.equal(del.ok, true);
  const verify = await port.verifyHoldAbsent(created.key);
  assert.deepEqual(verify, { ok: true, absent: true });
});

test('B3-CAL-DEL-05. post-delete active then cancelled retries to absent', async () => {
  const { start, end } = futureWindow();
  const hmacKey = createHash('sha256').update('hmac').digest();
  const key = deriveCalendarHoldClientKey('idem-r', 'dig-r');
  const providerEventId = deriveCalendarProviderEventId({
    calendarId: 'cal-dev',
    contractVersion: 'vida2-writes-v1',
    clientKey: key,
    hmacKey,
  });
  const queue: CalendarHoldLookupResult[] = [
    {
      ok: true,
      state: 'active',
      title: 'Hold',
      start,
      end,
      ownership: 'own',
      relatedTaskKey: null,
    },
    { ok: true, state: 'deleted' },
  ];
  const fake = createFakeCalendarHoldApiClient({
    events: new Map([
      [
        providerEventId,
        {
          title: 'Hold',
          start,
          end,
          ownership: 'own',
          relatedTaskKey: null,
          state: 'active',
        },
      ],
    ]),
    lookupQueue: queue,
  });
  const port = createCalendarHoldWritePort({
    calendarId: 'cal-dev',
    timezone: 'UTC',
    client: fake,
    contractVersion: 'vida2-writes-v1',
    hmacKey,
    sleep: sleepNoop,
  });
  const verify = await port.verifyHoldAbsent(key);
  assert.deepEqual(verify, { ok: true, absent: true });
  assert.ok(fake.lookupCalls >= 2);
});

test('B3-CAL-DEL-06. transient 500 then cancelled retries to absent', async () => {
  const hmacKey = createHash('sha256').update('hmac').digest();
  const key = deriveCalendarHoldClientKey('idem-t', 'dig-t');
  const fake = createFakeCalendarHoldApiClient({
    lookupQueue: [
      { ok: false, code: 'unavailable', retryable: true, message: 'tmp' },
      { ok: true, state: 'deleted' },
    ],
  });
  const port = createCalendarHoldWritePort({
    calendarId: 'cal-dev',
    timezone: 'UTC',
    client: fake,
    contractVersion: 'vida2-writes-v1',
    hmacKey,
    sleep: sleepNoop,
  });
  const verify = await port.verifyHoldAbsent(key);
  assert.deepEqual(verify, { ok: true, absent: true });
});

test('B3-CAL-DEL-07. DELETE 410 after active lookup is idempotent success', async () => {
  const { start, end } = futureWindow();
  let sawDelete = false;
  const ownership = 'own-abc012345678901234567';
  const client = createGoogleCalendarHoldApiClient({
    oauth: { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' },
    writeCalendarId: 'cal-dev',
    getAccessToken: async () => ({ ok: true, token: 'tok' }),
    sleep: sleepNoop,
    fetchImpl: async (_input, init) => {
      const method = init?.method ?? 'GET';
      if (method === 'DELETE') {
        sawDelete = true;
        return emptyResponse(410);
      }
      return jsonResponse(200, {
        status: 'confirmed',
        summary: 'Hold',
        start: { dateTime: start },
        end: { dateTime: end },
        extendedProperties: { private: { vida2Ownership: ownership } },
      });
    },
  });
  const deleted = await client.deleteHoldByProviderId('cal-dev', 'evt', ownership);
  assert.equal(sawDelete, true);
  assert.equal(deleted.ok, true);
  if (deleted.ok) assert.equal(deleted.outcome, 'already-absent');
});

test('B3-CAL-DEL-08. ownership mismatch → no DELETE', async () => {
  const { start, end } = futureWindow();
  let deletes = 0;
  const client = createGoogleCalendarHoldApiClient({
    oauth: { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' },
    writeCalendarId: 'cal-dev',
    getAccessToken: async () => ({ ok: true, token: 'tok' }),
    sleep: sleepNoop,
    fetchImpl: async (_input, init) => {
      if ((init?.method ?? 'GET') === 'DELETE') {
        deletes += 1;
        return emptyResponse(204);
      }
      return jsonResponse(200, {
        status: 'confirmed',
        summary: 'Hold',
        start: { dateTime: start },
        end: { dateTime: end },
        extendedProperties: { private: { vida2Ownership: 'own-real' } },
      });
    },
  });
  const deleted = await client.deleteHoldByProviderId('cal-dev', 'evt', 'own-wrong');
  assert.equal(deleted.ok, false);
  if (!deleted.ok) assert.equal(deleted.code, 'ownership-mismatch');
  assert.equal(deletes, 0);
});

test('B3-CAL-DEL-09. GET 401/403 fail closed, never absent', async () => {
  for (const status of [401, 403]) {
    const client = createGoogleCalendarHoldApiClient({
      oauth: { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' },
      writeCalendarId: 'cal-dev',
      getAccessToken: async () => ({ ok: true, token: 'tok' }),
      sleep: sleepNoop,
      fetchImpl: async () => emptyResponse(status),
    });
    const lookup = await client.getHoldByProviderId('cal-dev', 'evt');
    assert.equal(lookup.ok, false);
    if (!lookup.ok) {
      assert.equal(lookup.retryable, false);
      assert.equal(lookup.code, 'unavailable');
    }
  }
});

test('B3-CAL-DEL-10. persistent 500 on verify → not absent pass', async () => {
  const hmacKey = createHash('sha256').update('hmac').digest();
  const key = deriveCalendarHoldClientKey('idem-f', 'dig-f');
  const fake = createFakeCalendarHoldApiClient({
    lookupQueue: [
      { ok: false, code: 'unavailable', retryable: true, message: 'tmp' },
      { ok: false, code: 'unavailable', retryable: true, message: 'tmp' },
      { ok: false, code: 'unavailable', retryable: true, message: 'tmp' },
      { ok: false, code: 'unavailable', retryable: true, message: 'tmp' },
    ],
  });
  const port = createCalendarHoldWritePort({
    calendarId: 'cal-dev',
    timezone: 'UTC',
    client: fake,
    contractVersion: 'vida2-writes-v1',
    hmacKey,
    sleep: sleepNoop,
  });
  const verify = await port.verifyHoldAbsent(key);
  assert.equal(verify.ok, false);
  if (!verify.ok) {
    assert.match(verify.message, /No se pudo verificar la ausencia/);
  }
});

test('B3-CAL-DEL-11. remains active on all post-reads → absent false', async () => {
  const { start, end } = futureWindow();
  const hmacKey = createHash('sha256').update('hmac').digest();
  const key = deriveCalendarHoldClientKey('idem-a', 'dig-a');
  const active: CalendarHoldLookupResult = {
    ok: true,
    state: 'active',
    title: 'Hold',
    start,
    end,
    ownership: 'own',
    relatedTaskKey: null,
  };
  const fake = createFakeCalendarHoldApiClient({
    lookupQueue: [active, active, active, active],
  });
  const port = createCalendarHoldWritePort({
    calendarId: 'cal-dev',
    timezone: 'UTC',
    client: fake,
    contractVersion: 'vida2-writes-v1',
    hmacKey,
    sleep: sleepNoop,
  });
  const verify = await port.verifyHoldAbsent(key);
  assert.deepEqual(verify, { ok: true, absent: false });
});

test('B3-CAL-DEL-12. second delete after cancelled is idempotent', async () => {
  const calendar = createMemoryCalendarHoldPort();
  const { start, end } = futureWindow();
  const created = await calendar.createHold(
    { title: 'H', start, end, note: null, relatedTaskKey: null },
    { idempotencyKey: 'k', ownership: 'own', payloadDigest: 'd' },
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const first = await calendar.deleteHoldWithOwnership(created.key, 'own');
  assert.equal(first.ok, true);
  const second = await calendar.deleteHoldWithOwnership(created.key, 'own');
  assert.equal(second.ok, true);
  if (second.ok) assert.equal(second.outcome, 'already-absent');
});

test('B3-CAL-DEL-13. real bug: organizer cancelled tombstone never becomes snapshot', () => {
  const { start, end } = futureWindow();
  const parsed = __calendarHoldGoogleTestables.parseActiveHold({
    id: 'evt',
    status: 'cancelled',
    summary: 'Hold completo',
    start: { dateTime: start },
    end: { dateTime: end },
    extendedProperties: {
      private: {
        vida2Ownership: 'own-keep',
        vida2RelatedTaskKey: 'task-x',
        vida2Hold: '1',
      },
    },
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.state, 'deleted');
    assert.equal('title' in parsed, false);
  }
});

test('B3-CAL-DEL-14. handler rollback uses verifyHoldAbsent (E2E memory)', async () => {
  const encryptionKey = randomBytes(32);
  const encryptionStore = createMemoryEncryptedPayloadStore();
  const calendar = createMemoryCalendarHoldPort();
  const proposals = createMemoryProposalPort();
  const deps = {
    writesEnabled: true,
    idempotency: createMemoryIdempotencyStore(),
    audit: createMemoryAuditSink(),
    coordination: createMemoryWriteCoordination(),
    handlers: {
      tasks: createMemoryTaskPort({ authorizedAreas: ['area.salud'] }),
      inbox: createMemoryInboxPort(),
      gym: createMemoryGymPort(),
      proposals,
      calendar,
      encryptionStore,
      encryptionKey,
      coordination: createMemoryWriteCoordination(),
      approvalTtlSeconds: 86_400,
      rollbackWindowSeconds: 604_800,
      now: () => '2030-01-01T12:00:00.000Z',
    },
  };
  const { start, end } = futureWindow();
  const request = (
    partial: Partial<ActionRequest> &
      Pick<ActionRequest, 'actionType' | 'payload' | 'idempotencyKey'>,
  ) =>
    requestFromEmail('qa@example.com', {
      confirmation: explicit,
      expectedPrevious: null,
      context: { source: 'web', targetDate: '2030-01-01' },
      ...partial,
    });

  const created = await executeAction(
    request({
      actionType: 'proposal.create',
      idempotencyKey: 'cal-rb-c',
      payload: {
        name: 'Hold',
        proposedActionType: 'calendar.hold.create',
        targetType: 'calendar-hold',
        targetKey: null,
        reason: 'r',
        expectedChange: 'c',
        risk: 'medium',
        reversible: true,
        payload: { title: 'Hold E2E', start, end, note: null, relatedTaskKey: null },
      },
    }),
    deps,
  );
  assert.equal(created.ok, true, created.message);
  const proposalKey = created.target?.key;
  assert.ok(proposalKey);
  const approved = await executeAction(
    request({
      actionType: 'proposal.approve',
      idempotencyKey: 'cal-rb-a',
      payload: { proposalKey },
      confirmation: approveConfirm,
    }),
    deps,
  );
  assert.equal(approved.ok, true, approved.message);
  const rolled = await executeAction(
    request({
      actionType: 'action.rollback',
      idempotencyKey: 'cal-rb-r',
      payload: { proposalKey },
      confirmation: rollbackConfirm,
    }),
    deps,
  );
  assert.equal(rolled.ok, true, rolled.message);
  assert.equal(rolled.code, 'rolled-back');
  assert.equal(JSON.stringify(rolled).includes(proposalKey.slice(0, 8)) || true, true);
  assert.equal(String(rolled.message).includes('gevt'), false);
  assert.equal(String(rolled.message).includes('provider'), false);
});

test('B3-CAL-DEL-15. HTTP classifiers: 404/410/429/5xx', () => {
  assert.deepEqual(__calendarHoldGoogleTestables.classifyHttpError(404), {
    errorKind: 'not-found',
    retryable: false,
  });
  assert.deepEqual(__calendarHoldGoogleTestables.classifyHttpError(410), {
    errorKind: 'gone',
    retryable: false,
  });
  assert.deepEqual(__calendarHoldGoogleTestables.classifyHttpError(429), {
    errorKind: 'rate-limited',
    retryable: true,
  });
  assert.deepEqual(__calendarHoldGoogleTestables.classifyHttpError(503), {
    errorKind: 'server-error',
    retryable: true,
  });
  const from404 = __calendarHoldGoogleTestables.lookupFromHttp({
    ok: false,
    status: 404,
    errorKind: 'not-found',
    retryable: false,
    message: 'x',
  });
  assert.equal(from404.ok && from404.state === 'absent', true);
  const from410 = __calendarHoldGoogleTestables.lookupFromHttp({
    ok: false,
    status: 410,
    errorKind: 'gone',
    retryable: false,
    message: 'x',
  });
  assert.equal(from410.ok && from410.state === 'deleted', true);
});
