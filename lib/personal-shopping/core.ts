import type {
  PersonalPurchaseDetailPatch,
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

const DETAIL_LIMITS = {
  need: 500,
  quantityText: 80,
  category: 120,
  purchaseCondition: 500,
  notes: 5000,
} as const;

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

function normalizeOptionalDetail(
  value: string | null,
  key: keyof typeof DETAIL_LIMITS,
): string | null {
  const normalized = value?.trim() ?? '';
  if (!normalized) return null;
  if (normalized.length > DETAIL_LIMITS[key]) {
    throw new RangeError(`Personal purchase ${key} is too long`);
  }
  return normalized;
}

function normalizeCandidateLinks(values: readonly string[]): string[] {
  if (values.length > 12) {
    throw new RangeError('Personal purchase supports up to 12 candidate links');
  }

  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    if (normalized.length > 2048) {
      throw new RangeError('Personal purchase candidate link is too long');
    }

    let url: URL;
    try {
      url = new URL(normalized);
    } catch {
      throw new RangeError('Personal purchase candidate link must be a valid URL');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new RangeError('Personal purchase candidate link must use http or https');
    }
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    output.push(url.href);
  }
  return output;
}

export function normalizePersonalPurchaseDetailPatch(
  patch: PersonalPurchaseDetailPatch,
): PersonalPurchaseDetailPatch {
  const currency = normalizePersonalPurchaseCurrency(patch.currency);
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) {
    throw new RangeError('Personal purchase currency must use a 3-letter code');
  }

  for (const amount of [patch.estimatedPriceMinor, patch.targetPriceMinor]) {
    if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0)) {
      throw new RangeError('Personal purchase money must use non-negative integer minor units');
    }
  }
  if (
    (patch.estimatedPriceMinor !== null || patch.targetPriceMinor !== null) &&
    currency === null
  ) {
    throw new RangeError('Personal purchase priced details require a currency');
  }

  return {
    need: normalizeOptionalDetail(patch.need, 'need'),
    quantityText: normalizeOptionalDetail(patch.quantityText, 'quantityText'),
    category: normalizeOptionalDetail(patch.category, 'category'),
    currency,
    estimatedPriceMinor: patch.estimatedPriceMinor,
    targetPriceMinor: patch.targetPriceMinor,
    purchaseCondition: normalizeOptionalDetail(patch.purchaseCondition, 'purchaseCondition'),
    notes: normalizeOptionalDetail(patch.notes, 'notes'),
    candidateLinks: normalizeCandidateLinks(patch.candidateLinks),
    focus: patch.focus,
  };
}

function detailValuesEqual(
  left: PersonalPurchaseDetailPatch[keyof PersonalPurchaseDetailPatch],
  right: PersonalPurchaseDetailPatch[keyof PersonalPurchaseDetailPatch],
): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return left === right;
}

export function buildPersonalPurchaseDetailUpdate(input: {
  item: PersonalPurchaseItem;
  patch: PersonalPurchaseDetailPatch;
  occurredAt: string;
  eventId: string;
  operationId: string;
}): PersonalPurchaseMutation | null {
  const patch = normalizePersonalPurchaseDetailPatch(input.patch);
  const fields = (Object.keys(patch) as Array<keyof PersonalPurchaseDetailPatch>).filter(
    (key) => !detailValuesEqual(input.item[key], patch[key]),
  );
  if (fields.length === 0) return null;

  const nextItem: PersonalPurchaseItem = {
    ...input.item,
    ...patch,
    updatedAt: input.occurredAt,
  };
  validatePersonalPurchaseItem(nextItem);

  const event: PersonalPurchaseEvent = {
    id: input.eventId,
    itemId: input.item.id,
    eventType: 'DETAIL_UPDATED',
    fromState: input.item.state,
    toState: input.item.state,
    occurredAt: input.occurredAt,
    operationId: input.operationId,
    changedFields: { fields },
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
