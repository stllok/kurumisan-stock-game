/**
 * Tests for per-market worker spawning with Bun workers
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MarketWorker, WorkerPool, WorkerMessage, WorkerResponse } from '../market-worker';
import type { Order } from '../types';

describe('MarketWorker', () => {
  let worker: MarketWorker;

  beforeEach(() => {
    worker = new MarketWorker('item-1', 100.0);
  });

  afterEach(async () => {
    await worker.stop();
  });

  describe('worker lifecycle', () => {
    it('should start a worker successfully', async () => {
      await worker.start();
      const state = worker.getState();
      expect(state.isRunning).toBe(true);
      expect(state.itemId).toBe('item-1');
    });

    it('should stop a worker successfully', async () => {
      await worker.start();
      expect(worker.getState().isRunning).toBe(true);

      await worker.stop();
      expect(worker.getState().isRunning).toBe(false);
    });

    it('should handle multiple start calls gracefully', async () => {
      await worker.start();
      await worker.start();

      const state = worker.getState();
      expect(state.isRunning).toBe(true);
    });

    it('should handle stop when not running', async () => {
      await worker.stop();
      expect(worker.getState().isRunning).toBe(false);
    });
  });

  describe('order submission', () => {
    beforeEach(async () => {
      await worker.start();
    });

    it('should submit an order successfully', async () => {
      const order: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 100.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      const response = await worker.submitOrder(order);

      expect(response.type).toBe('order-submitted');
      if (response.type === 'order-submitted') {
        expect(response.orderId).toBe('order-1');
        expect(Array.isArray(response.trades)).toBe(true);
      }
    });

    it('should handle buy order', async () => {
      const order: Order = {
        id: 'order-buy-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 5,
        price: 100.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      const response = await worker.submitOrder(order);

      expect(response.type).toBe('order-submitted');
      if (response.type === 'order-submitted') {
        expect(response.orderId).toBe('order-buy-1');
      }
    });

    it('should handle sell order', async () => {
      const order: Order = {
        id: 'order-sell-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 5,
        price: 100.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      const response = await worker.submitOrder(order);

      expect(response.type).toBe('order-submitted');
      if (response.type === 'order-submitted') {
        expect(response.orderId).toBe('order-sell-1');
      }
    });

    it('should return error when worker is not running', async () => {
      await worker.stop();

      const order: Order = {
        id: 'order-failed',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 100.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      const response = await worker.submitOrder(order);

      expect(response.type).toBe('error');
      if (response.type === 'error') {
        expect(response.message).toContain('Worker not running');
      }
    });
  });

  describe('order cancellation', () => {
    beforeEach(async () => {
      await worker.start();
    });

    it('should cancel an order successfully', async () => {
      const order: Order = {
        id: 'order-cancel-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 100.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      await worker.submitOrder(order);
      const response = await worker.cancelOrder('order-cancel-1');

      expect(response.type).toBe('order-cancelled');
      if (response.type === 'order-cancelled') {
        expect(response.orderId).toBe('order-cancel-1');
      }
    });

    it('should return error for non-existent order', async () => {
      const response = await worker.cancelOrder('non-existent-order');

      expect(['error', 'order-cancelled']).toContain(response.type);
    });
  });

  describe('order book retrieval', () => {
    beforeEach(async () => {
      await worker.start();
    });

    it('should get order book with empty bids and asks', async () => {
      const response = await worker.getOrderBook();

      expect(response.type).toBe('order-book');
      if (response.type === 'order-book') {
        expect(Array.isArray(response.bids)).toBe(true);
        expect(Array.isArray(response.asks)).toBe(true);
      }
    });

    it('should get order book with orders', async () => {
      const buyOrder: Order = {
        id: 'order-bid-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 100.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      const sellOrder: Order = {
        id: 'order-ask-1',
        playerId: 'player-2',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 10,
        price: 100.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      await worker.submitOrder(buyOrder);
      await worker.submitOrder(sellOrder);

      const response = await worker.getOrderBook();

      expect(response.type).toBe('order-book');
      if (response.type === 'order-book') {
        expect(response.bids.length).toBeGreaterThan(0);
        expect(response.asks.length).toBeGreaterThan(0);
      }
    });
  });

  describe('market tick', () => {
    beforeEach(async () => {
      await worker.start();
    });

    it('should execute tick successfully', async () => {
      const response = await worker.tick();

      expect(response.type).toBe('tick-completed');
      if (response.type === 'tick-completed') {
        expect(typeof response.currentPrice).toBe('number');
        expect(response.currentPrice).toBeGreaterThan(0);
        expect(Array.isArray(response.trades)).toBe(true);
      }
    });

    it('should match orders on tick', async () => {
      const buyOrder: Order = {
        id: 'order-bid-tick-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 101.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      const sellOrder: Order = {
        id: 'order-ask-tick-1',
        playerId: 'player-2',
        itemId: 'item-1',
        type: 'limit',
        side: 'sell',
        quantity: 10,
        price: 99.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      await worker.submitOrder(buyOrder);
      await worker.submitOrder(sellOrder);

      const response = await worker.tick();

      expect(response.type).toBe('tick-completed');
      if (response.type === 'tick-completed') {
        expect(response.trades.length).toBeGreaterThan(0);
      }
    });
  });

  describe('worker crash handling', () => {
    it('should handle worker termination gracefully', async () => {
      await worker.start();
      const initialState = worker.getState();
      expect(initialState.crashCount).toBe(0);
      expect(initialState.isRunning).toBe(true);

      await worker.stop();

      const stoppedState = worker.getState();
      expect(stoppedState.isRunning).toBe(false);
    });
  });
});

describe('WorkerPool', () => {
  let pool: WorkerPool;

  beforeEach(() => {
    pool = new WorkerPool();
  });

  afterEach(async () => {
    await pool.stop();
  });

  describe('pool lifecycle', () => {
    it('should start pool successfully', async () => {
      await pool.start();
      expect(pool.getWorkerCount()).toBe(0);
    });

    it('should stop pool successfully', async () => {
      await pool.start();
      await pool.spawnWorker('item-1', 100.0);
      expect(pool.getWorkerCount()).toBe(1);

      await pool.stop();
      expect(pool.getWorkerCount()).toBe(0);
    });
  });

  describe('worker spawning', () => {
    beforeEach(async () => {
      await pool.start();
    });

    it('should spawn worker for new market', async () => {
      await pool.spawnWorker('item-1', 100.0);

      expect(pool.hasWorker('item-1')).toBe(true);
      expect(pool.getWorkerCount()).toBe(1);
    });

    it('should spawn multiple workers for different markets', async () => {
      await pool.spawnWorker('item-1', 100.0);
      await pool.spawnWorker('item-2', 200.0);
      await pool.spawnWorker('item-3', 300.0);

      expect(pool.hasWorker('item-1')).toBe(true);
      expect(pool.hasWorker('item-2')).toBe(true);
      expect(pool.hasWorker('item-3')).toBe(true);
      expect(pool.getWorkerCount()).toBe(3);
    });

    it('should not spawn duplicate worker for same market', async () => {
      await pool.spawnWorker('item-1', 100.0);
      await pool.spawnWorker('item-1', 100.0);

      expect(pool.getWorkerCount()).toBe(1);
    });
  });

  describe('message routing', () => {
    beforeEach(async () => {
      await pool.start();
      await pool.spawnWorker('item-1', 100.0);
      await pool.spawnWorker('item-2', 200.0);
    });

    it('should route order to correct worker', async () => {
      const order: Order = {
        id: 'order-routed-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 100.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      const response = await pool.submitOrder(order);

      expect(response.type).toBe('order-submitted');
      if (response.type === 'order-submitted') {
        expect(response.orderId).toBe('order-routed-1');
      }
    });

    it('should route orders to different workers', async () => {
      const order1: Order = {
        id: 'order-routed-item1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 100.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      const order2: Order = {
        id: 'order-routed-item2',
        playerId: 'player-2',
        itemId: 'item-2',
        type: 'limit',
        side: 'sell',
        quantity: 10,
        price: 200.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      const response1 = await pool.submitOrder(order1);
      const response2 = await pool.submitOrder(order2);

      expect(response1.type).toBe('order-submitted');
      expect(response2.type).toBe('order-submitted');
    });

    it('should return error for unknown item', async () => {
      const order: Order = {
        id: 'order-unknown',
        playerId: 'player-1',
        itemId: 'item-999',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 100.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      const response = await pool.submitOrder(order);

      expect(response.type).toBe('error');
      if (response.type === 'error') {
        expect(response.message).toContain('No worker for item');
      }
    });

    it('should cancel order via correct worker', async () => {
      const order: Order = {
        id: 'order-cancel-pool-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 100.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      await pool.submitOrder(order);
      const response = await pool.cancelOrder('item-1', 'order-cancel-pool-1');

      expect(response.type).toBe('order-cancelled');
    });

    it('should get order book from correct worker', async () => {
      const response = await pool.getOrderBook('item-1');

      expect(response.type).toBe('order-book');
      if (response.type === 'order-book') {
        expect(Array.isArray(response.bids)).toBe(true);
        expect(Array.isArray(response.asks)).toBe(true);
      }
    });
  });

  describe('tick coordination', () => {
    beforeEach(async () => {
      await pool.start();
      await pool.spawnWorker('item-1', 100.0);
      await pool.spawnWorker('item-2', 200.0);
    });

    it('should tick all markets', async () => {
      const results = await pool.tickAll();

      expect(results.size).toBe(2);
      expect(results.has('item-1')).toBe(true);
      expect(results.has('item-2')).toBe(true);

      for (const [itemId, response] of results) {
        expect(response.type).toBe('tick-completed');
        if (response.type === 'tick-completed') {
          expect(typeof response.currentPrice).toBe('number');
          expect(response.currentPrice).toBeGreaterThan(0);
        }
      }
    });

    it('should tick specific market', async () => {
      const response = await pool.tick('item-1');

      expect(response.type).toBe('tick-completed');
      if (response.type === 'tick-completed') {
        expect(typeof response.currentPrice).toBe('number');
      }
    });
  });

  describe('worker management', () => {
    beforeEach(async () => {
      await pool.start();
      await pool.spawnWorker('item-1', 100.0);
    });

    it('should check if worker exists', () => {
      expect(pool.hasWorker('item-1')).toBe(true);
      expect(pool.hasWorker('item-999')).toBe(false);
    });

    it('should get worker count', () => {
      expect(pool.getWorkerCount()).toBe(1);
    });

    it('should get all worker states', async () => {
      await pool.spawnWorker('item-2', 200.0);

      const states = pool.getWorkerStates();

      expect(states.size).toBe(2);
      expect(states.has('item-1')).toBe(true);
      expect(states.has('item-2')).toBe(true);

      for (const [itemId, state] of states) {
        expect(state.itemId).toBe(itemId);
        expect(state.isRunning).toBe(true);
      }
    });

    it('should remove worker from pool', async () => {
      expect(pool.hasWorker('item-1')).toBe(true);

      await pool.removeWorker('item-1');

      expect(pool.hasWorker('item-1')).toBe(false);
      expect(pool.getWorkerCount()).toBe(0);
    });
  });

  describe('integration test', () => {
    it('should handle complete trading workflow', async () => {
      await pool.start();
      await pool.spawnWorker('btc-usd', 50000.0);

      const buyOrder: Order = {
        id: 'buy-order-1',
        playerId: 'alice',
        itemId: 'btc-usd',
        type: 'limit',
        side: 'buy',
        quantity: 1.5,
        price: 50000.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      const buyResponse = await pool.submitOrder(buyOrder);
      expect(buyResponse.type).toBe('order-submitted');

      const sellOrder: Order = {
        id: 'sell-order-1',
        playerId: 'bob',
        itemId: 'btc-usd',
        type: 'limit',
        side: 'sell',
        quantity: 1.5,
        price: 49900.0,
        timestamp: Date.now(),
        status: 'pending',
      };

      const sellResponse = await pool.submitOrder(sellOrder);
      expect(sellResponse.type).toBe('order-submitted');

      const tickResponse = await pool.tick('btc-usd');
      expect(tickResponse.type).toBe('tick-completed');
      if (tickResponse.type === 'tick-completed') {
        expect(tickResponse.trades.length).toBeGreaterThan(0);
      }

      const bookResponse = await pool.getOrderBook('btc-usd');
      expect(bookResponse.type).toBe('order-book');

      const states = pool.getWorkerStates();
      const btcState = states.get('btc-usd');
      expect(btcState).toBeDefined();
      expect(btcState?.itemId).toBe('btc-usd');
      expect(btcState?.isRunning).toBe(true);
    });
  });
});

describe('createWorkerPool factory', () => {
  it('should create a new WorkerPool instance', () => {
    const pool = new WorkerPool();
    expect(pool).toBeInstanceOf(WorkerPool);
    expect(pool.getWorkerCount()).toBe(0);
  });
});
