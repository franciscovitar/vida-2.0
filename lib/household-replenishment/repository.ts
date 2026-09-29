import type {
  CorrectionEvent,
  Household,
  ProductVariant,
  PurchaseEvent,
  ReplenishmentNeed,
  ShoppingListItem,
} from './types';

export interface ReplenishmentRepository {
  getHousehold(householdId: string): Promise<Household | null>;
  putHousehold(household: Household): Promise<void>;

  listNeeds(householdId: string): Promise<ReplenishmentNeed[]>;
  getNeed(householdId: string, needId: string): Promise<ReplenishmentNeed | null>;
  findNeedByName(householdId: string, normalizedName: string): Promise<ReplenishmentNeed | null>;
  putNeed(need: ReplenishmentNeed): Promise<void>;

  listVariants(householdId: string, needId?: string): Promise<ProductVariant[]>;
  findVariantByName(
    householdId: string,
    needId: string,
    normalizedName: string,
  ): Promise<ProductVariant | null>;
  putVariant(householdId: string, variant: ProductVariant): Promise<void>;

  listShoppingItems(householdId: string): Promise<ShoppingListItem[]>;
  putShoppingItem(item: ShoppingListItem): Promise<void>;

  listPurchaseEvents(householdId: string, needId?: string): Promise<PurchaseEvent[]>;
  appendPurchaseEvent(event: PurchaseEvent): Promise<void>;

  listCorrectionEvents(householdId: string, needId?: string): Promise<CorrectionEvent[]>;
  appendCorrectionEvent(event: CorrectionEvent): Promise<void>;

  hasOperation(householdId: string, operationId: string): Promise<boolean>;
  recordOperation(householdId: string, operationId: string): Promise<void>;
}
