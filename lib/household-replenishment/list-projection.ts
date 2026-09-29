import type { CadenceEstimate, ShoppingListItem, ShoppingListOrigin } from './types';

export type AutomaticListBucket = 'BUY' | 'WATCH' | 'NONE';

export type AutomaticListReason =
  'ACTIVE_ITEM' | 'CORRECTION_LOW' | 'CORRECTION_OUT' | 'AUTO_DUE' | 'AUTO_WATCH' | 'NONE';

export interface AutomaticListDecision {
  bucket: AutomaticListBucket;
  origin: ShoppingListOrigin | null;
  reason: AutomaticListReason;
}

export function projectNeedListState(input: {
  activeItem: ShoppingListItem | null;
  estimate: CadenceEstimate;
}): AutomaticListDecision {
  if (input.activeItem) {
    return {
      bucket: 'BUY',
      origin: input.activeItem.origin,
      reason: 'ACTIVE_ITEM',
    };
  }

  if (input.estimate.state === 'ADD_TO_LIST' || input.estimate.state === 'OVERDUE') {
    if (input.estimate.forcedByCorrection === 'LOW') {
      return {
        bucket: 'BUY',
        origin: 'CORRECTION',
        reason: 'CORRECTION_LOW',
      };
    }
    if (input.estimate.forcedByCorrection === 'OUT') {
      return {
        bucket: 'BUY',
        origin: 'CORRECTION',
        reason: 'CORRECTION_OUT',
      };
    }
    return {
      bucket: 'BUY',
      origin: 'AUTO',
      reason: 'AUTO_DUE',
    };
  }

  if (input.estimate.state === 'WATCH') {
    return {
      bucket: 'WATCH',
      origin: 'AUTO',
      reason: 'AUTO_WATCH',
    };
  }

  return {
    bucket: 'NONE',
    origin: null,
    reason: 'NONE',
  };
}
