/**
 * Codec for Notion Acciones payloadSanitized rich_text without silent truncation.
 * Chunks into rich_text fragments (≤1800 chars each); fail-closed on oversize.
 */
import { richTextProp } from '@/lib/actions/notion-client';

export const LEDGER_BAG_CHUNK_CHARS = 1800;
export const LEDGER_BAG_MAX_TOTAL_CHARS = 12_000;
export const LEDGER_BAG_CODEC_VERSION = 1 as const;

export type EncodedLedgerBag = {
  v: typeof LEDGER_BAG_CODEC_VERSION;
  chunks: string[];
};

export type EncodeLedgerBagResult =
  | { ok: true; encoded: EncodedLedgerBag; richTextProperty: Record<string, unknown> }
  | { ok: false; code: 'oversize'; message: string };

function isEncodedBag(value: unknown): value is EncodedLedgerBag {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (obj.v !== LEDGER_BAG_CODEC_VERSION) return false;
  if (!Array.isArray(obj.chunks)) return false;
  return obj.chunks.every((chunk) => typeof chunk === 'string');
}

export function encodePayloadBag(bag: Record<string, unknown>): EncodeLedgerBagResult {
  const serialized = JSON.stringify(bag);
  if (serialized.length > LEDGER_BAG_MAX_TOTAL_CHARS) {
    return {
      ok: false,
      code: 'oversize',
      message: 'Payload bag exceeds ledger size limit.',
    };
  }

  const chunks: string[] = [];
  for (let i = 0; i < serialized.length; i += LEDGER_BAG_CHUNK_CHARS) {
    chunks.push(serialized.slice(i, i + LEDGER_BAG_CHUNK_CHARS));
  }
  if (chunks.length === 0) chunks.push('{}');

  const encoded: EncodedLedgerBag = { v: LEDGER_BAG_CODEC_VERSION, chunks };
  const wire = JSON.stringify(encoded);
  if (wire.length > LEDGER_BAG_MAX_TOTAL_CHARS) {
    return {
      ok: false,
      code: 'oversize',
      message: 'Encoded payload bag exceeds ledger size limit.',
    };
  }

  // Notion rich_text: one fragment per chunk of the wire encoding itself if needed.
  const richChunks: { type: 'text'; text: { content: string } }[] = [];
  for (let i = 0; i < wire.length; i += LEDGER_BAG_CHUNK_CHARS) {
    richChunks.push({
      type: 'text',
      text: { content: wire.slice(i, i + LEDGER_BAG_CHUNK_CHARS) },
    });
  }

  return {
    ok: true,
    encoded,
    richTextProperty: { rich_text: richChunks },
  };
}

/**
 * Decodes rich_text plain string or legacy single-JSON bag.
 * Round-trips encodePayloadBag output.
 */
export function decodePayloadBag(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isEncodedBag(parsed)) {
      const joined = parsed.chunks.join('');
      const inner = JSON.parse(joined) as unknown;
      if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return {};
      return inner as Record<string, unknown>;
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/** Convenience: encode or throw fail-closed (for callers that cannot soft-fail). */
export function encodePayloadBagOrThrow(bag: Record<string, unknown>): Record<string, unknown> {
  const result = encodePayloadBag(bag);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.richTextProperty;
}

/** Single-fragment helper when bag is known small (audit/idem rows). */
export function encodePayloadBagAsRichTextProp(
  bag: Record<string, unknown>,
): Record<string, unknown> {
  const result = encodePayloadBag(bag);
  if (!result.ok) {
    throw new Error(result.message);
  }
  // Prefer multi-fragment property from codec; fall back to single richTextProp for tiny bags.
  if (
    result.richTextProperty.rich_text &&
    Array.isArray(result.richTextProperty.rich_text) &&
    result.richTextProperty.rich_text.length === 1
  ) {
    const only = result.richTextProperty.rich_text[0] as {
      text?: { content?: string };
    };
    const content = only.text?.content ?? '';
    if (content.length <= 2000) return richTextProp(content);
  }
  return result.richTextProperty;
}
