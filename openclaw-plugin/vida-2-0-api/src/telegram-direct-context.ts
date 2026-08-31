export type TrustedTelegramDirectContext = {
  readonly runId: string;
  readonly senderId: string;
  readonly messageId: string;
};

type StoredRun = TrustedTelegramDirectContext & { readonly expiresAt: number };
type StoredToolCall = TrustedTelegramDirectContext & { readonly expiresAt: number };

type TelegramDirectContextStoreOptions = {
  now?: () => number;
  ttlMs?: number;
};

export type TelegramDirectContextStore = {
  record(input: TrustedTelegramDirectContext): boolean;
  bindToolCall(runId: string, toolCallId: string): boolean;
  consumeToolCall(toolCallId: string): TrustedTelegramDirectContext | null;
  clearRun(runId: string): void;
  clear(): void;
};

const SAFE_RUNTIME_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_TOOL_CALL_ID = /^[A-Za-z0-9._:-]{1,256}$/;
const DEFAULT_TTL_MS = 5 * 60_000;

function isSafeRuntimeId(value: string): boolean {
  return SAFE_RUNTIME_ID.test(value);
}

function isSafeToolCallId(value: string): boolean {
  return SAFE_TOOL_CALL_ID.test(value);
}

export function createTelegramDirectContextStore(
  options: TelegramDirectContextStoreOptions = {},
): TelegramDirectContextStore {
  const now = options.now ?? Date.now;
  const ttlMs =
    Number.isFinite(options.ttlMs) && (options.ttlMs ?? 0) > 0
      ? Math.floor(options.ttlMs!)
      : DEFAULT_TTL_MS;
  const runs = new Map<string, StoredRun>();
  const toolCalls = new Map<string, StoredToolCall>();

  function sweep(at: number): void {
    for (const [key, value] of runs) {
      if (value.expiresAt <= at) runs.delete(key);
    }
    for (const [key, value] of toolCalls) {
      if (value.expiresAt <= at) toolCalls.delete(key);
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

    bindToolCall(runId, toolCallId) {
      const at = now();
      sweep(at);
      if (!isSafeRuntimeId(runId) || !isSafeToolCallId(toolCallId)) return false;
      if (toolCalls.has(toolCallId)) return false;
      const trusted = runs.get(runId);
      if (!trusted) return false;
      toolCalls.set(toolCallId, {
        runId: trusted.runId,
        senderId: trusted.senderId,
        messageId: trusted.messageId,
        expiresAt: Math.min(trusted.expiresAt, at + ttlMs),
      });
      return true;
    },

    consumeToolCall(toolCallId) {
      const at = now();
      sweep(at);
      if (!isSafeToolCallId(toolCallId)) return null;
      const trusted = toolCalls.get(toolCallId);
      if (!trusted) return null;
      toolCalls.delete(toolCallId);
      if (trusted.expiresAt <= at) return null;
      return {
        runId: trusted.runId,
        senderId: trusted.senderId,
        messageId: trusted.messageId,
      };
    },

    clearRun(runId) {
      runs.delete(runId);
      for (const [key, value] of toolCalls) {
        if (value.runId === runId) toolCalls.delete(key);
      }
    },

    clear() {
      runs.clear();
      toolCalls.clear();
    },
  };
}
