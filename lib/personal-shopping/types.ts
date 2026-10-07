export type PersonalPurchaseState = 'BUY' | 'RESEARCH' | 'REPLENISH' | 'PURCHASED' | 'DISCARDED';

export type PersonalPurchaseFinanceLinkState = 'none' | 'suggested' | 'linked';
export type PersonalPurchaseRecordStatus = 'active' | 'superseded';

export type PersonalPurchaseEventType =
  | 'CREATED'
  | 'MIGRATED'
  | 'STATE_CHANGED'
  | 'DETAIL_UPDATED'
  | 'PURCHASED'
  | 'DISCARDED'
  | 'RESTORED'
  | 'FINANCE_LINKED';

export interface PersonalPurchaseDetailPatch {
  need: string | null;
  quantityText: string | null;
  category: string | null;
  currency: string | null;
  estimatedPriceMinor: number | null;
  targetPriceMinor: number | null;
  purchaseCondition: string | null;
  notes: string | null;
  candidateLinks: string[];
  focus: boolean;
}

export interface PersonalPurchaseItem {
  id: string;
  title: string;
  state: PersonalPurchaseState;
  need: string | null;
  quantityText: string | null;
  category: string | null;
  currency: string | null;
  estimatedPriceMinor: number | null;
  targetPriceMinor: number | null;
  purchaseCondition: string | null;
  notes: string | null;
  candidateLinks: string[];
  focus: boolean;
  createdAt: string;
  updatedAt: string;
  purchasedAt: string | null;
  discardedAt: string | null;
  sourceRef: string | null;
  financeMovementId: string | null;
  financeLinkState: PersonalPurchaseFinanceLinkState;
  recordStatus: PersonalPurchaseRecordStatus;
}

export interface PersonalPurchaseEvent {
  id: string;
  itemId: string;
  eventType: PersonalPurchaseEventType;
  fromState: PersonalPurchaseState | null;
  toState: PersonalPurchaseState | null;
  occurredAt: string;
  operationId: string;
  changedFields: Record<string, unknown>;
}

export interface PersonalPurchaseMutation {
  item: PersonalPurchaseItem;
  event: PersonalPurchaseEvent;
}
