/**
 * Idempotencia: memoria (tests) o store asíncrono persistente (runtime real).
 */
import { idempotencyDigest } from '@/lib/actions/opaque';
import type { ActionResult, IdempotencyKey } from '@/types/actions';

export interface IdempotencyStore {
  get(actor: string, actionType: string, key: IdempotencyKey): Promise<ActionResult | null>;
  set(actor: string, actionType: string, key: IdempotencyKey, result: ActionResult): Promise<void>;
}

function storageKey(actor: string, actionType: string, key: string): string {
  return `${idempotencyDigest(actor, actionType, key)}`;
}

export function createMemoryIdempotencyStore(): IdempotencyStore {
  const map = new Map<string, ActionResult>();
  return {
    async get(actor, actionType, key) {
      return map.get(storageKey(actor, actionType, key)) ?? null;
    },
    async set(actor, actionType, key, result) {
      map.set(storageKey(actor, actionType, key), result);
    },
  };
}

/** Store de proceso (solo tests / memoria explícita local). */
export const processIdempotencyStore = createMemoryIdempotencyStore();
