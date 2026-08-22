const CONTENT_LENGTH_PATTERN = /^(0|[1-9][0-9]*)$/;
const MAX_JSON_DEPTH = 128;

export type OpenClawBodyReadFailure =
  'invalid-content-length' | 'body-too-large' | 'body-read-failed';

export type OpenClawBodyReadResult =
  { ok: true; bytes: Uint8Array } | { ok: false; reason: OpenClawBodyReadFailure };

export type OpenClawUtf8Result = { ok: true; text: string } | { ok: false; reason: 'invalid-utf8' };

export type OpenClawJsonResult =
  { ok: true; value: unknown } | { ok: false; reason: 'invalid-json' | 'duplicate-key' };

type BodyRequest = Pick<Request, 'headers' | 'body'>;

function parseDeclaredLength(
  headers: Headers,
): { ok: true; value: number | null } | { ok: false; reason: 'invalid-content-length' } {
  const raw = headers.get('content-length');
  if (raw === null) return { ok: true, value: null };
  if (!CONTENT_LENGTH_PATTERN.test(raw)) {
    return { ok: false, reason: 'invalid-content-length' };
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    return { ok: false, reason: 'invalid-content-length' };
  }
  return { ok: true, value };
}

async function cancelQuietly(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // El rechazo original tiene prioridad.
  }
}

export async function readOpenClawBodyBytes(
  request: BodyRequest,
  maxBytes: number,
): Promise<OpenClawBodyReadResult> {
  const declared = parseDeclaredLength(request.headers);
  if (!declared.ok) return declared;
  if (declared.value !== null && declared.value > maxBytes) {
    return { ok: false, reason: 'body-too-large' };
  }

  if (request.body === null) {
    return declared.value === null || declared.value === 0
      ? { ok: true, bytes: new Uint8Array(0) }
      : { ok: false, reason: 'invalid-content-length' };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) {
        await cancelQuietly(reader);
        return { ok: false, reason: 'body-read-failed' };
      }

      if (next.value.byteLength > maxBytes - total) {
        await cancelQuietly(reader);
        return { ok: false, reason: 'body-too-large' };
      }

      chunks.push(next.value);
      total += next.value.byteLength;
    }
  } catch {
    await cancelQuietly(reader);
    return { ok: false, reason: 'body-read-failed' };
  }

  if (declared.value !== null && declared.value !== total) {
    return { ok: false, reason: 'invalid-content-length' };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

export function decodeOpenClawUtf8(bytes: Uint8Array): OpenClawUtf8Result {
  try {
    return {
      ok: true,
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    };
  } catch {
    return { ok: false, reason: 'invalid-utf8' };
  }
}

class StrictJsonError extends Error {
  constructor(readonly reason: 'invalid-json' | 'duplicate-key') {
    super(reason);
  }
}

class StrictJsonScanner {
  private position = 0;

  constructor(private readonly text: string) {}

  scan(): void {
    this.skipWhitespace();
    this.scanValue(0);
    this.skipWhitespace();
    if (this.position !== this.text.length) this.fail();
  }

  private fail(reason: 'invalid-json' | 'duplicate-key' = 'invalid-json'): never {
    throw new StrictJsonError(reason);
  }

  private current(): string {
    return this.text[this.position] ?? '';
  }

  private skipWhitespace(): void {
    while (
      this.current() === ' ' ||
      this.current() === '\t' ||
      this.current() === '\r' ||
      this.current() === '\n'
    ) {
      this.position += 1;
    }
  }

  private scanValue(depth: number): void {
    if (depth > MAX_JSON_DEPTH) this.fail();

    const char = this.current();
    if (char === '{') {
      this.scanObject(depth + 1);
      return;
    }
    if (char === '[') {
      this.scanArray(depth + 1);
      return;
    }
    if (char === '"') {
      this.scanString();
      return;
    }
    if (char === 't') {
      this.scanLiteral('true');
      return;
    }
    if (char === 'f') {
      this.scanLiteral('false');
      return;
    }
    if (char === 'n') {
      this.scanLiteral('null');
      return;
    }
    this.scanNumber();
  }

  private scanObject(depth: number): void {
    this.position += 1;
    this.skipWhitespace();
    const keys = new Set<string>();

    if (this.current() === '}') {
      this.position += 1;
      return;
    }

    while (true) {
      if (this.current() !== '"') this.fail();
      const key = this.scanString();
      if (keys.has(key)) this.fail('duplicate-key');
      keys.add(key);

      this.skipWhitespace();
      if (this.current() !== ':') this.fail();
      this.position += 1;
      this.skipWhitespace();
      this.scanValue(depth);
      this.skipWhitespace();

      if (this.current() === '}') {
        this.position += 1;
        return;
      }
      if (this.current() !== ',') this.fail();
      this.position += 1;
      this.skipWhitespace();
    }
  }

  private scanArray(depth: number): void {
    this.position += 1;
    this.skipWhitespace();

    if (this.current() === ']') {
      this.position += 1;
      return;
    }

    while (true) {
      this.scanValue(depth);
      this.skipWhitespace();

      if (this.current() === ']') {
        this.position += 1;
        return;
      }
      if (this.current() !== ',') this.fail();
      this.position += 1;
      this.skipWhitespace();
    }
  }

  private scanString(): string {
    const start = this.position;
    this.position += 1;

    while (this.position < this.text.length) {
      const char = this.current();
      const code = this.text.charCodeAt(this.position);

      if (char === '"') {
        this.position += 1;
        try {
          return JSON.parse(this.text.slice(start, this.position)) as string;
        } catch {
          this.fail();
        }
      }

      if (code < 0x20) this.fail();

      if (char === '\\') {
        this.position += 1;
        const escaped = this.current();
        if ('"\\/bfnrt'.includes(escaped)) {
          this.position += 1;
          continue;
        }
        if (escaped === 'u') {
          const hex = this.text.slice(this.position + 1, this.position + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail();
          this.position += 5;
          continue;
        }
        this.fail();
      }

      this.position += 1;
    }

    this.fail();
  }

  private scanLiteral(value: 'true' | 'false' | 'null'): void {
    if (this.text.slice(this.position, this.position + value.length) !== value) {
      this.fail();
    }
    this.position += value.length;
  }

  private scanNumber(): void {
    const match = this.text
      .slice(this.position)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (!match) this.fail();
    this.position += match[0].length;
  }
}

export function parseOpenClawJsonStrict(text: string): OpenClawJsonResult {
  try {
    new StrictJsonScanner(text).scan();
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    if (error instanceof StrictJsonError) {
      return { ok: false, reason: error.reason };
    }
    return { ok: false, reason: 'invalid-json' };
  }
}
