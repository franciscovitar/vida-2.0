/**
 * Idempotencia en memoria (proceso). Suficiente para tests y Preview controlada.
 */
import type { ActionResult, IdempotencyKey } from '@/types/actions';

export interface IdempotencyStore {
  get(actor: string, actionType: string, key: IdempotencyKey): ActionResult | null;
  set(actor: string, actionType: string, key: IdempotencyKey, result: ActionResult): void;
}

function storageKey(actor: string, actionType: string, key: string): string {
  return `${actor}::${actionType}::${key}`;
}

export function createMemoryIdempotencyStore(): IdempotencyStore {
  const map = new Map<string, ActionResult>();
  return {
    get(actor, actionType, key) {
      return map.get(storageKey(actor, actionType, key)) ?? null;
    },
    set(actor, actionType, key, result) {
      map.set(storageKey(actor, actionType, key), result);
    },
  };
}

/** Store de proceso (singleton blando). */
export const processIdempotencyStore = createMemoryIdempotencyStore();
