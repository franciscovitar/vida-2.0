import type { PersonalShoppingRepository } from './repository';
import type {
  PersonalPurchaseEvent,
  PersonalPurchaseItem,
  PersonalPurchaseMutation,
} from './types';

export class MemoryPersonalShoppingRepository implements PersonalShoppingRepository {
  private readonly items = new Map<string, PersonalPurchaseItem>();
  private readonly events: PersonalPurchaseEvent[] = [];

  constructor(seed: { items?: PersonalPurchaseItem[]; events?: PersonalPurchaseEvent[] } = {}) {
    for (const item of seed.items ?? []) this.items.set(item.id, { ...item });
    this.events.push(...(seed.events ?? []).map((event) => ({ ...event })));
  }

  async listItems(): Promise<PersonalPurchaseItem[]> {
    return [...this.items.values()].map((item) => ({ ...item }));
  }

  async getItem(itemId: string): Promise<PersonalPurchaseItem | null> {
    const item = this.items.get(itemId);
    return item ? { ...item } : null;
  }

  async findItemBySourceRef(sourceRef: string): Promise<PersonalPurchaseItem | null> {
    const item = [...this.items.values()].find((candidate) => candidate.sourceRef === sourceRef);
    return item ? { ...item } : null;
  }

  async listEvents(itemId?: string): Promise<PersonalPurchaseEvent[]> {
    return this.events
      .filter((event) => itemId == null || event.itemId === itemId)
      .map((event) => ({ ...event }));
  }

  async hasOperation(operationId: string): Promise<boolean> {
    return this.events.some((event) => event.operationId === operationId);
  }

  async saveItemsWithEvents(mutations: readonly PersonalPurchaseMutation[]): Promise<void> {
    const seenOperations = new Set(this.events.map((event) => event.operationId));
    for (const mutation of mutations) {
      if (seenOperations.has(mutation.event.operationId)) continue;
      this.items.set(mutation.item.id, { ...mutation.item });
      this.events.push({ ...mutation.event });
      seenOperations.add(mutation.event.operationId);
    }
  }
}
