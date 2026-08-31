import { randomBytes } from 'node:crypto';

export type TrustedTelegramDirectContext = {
  readonly runId: string;
  readonly senderId: string;
  readonly messageId: string;
};

type StoredRun = TrustedTelegramDirectContext & { readonly expiresAt: number };
type StoredToken = TrustedTelegramDirectContext & { readonly expiresAt: number };

type TelegramDirectContextStoreOptions = {
  now?: () => number;
  token?: () => string;
  ttlMs?: number;
};

export type TelegramDirectContextStore = {
  record(input: TrustedTelegramDirectContext): boolean;
  issue(runId: string): string | null;
  consume(token: string): TrustedTelegramDirectContext | null;
  clearRun(runId: string): void;
  clear(): void;
};

const SAFE_RUNTIME_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const DEFAULT_TTL_MS = 5 * 60_000;

function isSafeRuntimeId(value: string): boolean {
  return SAFE_RUNTIME_ID.test(value);
}

export function createTelegramDirectContextStore(
  options: TelegramDirectContextStoreOptions = {},
): TelegramDirectContextStore {
  const now = options.now ?? Date.now;
  const token = options.token ?? (() => randomBytes(24).toString('hex'));
  const ttlMs =
    Number.isFinite(options.ttlMs) && (options.ttlMs ?? 0) > 0
      ? Math.floor(options.ttlMs!)
      : DEFAULT_TTL_MS;
  const runs = new Map<string, StoredRun>();
  const tokens = new Map<string, StoredToken>();

  function sweep(at: number): void {
    for (const [key, value] of runs) {
      if (value.expiresAt <= at) runs.delete(key);
    }
    for (const [key, value] of tokens) {
      if (value.expiresAt <= at) tokens.delete(key);
    }
  }

  return {
    record(input) {
      const at = now();
      sweep(at);
      if (
        !isSafeRuntimeId(input.runId) ||
        !isSafeRuntimeId(input.senderId) ||
        !isSafeRuntimeId(input.messageId)
      ) {
        return false;
      }
      runs.set(input.runId, { ...input, expiresAt: at + ttlMs });
      return true;
    },

    issue(runId) {
      const at = now();
      sweep(at);
      if (!isSafeRuntimeId(runId)) return null;
      const trusted = runs.get(runId);
      if (!trusted) return null;

      const nextToken = token();
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(nextToken) || tokens.has(nextToken)) return null;
      tokens.set(nextToken, {
        runId: trusted.runId,
        senderId: trusted.senderId,
        messageId: trusted.messageId,
        expiresAt: Math.min(trusted.expiresAt, at + ttlMs),
      });
      return nextToken;
    },

    consume(rawToken) {
      const at = now();
      sweep(at);
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(rawToken)) return null;
      const trusted = tokens.get(rawToken);
      if (!trusted) return null;
      tokens.delete(rawToken);
      if (trusted.expiresAt <= at) return null;
      return {
        runId: trusted.runId,
        senderId: trusted.senderId,
        messageId: trusted.messageId,
      };
    },

    clearRun(runId) {
      runs.delete(runId);
      for (const [key, value] of tokens) {
        if (value.runId === runId) tokens.delete(key);
      }
    },

    clear() {
      runs.clear();
      tokens.clear();
    },
  };
}
