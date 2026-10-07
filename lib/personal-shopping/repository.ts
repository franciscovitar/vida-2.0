import type {
  PersonalPurchaseEvent,
  PersonalPurchaseItem,
  PersonalPurchaseMutation,
} from './types';

export interface PersonalShoppingRepository {
  listItems(): Promise<PersonalPurchaseItem[]>;
  getItem(itemId: string): Promise<PersonalPurchaseItem | null>;
  findItemBySourceRef(sourceRef: string): Promise<PersonalPurchaseItem | null>;
  listEvents(itemId?: string): Promise<PersonalPurchaseEvent[]>;
  hasOperation(operationId: string): Promise<boolean>;
  saveItemsWithEvents(mutations: readonly PersonalPurchaseMutation[]): Promise<void>;
}
