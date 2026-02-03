import { describe, it, expect } from 'bun:test';
import {
  ItemMetadata,
  createItemType,
  itemTypesEqual,
  itemTypeToJson,
  itemTypeFromJson,
} from '../item-type';

describe('item-type', () => {
  describe('createItemType', () => {
    it('should create an item type with default metadata', () => {
      const metadata: ItemMetadata = {
        name: 'Test Item',
        description: 'A test item',
        initialPrice: 100,
        volatility: 0.1,
      };

      const item = createItemType('test-001', metadata);

      expect(item.itemId).toBe('test-001');
      expect(item.metadata.name).toBe('Test Item');
      expect(item.metadata.description).toBe('A test item');
      expect(item.metadata.initialPrice).toBe(100);
      expect(item.metadata.volatility).toBe(0.1);
    });

    it('should create an item type with extended metadata', () => {
      interface ExtendedMetadata extends ItemMetadata {
        category: string;
        rarity: string;
      }

      const metadata: ExtendedMetadata = {
        name: 'Rare Sword',
        description: 'A powerful sword',
        initialPrice: 500,
        volatility: 0.15,
        category: 'weapon',
        rarity: 'rare',
      };

      const item = createItemType<ExtendedMetadata>('weapon-001', metadata);

      expect(item.itemId).toBe('weapon-001');
      expect(item.metadata.category).toBe('weapon');
      expect(item.metadata.rarity).toBe('rare');
      expect(item.metadata.name).toBe('Rare Sword');
    });

    it('should create immutable items', () => {
      const metadata: ItemMetadata = {
        name: 'Immutable Item',
        description: 'Cannot be changed',
        initialPrice: 100,
        volatility: 0.1,
      };

      const item = createItemType('immutable-001', metadata);

      // TypeScript should prevent this at compile time
      // At runtime, the object has readonly properties
      expect(() => {
        (item as unknown as { itemId: string }).itemId = 'changed';
      }).not.toThrow();

      // Metadata should be a copy, not the original
      metadata.name = 'Changed Original';
      expect(item.metadata.name).toBe('Immutable Item');
    });
  });

  describe('itemTypesEqual', () => {
    it('should return true for items with the same itemId', () => {
      const metadata1: ItemMetadata = {
        name: 'Item 1',
        description: 'First item',
        initialPrice: 100,
        volatility: 0.1,
      };

      const metadata2: ItemMetadata = {
        name: 'Item 2',
        description: 'Different item',
        initialPrice: 200,
        volatility: 0.2,
      };

      const item1 = createItemType('same-id', metadata1);
      const item2 = createItemType('same-id', metadata2);

      expect(itemTypesEqual(item1, item2)).toBe(true);
    });

    it('should return false for items with different itemId', () => {
      const metadata: ItemMetadata = {
        name: 'Item',
        description: 'An item',
        initialPrice: 100,
        volatility: 0.1,
      };

      const item1 = createItemType('id-001', metadata);
      const item2 = createItemType('id-002', metadata);

      expect(itemTypesEqual(item1, item2)).toBe(false);
    });

    it('should work with extended metadata types', () => {
      interface ExtendedMetadata extends ItemMetadata {
        extra: string;
      }

      const metadata1: ExtendedMetadata = {
        name: 'Item 1',
        description: 'First item',
        initialPrice: 100,
        volatility: 0.1,
        extra: 'value1',
      };

      const metadata2: ExtendedMetadata = {
        name: 'Item 2',
        description: 'Second item',
        initialPrice: 200,
        volatility: 0.2,
        extra: 'value2',
      };

      const item1 = createItemType<ExtendedMetadata>('same-id', metadata1);
      const item2 = createItemType<ExtendedMetadata>('same-id', metadata2);

      expect(itemTypesEqual(item1, item2)).toBe(true);
    });
  });

  describe('itemTypeToJson', () => {
    it('should serialize an item to JSON-compatible object', () => {
      const metadata: ItemMetadata = {
        name: 'Serializable Item',
        description: 'Can be serialized',
        initialPrice: 150,
        volatility: 0.12,
      };

      const item = createItemType('json-001', metadata);
      const json = itemTypeToJson(item);

      expect(json).toEqual({
        itemId: 'json-001',
        metadata: {
          name: 'Serializable Item',
          description: 'Can be serialized',
          initialPrice: 150,
          volatility: 0.12,
        },
      });
    });

    it('should serialize items with extended metadata', () => {
      interface ExtendedMetadata extends ItemMetadata {
        tags: string[];
      }

      const metadata: ExtendedMetadata = {
        name: 'Tagged Item',
        description: 'Has tags',
        initialPrice: 75,
        volatility: 0.08,
        tags: ['weapon', 'melee'],
      };

      const item = createItemType<ExtendedMetadata>('tagged-001', metadata);
      const json = itemTypeToJson(item);

      expect(json.metadata.tags).toEqual(['weapon', 'melee']);
    });

    it('should create a copy of metadata in JSON', () => {
      const metadata: ItemMetadata = {
        name: 'Item',
        description: 'Description',
        initialPrice: 100,
        volatility: 0.1,
      };

      const item = createItemType('copy-001', metadata);
      const json = itemTypeToJson(item);

      json.metadata.name = 'Changed';

      expect(item.metadata.name).toBe('Item');
      expect(json.metadata.name).toBe('Changed');
    });
  });

  describe('itemTypeFromJson', () => {
    it('should create an item from JSON-compatible object', () => {
      const json = {
        itemId: 'json-001',
        metadata: {
          name: 'Deserialized Item',
          description: 'Created from JSON',
          initialPrice: 200,
          volatility: 0.15,
        },
      };

      const item = itemTypeFromJson<ItemMetadata>(json);

      expect(item.itemId).toBe('json-001');
      expect(item.metadata.name).toBe('Deserialized Item');
      expect(item.metadata.description).toBe('Created from JSON');
      expect(item.metadata.initialPrice).toBe(200);
      expect(item.metadata.volatility).toBe(0.15);
    });

    it('should work with extended metadata types', () => {
      interface ExtendedMetadata extends ItemMetadata {
        isLegendary: boolean;
      }

      const json = {
        itemId: 'legend-001',
        metadata: {
          name: 'Legendary Item',
          description: 'Very rare',
          initialPrice: 1000,
          volatility: 0.05,
          isLegendary: true,
        },
      };

      const item = itemTypeFromJson<ExtendedMetadata>(json);

      expect(item.metadata.isLegendary).toBe(true);
    });

    it('should round-trip with itemTypeToJson', () => {
      const metadata: ItemMetadata = {
        name: 'Round Trip',
        description: 'Goes there and back',
        initialPrice: 300,
        volatility: 0.2,
      };

      const original = createItemType('round-001', metadata);
      const json = itemTypeToJson(original);
      const restored = itemTypeFromJson<ItemMetadata>(json);

      expect(restored.itemId).toBe(original.itemId);
      expect(restored.metadata.name).toBe(original.metadata.name);
      expect(restored.metadata.description).toBe(original.metadata.description);
      expect(restored.metadata.initialPrice).toBe(original.metadata.initialPrice);
      expect(restored.metadata.volatility).toBe(original.metadata.volatility);
    });
  });

  describe('metadata access', () => {
    it('should allow reading all metadata fields', () => {
      const metadata: ItemMetadata = {
        name: 'Readable Item',
        description: 'All fields accessible',
        initialPrice: 120,
        volatility: 0.11,
      };

      const item = createItemType('read-001', metadata);

      expect(item.metadata.name).toBe('Readable Item');
      expect(item.metadata.description).toBe('All fields accessible');
      expect(item.metadata.initialPrice).toBe(120);
      expect(item.metadata.volatility).toBe(0.11);
    });

    it('should support destructuring of metadata', () => {
      const metadata: ItemMetadata = {
        name: 'Destructurable',
        description: 'Can be destructured',
        initialPrice: 180,
        volatility: 0.18,
      };

      const item = createItemType('destruct-001', metadata);

      const { name, description, initialPrice, volatility } = item.metadata;

      expect(name).toBe('Destructurable');
      expect(description).toBe('Can be destructured');
      expect(initialPrice).toBe(180);
      expect(volatility).toBe(0.18);
    });
  });
});
