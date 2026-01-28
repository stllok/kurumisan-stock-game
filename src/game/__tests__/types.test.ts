import { describe, it, expect } from 'bun:test';

import {
  type Order,
  type OrderSide,
  type OrderType,
  type OrderStatus,
  type Trade,
  type Player,
  type Market,
  type OrderBook,
  type OrderResult,
} from '../types';

import type {
  MarketUpdate,
  OrderSubmissionInterface,
  MarketDataInterface,
  PlayerStateInterface,
} from '../interfaces';

describe('Types', () => {
  describe('OrderSide type', () => {
    it("should accept 'buy' and 'sell' values", () => {
      const buySide: OrderSide = 'buy';
      const sellSide: OrderSide = 'sell';

      expect(buySide).toBe('buy');
      expect(sellSide).toBe('sell');
    });
  });

  describe('OrderType type', () => {
    it("should accept 'limit' and 'market' values", () => {
      const limitType: OrderType = 'limit';
      const marketType: OrderType = 'market';

      expect(limitType).toBe('limit');
      expect(marketType).toBe('market');
    });
  });

  describe('OrderStatus type', () => {
    it('should accept all status values', () => {
      const pending: OrderStatus = 'pending';
      const filled: OrderStatus = 'filled';
      const cancelled: OrderStatus = 'cancelled';
      const partial: OrderStatus = 'partial';

      expect(pending).toBe('pending');
      expect(filled).toBe('filled');
      expect(cancelled).toBe('cancelled');
      expect(partial).toBe('partial');
    });
  });

  describe('Order interface', () => {
    it('should create a valid limit buy order', () => {
      const order: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'stock-abc',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      expect(order.id).toBe('order-1');
      expect(order.price).toBe(50.0);
      expect(order.type).toBe('limit');
    });

    it('should create a valid market sell order', () => {
      const order: Order = {
        id: 'order-2',
        playerId: 'player-2',
        itemId: 'stock-xyz',
        type: 'market',
        side: 'sell',
        quantity: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      expect(order.id).toBe('order-2');
      expect(order.price).toBeUndefined();
      expect(order.type).toBe('market');
    });

    it('should have all required properties', () => {
      const order: Order = {
        id: 'order-3',
        playerId: 'player-3',
        itemId: 'stock-def',
        type: 'limit',
        side: 'buy',
        quantity: 200,
        price: 25.0,
        timestamp: Date.now(),
        status: 'filled',
      };

      expect(order).toHaveProperty('id');
      expect(order).toHaveProperty('playerId');
      expect(order).toHaveProperty('itemId');
      expect(order).toHaveProperty('type');
      expect(order).toHaveProperty('side');
      expect(order).toHaveProperty('quantity');
      expect(order).toHaveProperty('timestamp');
      expect(order).toHaveProperty('status');
    });
  });

  describe('Trade interface', () => {
    it('should create a valid trade', () => {
      const trade: Trade = {
        id: 'trade-1',
        buyOrderId: 'order-buy-1',
        sellOrderId: 'order-sell-1',
        itemId: 'stock-abc',
        quantity: 100,
        price: 50.0,
        timestamp: Date.now(),
      };

      expect(trade.id).toBe('trade-1');
      expect(trade.buyOrderId).toBe('order-buy-1');
      expect(trade.sellOrderId).toBe('order-sell-1');
      expect(trade.quantity).toBe(100);
      expect(trade.price).toBe(50.0);
    });
  });

  describe('Player interface', () => {
    it('should create a valid player with inventory', () => {
      const inventory = new Map<string, number>();
      inventory.set('stock-abc', 100);
      inventory.set('stock-xyz', 50);

      const player: Player = {
        id: 'player-1',
        balance: 10000.0,
        inventory,
      };

      expect(player.id).toBe('player-1');
      expect(player.balance).toBe(10000.0);
      expect(player.inventory.get('stock-abc')).toBe(100);
      expect(player.inventory.get('stock-xyz')).toBe(50);
    });

    it('should create a player with empty inventory', () => {
      const player: Player = {
        id: 'player-2',
        balance: 5000.0,
        inventory: new Map(),
      };

      expect(player.inventory.size).toBe(0);
    });
  });

  describe('OrderBook interface', () => {
    it('should create an order book with bids and asks', () => {
      const bids: Order[] = [];
      const asks: Order[] = [];

      const orderBook: OrderBook = {
        bids,
        asks,
      };

      expect(orderBook.bids).toEqual([]);
      expect(orderBook.asks).toEqual([]);
    });
  });

  describe('Market interface', () => {
    it('should create a valid market', () => {
      const orderBook: OrderBook = {
        bids: [],
        asks: [],
      };

      const market: Market = {
        itemId: 'stock-abc',
        orderBook,
        currentPrice: 50.0,
        volatility: 0.1,
      };

      expect(market.itemId).toBe('stock-abc');
      expect(market.currentPrice).toBe(50.0);
      expect(market.volatility).toBe(0.1);
    });
  });

  describe('OrderResult interface', () => {
    it('should create a valid order result', () => {
      const trades: Trade[] = [];

      const orderResult: OrderResult = {
        orderId: 'order-1',
        status: 'filled',
        filledQuantity: 100,
        avgPrice: 50.0,
        trades,
      };

      expect(orderResult.orderId).toBe('order-1');
      expect(orderResult.status).toBe('filled');
      expect(orderResult.filledQuantity).toBe(100);
      expect(orderResult.avgPrice).toBe(50.0);
      expect(orderResult.trades).toEqual([]);
    });
  });
});

describe('Interfaces', () => {
  describe('MarketUpdate type', () => {
    it('should create a valid market update', () => {
      const marketUpdate: MarketUpdate = {
        itemId: 'stock-abc',
        currentPrice: 50.0,
        bestBid: 49.5,
        bestAsk: 50.5,
        timestamp: Date.now(),
      };

      expect(marketUpdate.itemId).toBe('stock-abc');
      expect(marketUpdate.currentPrice).toBe(50.0);
      expect(marketUpdate.bestBid).toBe(49.5);
      expect(marketUpdate.bestAsk).toBe(50.5);
    });
  });

  describe('OrderSubmissionInterface', () => {
    it('should define submitOrder method signature', () => {
      const mockInterface: OrderSubmissionInterface = {
        submitOrder: (_order: Order) => {
          return {
            _op: 'Primitive',
            effect_i0: undefined,
            effect_i1: undefined,
          } as never;
        },
      };

      expect(typeof mockInterface.submitOrder).toBe('function');
    });
  });

  describe('MarketDataInterface', () => {
    it('should define subscribeToMarket method signature', () => {
      const mockInterface: MarketDataInterface = {
        subscribeToMarket: (_itemId: string) => {
          return {
            _op: 'Primitive',
            effect_i0: undefined,
            effect_i1: undefined,
          } as never;
        },
      };

      expect(typeof mockInterface.subscribeToMarket).toBe('function');
    });
  });

  describe('PlayerStateInterface', () => {
    it('should define getPlayerState method signature', () => {
      const mockInterface: PlayerStateInterface = {
        getPlayerState: (_playerId: string) => {
          return {
            _op: 'Primitive',
            effect_i0: undefined,
            effect_i1: undefined,
          } as never;
        },
      };

      expect(typeof mockInterface.getPlayerState).toBe('function');
    });
  });
});
