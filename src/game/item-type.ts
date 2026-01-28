export interface ItemMetadata {
  name: string;
  description: string;
  initialPrice: number;
  volatility: number;
}

export interface ItemType<T extends ItemMetadata = ItemMetadata> {
  readonly itemId: string;
  readonly metadata: T;
}

export function createItemType<T extends ItemMetadata>(itemId: string, metadata: T): ItemType<T> {
  return {
    itemId,
    metadata: { ...metadata }, // Shallow copy for immutability
  };
}

export function itemTypesEqual<T extends ItemMetadata>(a: ItemType<T>, b: ItemType<T>): boolean {
  return a.itemId === b.itemId;
}

export function itemTypeToJson<T extends ItemMetadata>(
  item: ItemType<T>
): { itemId: string; metadata: T } {
  return {
    itemId: item.itemId,
    metadata: { ...item.metadata },
  };
}

export function itemTypeFromJson<T extends ItemMetadata>(json: {
  itemId: string;
  metadata: T;
}): ItemType<T> {
  return createItemType(json.itemId, json.metadata);
}
