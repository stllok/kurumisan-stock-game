import { describe, it, expect, beforeEach } from 'bun:test';
import { OrderBook } from '../order-book';
import type { Order, OrderStatus, OrderType, OrderSide } from '../types';

describe('OrderBook', () => {
  let orderBook: OrderBook;

  beforeEach(() => {
    orderBook = new OrderBook();
  });

  describe('constructor', () => {
    it('should create empty order book', () => {
      expect(orderBook.getBids()).toEqual([]);
      expect(orderBook.getAsks()).toEqual([]);
      expect(orderBook.getBestBid()).toBeNull();
      expect(orderBook.getBestAsk()).toBeNull();
    });

    it('should have zero depth initially', () => {
      expect(orderBook.getBidDepth()).toBe(0);
      expect(orderBook.getAskDepth()).toBe(0);
    });
  });

  describe('addOrder', () => {
    it('should add buy order to bids', () => {
      const order: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(order);

      expect(orderBook.getBids()).toHaveLength(1);
      expect(orderBook.getBids()[0]).toEqual(order);
      expect(orderBook.getAsks()).toHaveLength(0);
    });

    it('should add sell order to asks', () => {
      const order: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(order);

      expect(orderBook.getAsks()).toHaveLength(1);
      expect(orderBook.getAsks()[0]).toEqual(order);
      expect(orderBook.getBids()).toHaveLength(0);
    });

    it('should maintain price-time priority for bids', () => {
      const baseTime = Date.now();
      const order1: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: baseTime,
        status: 'pending',
      };

      const order2: Order = {
        id: 'bid-2',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 55,
        timestamp: baseTime + 1000,
        status: 'pending',
      };

      const order3: Order = {
        id: 'bid-3',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: baseTime + 2000,
        status: 'pending',
      };

      orderBook.addOrder(order1);
      orderBook.addOrder(order2);
      orderBook.addOrder(order3);

      const bids = orderBook.getBids();
      expect(bids[0].id).toBe('bid-2');
      expect(bids[1].id).toBe('bid-1');
      expect(bids[2].id).toBe('bid-3');
    });

    it('should maintain price-time priority for asks', () => {
      const baseTime = Date.now();
      const order1: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: baseTime,
        status: 'pending',
      };

      const order2: Order = {
        id: 'ask-2',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 45,
        timestamp: baseTime + 1000,
        status: 'pending',
      };

      const order3: Order = {
        id: 'ask-3',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: baseTime + 2000,
        status: 'pending',
      };

      orderBook.addOrder(order1);
      orderBook.addOrder(order2);
      orderBook.addOrder(order3);

      const asks = orderBook.getAsks();
      expect(asks[0].id).toBe('ask-2');
      expect(asks[1].id).toBe('ask-1');
      expect(asks[2].id).toBe('ask-3');
    });

    it('should store order in map for O(1) lookup', () => {
      const order: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(order);

      expect(orderBook.getOrder('order-1')).toEqual(order);
    });
  });

  describe('removeOrder', () => {
    it('should remove existing order', () => {
      const order: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(order);
      expect(orderBook.removeOrder('order-1')).toBe(true);
      expect(orderBook.getOrder('order-1')).toBeUndefined();
      expect(orderBook.getBids()).toHaveLength(0);
    });

    it('should return false for non-existent order', () => {
      expect(orderBook.removeOrder('non-existent')).toBe(false);
    });

    it('should remove from bids when side is buy', () => {
      const order: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(order);
      expect(orderBook.getBids()).toHaveLength(1);

      orderBook.removeOrder('order-1');
      expect(orderBook.getBids()).toHaveLength(0);
      expect(orderBook.getAsks()).toHaveLength(0);
    });

    it('should remove from asks when side is sell', () => {
      const order: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(order);
      expect(orderBook.getAsks()).toHaveLength(1);

      orderBook.removeOrder('order-1');
      expect(orderBook.getAsks()).toHaveLength(0);
      expect(orderBook.getBids()).toHaveLength(0);
    });

    it('should remove specific order when multiple orders exist', () => {
      const order1: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      const order2: Order = {
        id: 'order-2',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 55,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(order1);
      orderBook.addOrder(order2);
      expect(orderBook.getBids()).toHaveLength(2);

      orderBook.removeOrder('order-1');
      expect(orderBook.getBids()).toHaveLength(1);
      expect(orderBook.getBids()[0].id).toBe('order-2');
    });
  });

  describe('matchOrders', () => {
    it('should not match when book is empty', () => {
      const trades = orderBook.matchOrders();
      expect(trades).toEqual([]);
    });

    it('should not match when only bids exist', () => {
      const bid: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid);
      const trades = orderBook.matchOrders();
      expect(trades).toEqual([]);
    });

    it('should not match when only asks exist', () => {
      const ask: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(ask);
      const trades = orderBook.matchOrders();
      expect(trades).toEqual([]);
    });

    it('should match when bid price >= ask price', () => {
      const bid: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 55,
        timestamp: Date.now(),
        status: 'pending',
      };

      const ask: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid);
      orderBook.addOrder(ask);

      const trades = orderBook.matchOrders();
      expect(trades).toHaveLength(1);
      expect(trades[0].quantity).toBe(100);
      expect(trades[0].price).toBe(50);
      expect(trades[0].buyOrderId).toBe('bid-1');
      expect(trades[0].sellOrderId).toBe('ask-1');
    });

    it('should not match when bid price < ask price', () => {
      const bid: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 45,
        timestamp: Date.now(),
        status: 'pending',
      };

      const ask: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid);
      orderBook.addOrder(ask);

      const trades = orderBook.matchOrders();
      expect(trades).toEqual([]);
    });

    it('should use ask price for matched limit orders', () => {
      const bid: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 60,
        timestamp: Date.now(),
        status: 'pending',
      };

      const ask: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid);
      orderBook.addOrder(ask);

      const trades = orderBook.matchOrders();
      expect(trades[0].price).toBe(50);
    });

    it('should support partial fills on bid', () => {
      const bid: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 150,
        price: 55,
        timestamp: Date.now(),
        status: 'pending',
      };

      const ask: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid);
      orderBook.addOrder(ask);

      const trades = orderBook.matchOrders();
      expect(trades).toHaveLength(1);
      expect(trades[0].quantity).toBe(100);

      const remainingBid = orderBook.getOrder('bid-1');
      expect(remainingBid?.quantity).toBe(50);
      expect(remainingBid?.status).toBe('partial');

      expect(orderBook.getOrder('ask-1')).toBeUndefined();
    });

    it('should support partial fills on ask', () => {
      const bid: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 55,
        timestamp: Date.now(),
        status: 'pending',
      };

      const ask: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 150,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid);
      orderBook.addOrder(ask);

      const trades = orderBook.matchOrders();
      expect(trades).toHaveLength(1);
      expect(trades[0].quantity).toBe(100);

      expect(orderBook.getOrder('bid-1')).toBeUndefined();

      const remainingAsk = orderBook.getOrder('ask-1');
      expect(remainingAsk?.quantity).toBe(50);
      expect(remainingAsk?.status).toBe('partial');
    });

    it('should match multiple trades', () => {
      const bid1: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 55,
        timestamp: Date.now(),
        status: 'pending',
      };

      const bid2: Order = {
        id: 'bid-2',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 53,
        timestamp: Date.now(),
        status: 'pending',
      };

      const ask1: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      const ask2: Order = {
        id: 'ask-2',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 52,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid1);
      orderBook.addOrder(bid2);
      orderBook.addOrder(ask1);
      orderBook.addOrder(ask2);

      const trades = orderBook.matchOrders();
      expect(trades).toHaveLength(2);
      expect(trades[0].price).toBe(50);
      expect(trades[1].price).toBe(52);
    });

    it('should match market buy with best ask', () => {
      const bid: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'market',
        side: 'buy',
        quantity: 100,
        timestamp: Date.now(),
        status: 'pending',
      };

      const ask: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid);
      orderBook.addOrder(ask);

      const trades = orderBook.matchOrders();
      expect(trades).toHaveLength(1);
      expect(trades[0].price).toBe(50);
    });

    it('should match market sell with best bid', () => {
      const bid: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      const ask: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'market',
        side: 'sell',
        quantity: 100,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid);
      orderBook.addOrder(ask);

      const trades = orderBook.matchOrders();
      expect(trades).toHaveLength(1);
      expect(trades[0].price).toBe(50);
    });

    it('should not match market orders when book is empty on opposite side', () => {
      const bid: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'market',
        side: 'buy',
        quantity: 100,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid);

      const trades = orderBook.matchOrders();
      expect(trades).toEqual([]);
    });
  });

  describe('getBestBid', () => {
    it('should return null when no bids', () => {
      expect(orderBook.getBestBid()).toBeNull();
    });

    it('should return highest bid price', () => {
      const bid1: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      const bid2: Order = {
        id: 'bid-2',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 55,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid1);
      orderBook.addOrder(bid2);

      expect(orderBook.getBestBid()).toBe(55);
    });

    it('should ignore bids when only asks exist', () => {
      const ask: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(ask);

      expect(orderBook.getBestBid()).toBeNull();
    });
  });

  describe('getBestAsk', () => {
    it('should return null when no asks', () => {
      expect(orderBook.getBestAsk()).toBeNull();
    });

    it('should return lowest ask price', () => {
      const ask1: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      const ask2: Order = {
        id: 'ask-2',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 45,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(ask1);
      orderBook.addOrder(ask2);

      expect(orderBook.getBestAsk()).toBe(45);
    });

    it('should ignore asks when only bids exist', () => {
      const bid: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid);

      expect(orderBook.getBestAsk()).toBeNull();
    });
  });

  describe('getBids and getAsks', () => {
    it('should return all bids in priority order', () => {
      const baseTime = Date.now();
      const bid1: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: baseTime,
        status: 'pending',
      };

      const bid2: Order = {
        id: 'bid-2',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 55,
        timestamp: baseTime + 1000,
        status: 'pending',
      };

      const bid3: Order = {
        id: 'bid-3',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: baseTime + 2000,
        status: 'pending',
      };

      orderBook.addOrder(bid1);
      orderBook.addOrder(bid2);
      orderBook.addOrder(bid3);

      const bids = orderBook.getBids();
      expect(bids[0].id).toBe('bid-2');
      expect(bids[1].id).toBe('bid-1');
      expect(bids[2].id).toBe('bid-3');
    });

    it('should return all asks in priority order', () => {
      const baseTime = Date.now();
      const ask1: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: baseTime,
        status: 'pending',
      };

      const ask2: Order = {
        id: 'ask-2',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 45,
        timestamp: baseTime + 1000,
        status: 'pending',
      };

      const ask3: Order = {
        id: 'ask-3',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: baseTime + 2000,
        status: 'pending',
      };

      orderBook.addOrder(ask1);
      orderBook.addOrder(ask2);
      orderBook.addOrder(ask3);

      const asks = orderBook.getAsks();
      expect(asks[0].id).toBe('ask-2');
      expect(asks[1].id).toBe('ask-1');
      expect(asks[2].id).toBe('ask-3');
    });
  });

  describe('getOrder', () => {
    it('should return order by ID', () => {
      const order: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(order);

      expect(orderBook.getOrder('order-1')).toEqual(order);
    });

    it('should return undefined for non-existent order', () => {
      expect(orderBook.getOrder('non-existent')).toBeUndefined();
    });

    it('should return undefined for removed order', () => {
      const order: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(order);
      orderBook.removeOrder('order-1');

      expect(orderBook.getOrder('order-1')).toBeUndefined();
    });
  });

  describe('getBidDepth and getAskDepth', () => {
    it('should return total bid quantity', () => {
      const bid1: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      const bid2: Order = {
        id: 'bid-2',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 150,
        price: 55,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid1);
      orderBook.addOrder(bid2);

      expect(orderBook.getBidDepth()).toBe(250);
    });

    it('should return total ask quantity', () => {
      const ask1: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      const ask2: Order = {
        id: 'ask-2',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 150,
        price: 45,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(ask1);
      orderBook.addOrder(ask2);

      expect(orderBook.getAskDepth()).toBe(250);
    });
  });

  describe('edge cases', () => {
    it('should handle orders with same price and timestamp', () => {
      const baseTime = Date.now();
      const order1: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: baseTime,
        status: 'pending',
      };

      const order2: Order = {
        id: 'order-2',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 50,
        timestamp: baseTime,
        status: 'pending',
      };

      orderBook.addOrder(order1);
      orderBook.addOrder(order2);

      const bids = orderBook.getBids();
      expect(bids).toHaveLength(2);
    });

    it('should handle zero quantity orders after matching', () => {
      const bid: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 55,
        timestamp: Date.now(),
        status: 'pending',
      };

      const ask: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid);
      orderBook.addOrder(ask);

      orderBook.matchOrders();

      expect(orderBook.getOrder('bid-1')).toBeUndefined();
      expect(orderBook.getOrder('ask-1')).toBeUndefined();
    });

    it('should handle complex multi-level matching', () => {
      const bid1: Order = {
        id: 'bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 55,
        timestamp: Date.now(),
        status: 'pending',
      };

      const bid2: Order = {
        id: 'bid-2',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 53,
        timestamp: Date.now(),
        status: 'pending',
      };

      const ask1: Order = {
        id: 'ask-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 75,
        price: 50,
        timestamp: Date.now(),
        status: 'pending',
      };

      const ask2: Order = {
        id: 'ask-2',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 75,
        price: 52,
        timestamp: Date.now(),
        status: 'pending',
      };

      orderBook.addOrder(bid1);
      orderBook.addOrder(bid2);
      orderBook.addOrder(ask1);
      orderBook.addOrder(ask2);

      const trades = orderBook.matchOrders();
      expect(trades).toHaveLength(3);
      expect(trades[0].quantity).toBe(75);
      expect(trades[0].price).toBe(50);
      expect(trades[1].quantity).toBe(25);
      expect(trades[1].price).toBe(52);
      expect(trades[2].quantity).toBe(50);
      expect(trades[2].price).toBe(52);

      expect(orderBook.getOrder('bid-1')).toBeUndefined();
      expect(orderBook.getOrder('bid-2')?.quantity).toBe(50);
      expect(orderBook.getOrder('ask-1')).toBeUndefined();
      expect(orderBook.getOrder('ask-2')).toBeUndefined();
    });
  });
});
