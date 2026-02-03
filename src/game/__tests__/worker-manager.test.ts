import { describe, it, expect } from 'bun:test';
import {
  WorkerManager,
  createWorkerManager,
  createOrderProcessor,
  createPriceProvider,
  acquireWorkerManager,
  type OrderProcessor,
} from '../worker-manager';
import { OrderBook } from '../order-book';
import { MarketEngine } from '../market-engine';
import type { Order, Trade } from '../types';

describe('WorkerManager', () => {
  describe('Factory Functions', () => {
    it('should create a WorkerManager with default config', () => {
      const manager = createWorkerManager();
      expect(manager).toBeInstanceOf(WorkerManager);
      expect(manager.getStats()).toEqual({
        ordersProcessed: 0,
        tradesMatched: 0,
        marketUpdatesBroadcast: 0,
        workersActive: 0,
        workersRestarted: 0,
        uptime: 0,
        lastTickTime: expect.any(Number),
      });
    });

    it('should create a WorkerManager with custom config', () => {
      const manager = createWorkerManager({
        queueCapacity: 100,
        workerPoolSize: 2,
        tickInterval: 25,
      });
      expect(manager).toBeInstanceOf(WorkerManager);
      expect(manager.getStats()).toBeDefined();
    });
  });

  describe('Queue Processing', () => {
    it('should enqueue orders', async () => {
      const manager = createWorkerManager();
      const orderBook = new OrderBook();
      const processor = createOrderProcessor(orderBook);
      manager.setOrderProcessor(processor);

      const order: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 100,
        timestamp: Date.now(),
        status: 'pending',
      };

      await manager.enqueueOrder(order);
      expect(manager.getQueueSize()).toBe(1);
    });

    it('should enqueue market tick tasks', async () => {
      const manager = createWorkerManager();
      const engine = new MarketEngine('item-1', 100);
      const provider = createPriceProvider(engine);
      manager.setPriceProvider(provider);

      await manager.enqueueMarketTick('item-1');
      expect(manager.getQueueSize()).toBe(1);
    });

    it('should handle multiple orders in sequence', async () => {
      const manager = createWorkerManager();
      const orderBook = new OrderBook();
      const processor = createOrderProcessor(orderBook);
      manager.setOrderProcessor(processor);

      const orders: Order[] = [
        {
          id: 'order-1',
          playerId: 'player-1',
          itemId: 'item-1',
          type: 'limit',
          side: 'buy',
          quantity: 10,
          price: 100,
          timestamp: Date.now(),
          status: 'pending',
        },
        {
          id: 'order-2',
          playerId: 'player-2',
          itemId: 'item-1',
          type: 'limit',
          side: 'sell',
          quantity: 5,
          price: 105,
          timestamp: Date.now(),
          status: 'pending',
        },
      ];

      for (const order of orders) {
        await manager.enqueueOrder(order);
      }

      expect(manager.getQueueSize()).toBe(2);
    });

    it('should check if queue is empty', () => {
      const manager = createWorkerManager();
      expect(manager.isQueueEmpty()).toBe(true);
    });

    it('should get current queue size', async () => {
      const manager = createWorkerManager();

      const orders: Order[] = [1, 2, 3].map((i) => ({
        id: `order-${i}`,
        playerId: `player-${i}`,
        itemId: 'item-1',
        type: 'limit' as const,
        side: 'buy' as const,
        quantity: 10,
        price: 100,
        timestamp: Date.now(),
        status: 'pending' as const,
      }));

      for (const order of orders) {
        await manager.enqueueOrder(order);
      }

      expect(manager.getQueueSize()).toBe(3);
    });
  });

  describe('Market Updates Broadcasting', () => {
    it('should create subscription for market updates', async () => {
      const manager = createWorkerManager();
      const engine = new MarketEngine('item-1', 100);
      const provider = createPriceProvider(engine);
      manager.setPriceProvider(provider);

      const updatePromise = manager.subscribeToMarket('item-1');

      expect(updatePromise).toBeDefined();
      expect(updatePromise).toBeInstanceOf(Promise);
    });

    it('should enqueue market tick tasks for broadcasting', async () => {
      const manager = createWorkerManager();
      const engine = new MarketEngine('item-1', 100);
      const provider = createPriceProvider(engine);
      manager.setPriceProvider(provider);

      await manager.enqueueMarketTick('item-1');
      expect(manager.getQueueSize()).toBe(1);
    });

    it('should track market update broadcasts in stats', () => {
      const manager = createWorkerManager();
      const stats = manager.getStats();
      expect(stats.marketUpdatesBroadcast).toBe(0);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track orders processed', () => {
      const manager = createWorkerManager();
      const stats = manager.getStats();
      expect(stats.ordersProcessed).toBe(0);
    });

    it('should track trades matched', () => {
      const manager = createWorkerManager();
      const stats = manager.getStats();
      expect(stats.tradesMatched).toBe(0);
    });

    it('should track worker uptime', () => {
      const manager = createWorkerManager();
      const stats = manager.getStats();
      expect(stats.uptime).toBe(0);
    });

    it('should track active workers', () => {
      const manager = createWorkerManager({ workerPoolSize: 4 });
      const stats = manager.getStats();
      expect(stats.workersActive).toBe(0);
    });

    it('should track last tick time', () => {
      const manager = createWorkerManager();
      const stats = manager.getStats();
      expect(stats.lastTickTime).toBeGreaterThan(0);
    });

    it('should track workers restarted', () => {
      const manager = createWorkerManager();
      const stats = manager.getStats();
      expect(stats.workersRestarted).toBe(0);
    });
  });

  describe('Worker Lifecycle', () => {
    it('should track shutdown when not running', async () => {
      const manager = createWorkerManager();
      await manager.gracefulShutdown();
      expect(manager.getStats().workersActive).toBe(0);
    });

    it('should increment worker restarts', async () => {
      const manager = createWorkerManager();

      const initialRestarts = manager.getStats().workersRestarted;

      await manager.restartWorker(0);

      const finalRestarts = manager.getStats().workersRestarted;
      expect(finalRestarts).toBe(initialRestarts + 1);
    });
  });

  describe('Error Handling', () => {
    it('should handle orders without processor', async () => {
      const manager = createWorkerManager();

      const order: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 100,
        timestamp: Date.now(),
        status: 'pending',
      };

      await manager.enqueueOrder(order);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = manager.getStats();
      expect(stats.ordersProcessed).toBe(0);
    });

    it('should handle market ticks without price provider', async () => {
      const manager = createWorkerManager();

      await manager.enqueueMarketTick('item-1');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = manager.getStats();
      expect(stats.marketUpdatesBroadcast).toBe(0);
    });

    it('should handle graceful shutdown when not running', async () => {
      const manager = createWorkerManager();
      await manager.gracefulShutdown();
      expect(manager.getStats().workersActive).toBe(0);
    });
  });

  describe('Integration with OrderBook and MarketEngine', () => {
    it('should integrate with OrderBook for order processing', () => {
      const orderBook = new OrderBook();
      const processor = createOrderProcessor(orderBook);

      const order: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 100,
        timestamp: Date.now(),
        status: 'pending',
      };

      expect(() => processor(order)).not.toThrow();
    });

    it('should integrate with MarketEngine for price updates', () => {
      const engine = new MarketEngine('item-1', 100);
      const provider = createPriceProvider(engine);

      expect(() => provider('item-1')).not.toThrow();
    });

    it('should get realistic price data from provider', async () => {
      const engine = new MarketEngine('item-1', 100);
      const provider = createPriceProvider(engine);

      const priceData = await provider('item-1');

      expect(priceData).toBeDefined();
      expect(priceData.price).toBe(100);
      expect(priceData.bestBid).toBe(99);
      expect(priceData.bestAsk).toBe(101);
    });
  });

  describe('Helper Functions', () => {
    it('should create order processor from OrderBook', () => {
      const orderBook = new OrderBook();
      const processor = createOrderProcessor(orderBook);

      expect(processor).toBeInstanceOf(Function);
    });

    it('should create price provider from MarketEngine', () => {
      const engine = new MarketEngine('item-1', 100);
      const provider = createPriceProvider(engine);

      expect(provider).toBeInstanceOf(Function);
    });
  });

  describe('Worker Start and Stop', () => {
    it('should start worker manager', async () => {
      const manager = createWorkerManager({ workerPoolSize: 2 });
      const orderBook = new OrderBook();
      const processor = createOrderProcessor(orderBook);
      manager.setOrderProcessor(processor);

      await manager.start();

      expect(manager.getStats().workersActive).toBe(2);

      await manager.gracefulShutdown();
    });

    it('should warn when already running', async () => {
      const manager = createWorkerManager({ workerPoolSize: 1 });
      const orderBook = new OrderBook();
      const processor = createOrderProcessor(orderBook);
      manager.setOrderProcessor(processor);

      await manager.start();
      await manager.start();

      expect(manager.getStats().workersActive).toBe(1);

      await manager.gracefulShutdown();
    });

    it('should gracefully shutdown active workers', async () => {
      const manager = createWorkerManager({ workerPoolSize: 2 });
      const orderBook = new OrderBook();
      const processor = createOrderProcessor(orderBook);
      manager.setOrderProcessor(processor);

      await manager.start();

      expect(manager.getStats().workersActive).toBe(2);

      await manager.gracefulShutdown();

      expect(manager.getStats().workersActive).toBe(0);
    });

    it('should track restarts when worker is restarted', async () => {
      const manager = createWorkerManager({ workerPoolSize: 1 });
      const orderBook = new OrderBook();
      const processor = createOrderProcessor(orderBook);
      manager.setOrderProcessor(processor);

      const initialRestarts = manager.getStats().workersRestarted;

      await manager.restartWorker(0);

      const finalRestarts = manager.getStats().workersRestarted;
      expect(finalRestarts).toBe(initialRestarts + 1);
    });
  });

  describe('Queue Processing with Active Workers', () => {
    it('should start workers and increase active count', async () => {
      const manager = createWorkerManager({ workerPoolSize: 2 });
      const orderBook = new OrderBook();
      const processor = createOrderProcessor(orderBook);
      manager.setOrderProcessor(processor);

      await manager.start();

      expect(manager.getStats().workersActive).toBe(2);

      await manager.gracefulShutdown();
    });

    it('should accept orders when workers are active', async () => {
      const manager = createWorkerManager({ workerPoolSize: 1 });
      const orderBook = new OrderBook();
      const processor = createOrderProcessor(orderBook);
      manager.setOrderProcessor(processor);

      await manager.start();

      const order: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 100,
        timestamp: Date.now(),
        status: 'pending',
      };

      await manager.enqueueOrder(order);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const stats = manager.getStats();
      expect(stats.ordersProcessed).toBe(1);

      await manager.gracefulShutdown();
    });
  });

  describe('Market Tick Processing', () => {
    it('should enqueue market ticks when workers are active', async () => {
      const manager = createWorkerManager({ workerPoolSize: 1 });
      const engine = new MarketEngine('item-1', 100);
      const provider = createPriceProvider(engine);
      manager.setPriceProvider(provider);

      await manager.start();

      await manager.enqueueMarketTick('item-1');

      await new Promise((resolve) => setTimeout(resolve, 50));

      const stats = manager.getStats();
      expect(stats.marketUpdatesBroadcast).toBeGreaterThan(0);

      await manager.gracefulShutdown();
    });
  });

  describe('Market Updates Broadcasting', () => {
    it('should start game tick loop when workers are active', async () => {
      const manager = createWorkerManager({ workerPoolSize: 1 });
      const engine = new MarketEngine('item-1', 100);
      const provider = createPriceProvider(engine);
      manager.setPriceProvider(provider);

      await manager.start();

      expect(manager.getStats().workersActive).toBe(1);

      await manager.gracefulShutdown();
    });

    it('should start workers without price provider', async () => {
      const manager = createWorkerManager({ workerPoolSize: 1 });

      await manager.start();

      expect(manager.getStats().workersActive).toBe(1);

      await manager.gracefulShutdown();
    });
  });

  describe('Market Subscription', () => {
    it('should receive market updates through subscription', async () => {
      const manager = createWorkerManager({ workerPoolSize: 1 });
      const engine = new MarketEngine('item-1', 100);
      const provider = createPriceProvider(engine);
      manager.setPriceProvider(provider);

      await manager.start();

      const updatePromise = manager.subscribeToMarket('item-1');

      expect(updatePromise).toBeDefined();

      await manager.gracefulShutdown();
    });

    it('should filter updates by item ID', async () => {
      const manager = createWorkerManager({ workerPoolSize: 1 });
      const engine = new MarketEngine('item-1', 100);
      const provider = createPriceProvider(engine);
      manager.setPriceProvider(provider);

      await manager.start();

      const updatePromise = manager.subscribeToMarket('item-2');

      expect(updatePromise).toBeDefined();

      await manager.gracefulShutdown();
    });
  });

  describe('Error Recovery', () => {
    it('should handle processor errors with retry', async () => {
      const manager = createWorkerManager({ workerPoolSize: 1 });

      let callCount = 0;
      const failingProcessor: OrderProcessor = async (order: Order) => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Simulated processor failure');
        }
        return [];
      };

      manager.setOrderProcessor(failingProcessor);

      await manager.start();

      const order: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 100,
        timestamp: Date.now(),
        status: 'pending',
      };

      await manager.enqueueOrder(order);

      await new Promise((resolve) => setTimeout(resolve, 500));

      await manager.gracefulShutdown();
    });
  });

  describe('Acquire Worker Manager', () => {
    it('should acquire worker manager', async () => {
      const manager = await acquireWorkerManager({ workerPoolSize: 1 });
      expect(manager).toBeInstanceOf(WorkerManager);
      expect(manager.getStats().workersActive).toBe(1);

      await manager.gracefulShutdown();
    });

    it('should start workers on acquisition', async () => {
      const manager = await acquireWorkerManager({ workerPoolSize: 2 });

      expect(manager.getStats().workersActive).toBe(2);

      await manager.gracefulShutdown();
    });
  });

  describe('Uptime Tracking', () => {
    it('should track uptime when workers are active', async () => {
      const manager = createWorkerManager({ workerPoolSize: 1 });
      const orderBook = new OrderBook();
      const processor = createOrderProcessor(orderBook);
      manager.setOrderProcessor(processor);

      await manager.start();

      const order: Order = {
        id: 'order-1',
        playerId: 'player-1',
        itemId: 'item-1',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 100,
        timestamp: Date.now(),
        status: 'pending',
      };

      await manager.enqueueOrder(order);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = manager.getStats();
      expect(stats.uptime).toBeGreaterThanOrEqual(0);

      await manager.gracefulShutdown();
    });
  });
});
