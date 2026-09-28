import type { ReplenishmentRepository } from './repository';
import type {
  CorrectionEvent,
  Household,
  PurchaseEvent,
  ReplenishmentNeed,
  ShoppingListItem,
} from './types';

function clone<T extends object>(value: T): T {
  return { ...value };
}

function normalizeName(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export class MemoryReplenishmentRepository implements ReplenishmentRepository {
  private readonly households = new Map<string, Household>();
  private readonly needs = new Map<string, ReplenishmentNeed>();
  private readonly shoppingItems = new Map<string, ShoppingListItem>();
  private readonly purchases = new Map<string, PurchaseEvent>();
  private readonly corrections = new Map<string, CorrectionEvent>();
  private readonly operations = new Set<string>();

  constructor(seed: { households?: Household[] } = {}) {
    for (const household of seed.households ?? []) {
      this.households.set(household.id, clone(household));
    }
  }

  async getHousehold(householdId: string): Promise<Household | null> {
    const household = this.households.get(householdId);
    return household ? clone(household) : null;
  }

  async putHousehold(household: Household): Promise<void> {
    this.households.set(household.id, clone(household));
  }

  async listNeeds(householdId: string): Promise<ReplenishmentNeed[]> {
    return [...this.needs.values()].filter((need) => need.householdId === householdId).map(clone);
  }

  async getNeed(householdId: string, needId: string): Promise<ReplenishmentNeed | null> {
    const need = this.needs.get(needId);
    return need?.householdId === householdId ? clone(need) : null;
  }

  async findNeedByName(
    householdId: string,
    normalizedName: string,
  ): Promise<ReplenishmentNeed | null> {
    const need = [...this.needs.values()].find(
      (candidate) =>
        candidate.householdId === householdId && normalizeName(candidate.name) === normalizedName,
    );
    return need ? clone(need) : null;
  }

  async putNeed(need: ReplenishmentNeed): Promise<void> {
    this.needs.set(need.id, clone(need));
  }

  async listShoppingItems(householdId: string): Promise<ShoppingListItem[]> {
    return [...this.shoppingItems.values()]
      .filter((item) => item.householdId === householdId)
      .map(clone);
  }

  async putShoppingItem(item: ShoppingListItem): Promise<void> {
    this.shoppingItems.set(item.id, clone(item));
  }

  async listPurchaseEvents(householdId: string, needId?: string): Promise<PurchaseEvent[]> {
    return [...this.purchases.values()]
      .filter(
        (event) => event.householdId === householdId && (needId == null || event.needId === needId),
      )
      .map(clone);
  }

  async appendPurchaseEvent(event: PurchaseEvent): Promise<void> {
    this.purchases.set(event.id, clone(event));
  }

  async listCorrectionEvents(householdId: string, needId?: string): Promise<CorrectionEvent[]> {
    return [...this.corrections.values()]
      .filter(
        (event) => event.householdId === householdId && (needId == null || event.needId === needId),
      )
      .map(clone);
  }

  async appendCorrectionEvent(event: CorrectionEvent): Promise<void> {
    this.corrections.set(event.id, clone(event));
  }

  async hasOperation(householdId: string, operationId: string): Promise<boolean> {
    return this.operations.has(`${householdId}:${operationId}`);
  }

  async recordOperation(householdId: string, operationId: string): Promise<void> {
    this.operations.add(`${householdId}:${operationId}`);
  }
}
