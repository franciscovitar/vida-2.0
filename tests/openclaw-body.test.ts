import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildCanonicalString, sha256Hex } from '@/lib/openclaw/auth';
import {
  decodeOpenClawUtf8,
  parseOpenClawJsonStrict,
  readOpenClawBodyBytes,
} from '@/lib/openclaw/body';
import { OPENCLAW_MAX_BODY_BYTES } from '@/lib/openclaw/config';

function requestLike(input: {
  body: ReadableStream<Uint8Array> | null;
  contentLength?: string;
}): Pick<Request, 'headers' | 'body'> {
  const headers = new Headers();
  if (input.contentLength !== undefined) {
    headers.set('content-length', input.contentLength);
  }
  return { headers, body: input.body };
}

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

test('openclaw body: Content-Length inválido o excesivo rechaza antes de leer', async () => {
  let getReaderCalls = 0;
  const body = {
    getReader() {
      getReaderCalls += 1;
      throw new Error('no debe leerse');
    },
  } as unknown as ReadableStream<Uint8Array>;

  const invalid = await readOpenClawBodyBytes(
    requestLike({ body, contentLength: '+10' }),
    OPENCLAW_MAX_BODY_BYTES,
  );
  const excessive = await readOpenClawBodyBytes(
    requestLike({ body, contentLength: String(OPENCLAW_MAX_BODY_BYTES + 1) }),
    OPENCLAW_MAX_BODY_BYTES,
  );

  assert.deepEqual(invalid, { ok: false, reason: 'invalid-content-length' });
  assert.deepEqual(excessive, { ok: false, reason: 'body-too-large' });
  assert.equal(getReaderCalls, 0);
});

test('openclaw body: acepta 64 KiB exactos y corta 64 KiB + 1', async () => {
  const exactBytes = new Uint8Array(OPENCLAW_MAX_BODY_BYTES);
  const exact = await readOpenClawBodyBytes(
    requestLike({
      body: streamFromChunks([exactBytes]),
      contentLength: String(OPENCLAW_MAX_BODY_BYTES),
    }),
    OPENCLAW_MAX_BODY_BYTES,
  );
  assert.equal(exact.ok, true);
  if (exact.ok) assert.equal(exact.bytes.byteLength, OPENCLAW_MAX_BODY_BYTES);

  const excessive = await readOpenClawBodyBytes(
    requestLike({
      body: streamFromChunks([new Uint8Array(OPENCLAW_MAX_BODY_BYTES), new Uint8Array([1])]),
    }),
    OPENCLAW_MAX_BODY_BYTES,
  );
  assert.deepEqual(excessive, { ok: false, reason: 'body-too-large' });
});

test('openclaw body: Content-Length discordante falla cerrado', async () => {
  const result = await readOpenClawBodyBytes(
    requestLike({
      body: streamFromChunks([new TextEncoder().encode('{}')]),
      contentLength: '3',
    }),
    OPENCLAW_MAX_BODY_BYTES,
  );
  assert.deepEqual(result, { ok: false, reason: 'invalid-content-length' });
});

test('openclaw body: un stream truncado o fallido no produce body parcial', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"a":'));
      controller.error(new Error('truncado'));
    },
  });
  const result = await readOpenClawBodyBytes(requestLike({ body }), OPENCLAW_MAX_BODY_BYTES);
  assert.deepEqual(result, { ok: false, reason: 'body-read-failed' });
});

test('openclaw body: UTF-8 inválido se rechaza sin reemplazo U+FFFD', () => {
  const decoded = decodeOpenClawUtf8(new Uint8Array([0xc3, 0x28]));
  assert.deepEqual(decoded, { ok: false, reason: 'invalid-utf8' });
});

test('openclaw body: JSON rechaza claves duplicadas incluso escapadas y anidadas', () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"outer":{"x":1,"x":2}}']) {
    assert.deepEqual(parseOpenClawJsonStrict(text), {
      ok: false,
      reason: 'duplicate-key',
    });
  }
});

test('openclaw body: JSON estricto conserva un documento válido', () => {
  const parsed = parseOpenClawJsonStrict(
    '{"operation":"areas.list","input":{"limit":10},"values":[true,false,null,-1.25e2]}',
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.value, {
      operation: 'areas.list',
      input: { limit: 10 },
      values: [true, false, null, -125],
    });
  }
});

test('openclaw body: canonical HMAC usa los bytes originales', () => {
  const bytes = new Uint8Array([0xc3, 0x28]);
  const canonical = buildCanonicalString({
    timestamp: '1760000000000',
    requestId: 'req-bytes',
    method: 'POST',
    pathname: '/api/openclaw/v1/read',
    rawBody: bytes,
  });

  assert.equal(canonical.split('\n').at(-1), sha256Hex(bytes));
  assert.notEqual(canonical.split('\n').at(-1), sha256Hex('�('));
});
