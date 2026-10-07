import type {
  PersonalPurchaseEvent,
  PersonalPurchaseEventType,
  PersonalPurchaseItem,
  PersonalPurchaseMutation,
  PersonalPurchaseState,
} from './types';

const TRANSITIONS: Record<PersonalPurchaseState, readonly PersonalPurchaseState[]> = {
  BUY: ['PURCHASED', 'RESEARCH', 'DISCARDED'],
  RESEARCH: ['BUY', 'DISCARDED'],
  REPLENISH: ['PURCHASED', 'BUY', 'DISCARDED'],
  PURCHASED: ['BUY', 'RESEARCH', 'REPLENISH'],
  DISCARDED: ['BUY', 'RESEARCH', 'REPLENISH'],
};

export function normalizePersonalPurchaseTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizePersonalPurchaseCurrency(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? '';
  return normalized || null;
}

export function isPersonalPurchaseState(value: string): value is PersonalPurchaseState {
  return ['BUY', 'RESEARCH', 'REPLENISH', 'PURCHASED', 'DISCARDED'].includes(value);
}

export function canTransitionPersonalPurchase(
  from: PersonalPurchaseState,
  to: PersonalPurchaseState,
): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function transitionPersonalPurchaseItem(
  item: PersonalPurchaseItem,
  toState: PersonalPurchaseState,
  occurredAt: string,
): PersonalPurchaseItem {
  if (!canTransitionPersonalPurchase(item.state, toState)) {
    throw new RangeError(`Invalid personal purchase transition: ${item.state} -> ${toState}`);
  }

  if (item.state === toState) {
    return { ...item, updatedAt: occurredAt };
  }

  return {
    ...item,
    state: toState,
    updatedAt: occurredAt,
    purchasedAt: toState === 'PURCHASED' ? occurredAt : null,
    discardedAt: toState === 'DISCARDED' ? occurredAt : null,
  };
}

function eventTypeForTransition(
  fromState: PersonalPurchaseState,
  toState: PersonalPurchaseState,
): PersonalPurchaseEventType {
  if (toState === 'PURCHASED') return 'PURCHASED';
  if (toState === 'DISCARDED') return 'DISCARDED';
  if (fromState === 'PURCHASED' || fromState === 'DISCARDED') return 'RESTORED';
  return 'STATE_CHANGED';
}

export function buildPersonalPurchaseTransition(input: {
  item: PersonalPurchaseItem;
  toState: PersonalPurchaseState;
  occurredAt: string;
  eventId: string;
  operationId: string;
}): PersonalPurchaseMutation {
  const nextItem = transitionPersonalPurchaseItem(input.item, input.toState, input.occurredAt);
  const event: PersonalPurchaseEvent = {
    id: input.eventId,
    itemId: input.item.id,
    eventType: eventTypeForTransition(input.item.state, input.toState),
    fromState: input.item.state,
    toState: input.toState,
    occurredAt: input.occurredAt,
    operationId: input.operationId,
    changedFields: { state: input.toState },
  };
  return { item: nextItem, event };
}

export function validatePersonalPurchaseItem(item: PersonalPurchaseItem): void {
  if (!item.id.trim()) throw new RangeError('Personal purchase item requires an id');
  if (!normalizePersonalPurchaseTitle(item.title)) {
    throw new RangeError('Personal purchase item requires a title');
  }
  if (!isPersonalPurchaseState(item.state)) {
    throw new RangeError('Personal purchase item has an invalid state');
  }
  for (const amount of [item.estimatedPriceMinor, item.targetPriceMinor]) {
    if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0)) {
      throw new RangeError('Personal purchase money must use non-negative integer minor units');
    }
  }
}
