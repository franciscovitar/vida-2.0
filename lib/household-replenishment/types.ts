export type HouseholdRole = 'OWNER' | 'MEMBER';

export type ReplenishmentConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type ReplenishmentState = 'NOT_DUE' | 'WATCH' | 'ADD_TO_LIST' | 'OVERDUE';

export type ShoppingListOrigin = 'AUTO' | 'MANUAL' | 'CORRECTION';

export type ShoppingListState = 'ACTIVE' | 'BOUGHT' | 'SKIPPED' | 'SNOOZED';

export type CorrectionEventType =
  'STILL_HAVE' | 'LOW' | 'OUT' | 'SNOOZE' | 'MANUAL_ADD' | 'ALREADY_BOUGHT';

export type UserCorrectionType = Extract<CorrectionEventType, 'STILL_HAVE' | 'LOW' | 'OUT'>;

export type PredictedStockState = Extract<UserCorrectionType, 'LOW' | 'OUT'>;

export interface Household {
  id: string;
  name: string;
  createdAt: string;
  defaultStore?: string | null;
  categoryOrder?: string[];
}

export interface ReplenishmentNeed {
  id: string;
  householdId: string;
  name: string;
  category: string;
  manualSeedIntervalDays: number | null;
  active: boolean;
  createdAt: string;
}

export interface ProductVariant {
  id: string;
  needId: string;
  name: string;
  brand: string | null;
  gtin: string | null;
  packSize: number | null;
  unit: string | null;
  preferred: boolean;
}

export interface ShoppingListItem {
  id: string;
  householdId: string;
  needId: string;
  origin: ShoppingListOrigin;
  state: ShoppingListState;
  addedAt: string;
  operationId: string;
}

export interface PurchaseEvent {
  id: string;
  householdId: string;
  needId: string;
  variantId: string | null;
  purchasedAt: string;
  source: ShoppingListOrigin;
  createdBy: string;
  operationId: string;
}

export interface CorrectionEvent {
  id: string;
  householdId: string;
  needId: string;
  type: CorrectionEventType;
  occurredAt: string;
  createdBy: string;
  operationId: string;
}

export interface CadenceEstimate {
  expectedIntervalDays: number | null;
  variabilityDays: number | null;
  nextExpectedAt: string | null;
  suggestAt: string | null;
  confidence: ReplenishmentConfidence;
  state: ReplenishmentState;
  forcedByCorrection: UserCorrectionType | null;
  observations: number;
}

export interface ReplenishmentVariantOption {
  id: string;
  name: string;
  preferred: boolean;
}

export interface ReplenishmentListEntry {
  needId: string;
  name: string;
  category: string;
  origin: ShoppingListOrigin;
  confidence: ReplenishmentConfidence;
  predictedStock: PredictedStockState | null;
  reason: string;
  expectedIntervalDays: number | null;
  nextExpectedAt: string | null;
  lastPurchasedAt: string | null;
  lastPurchasedVariantId: string | null;
  lastPurchasedVariantName: string | null;
  variants: ReplenishmentVariantOption[];
}

export type ReplenishmentCatalogStatus = 'BUY' | 'WATCH' | 'IDLE';

export interface ReplenishmentCatalogEntry {
  needId: string;
  name: string;
  category: string;
  status: ReplenishmentCatalogStatus;
  confidence: ReplenishmentConfidence;
  expectedIntervalDays: number | null;
  nextExpectedAt: string | null;
  lastPurchasedAt: string | null;
  lastPurchasedVariantId: string | null;
  lastPurchasedVariantName: string | null;
  variants: ReplenishmentVariantOption[];
}

export type PredictionQualityStatus = 'NO_DATA' | 'COLLECTING' | 'CALIBRATION_READY';

export interface PredictionQualitySummary {
  status: PredictionQualityStatus;
  activeNeeds: number;
  needsWithPurchases: number;
  needsWithThreePurchases: number;
  evaluatedPredictions: number;
  meanAbsoluteErrorDays: number | null;
  medianAbsoluteErrorDays: number | null;
  withinToleranceRate: number | null;
  earlyCount: number;
  lateCount: number;
  withinToleranceCount: number;
  stillHaveCorrections: number;
  outCorrections: number;
}

export interface HouseholdShoppingPreferences {
  defaultStore: string | null;
  categoryOrder: string[];
}

export interface ReplenishmentSnapshot {
  householdName: string;
  shoppingPreferences: HouseholdShoppingPreferences;
  quality: PredictionQualitySummary;
  catalog: ReplenishmentCatalogEntry[];
  buy: ReplenishmentListEntry[];
  watch: ReplenishmentListEntry[];
}

export type ReplenishmentMutationCode = 'applied' | 'idempotent' | 'existing';

export interface ReplenishmentMutationSuccess {
  ok: true;
  code: ReplenishmentMutationCode;
  snapshot: ReplenishmentSnapshot;
}

export interface ReplenishmentMutationFailure {
  ok: false;
  code: 'invalid-input' | 'not-found';
  message: string;
}

export type ReplenishmentMutationResult =
  ReplenishmentMutationSuccess | ReplenishmentMutationFailure;
