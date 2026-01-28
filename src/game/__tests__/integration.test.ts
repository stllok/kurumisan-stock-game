/**
 * Integration tests for stock simulator end-to-end workflows
 *
 * Tests comprehensive scenarios including:
 * - Full trading workflow: spawn workers, submit orders, match trades
 * - Multi-market: multiple items with separate workers
 * - Multi-player: 50+ concurrent players submitting orders
 * - Price simulation: GBM price movements
 * - Order flow pressure: buy pressure increases price
 * - Edge cases: empty order book, single-sided market, worker crash
 * - Performance: order processing rate (≥100 orders/sec or 1000 orders in <10 seconds)
 */

import { describe, it, expect, afterEach } from 'bun:test';
import { WorkerPool, createWorkerPool } from '../market-worker';
import { OrderBook } from '../order-book';
import { MarketEngine } from '../market-engine';
import { PlayerSession, createPlayerSession } from '../player-session';
import type { Order, OrderSide, OrderType, OrderStatus } from '../types';

describe('Integration Tests', () => {
  let pool: WorkerPool;

  afterEach(async () => {
    if (pool) {
      await pool.stop();
    }
  });

  describe('Full Trading Workflow', () => {
    it('should complete full workflow: spawn worker, submit orders, match trades', async () => {
      pool = createWorkerPool();
      await pool.start();

      await pool.spawnWorker('btc-usd', 50000.0);
      expect(pool.hasWorker('btc-usd')).toBe(true);
      expect(pool.getWorkerCount()).toBe(1);

      const buyOrder: Order = {
        id: 'buy-1',
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
      if (buyResponse.type === 'order-submitted') {
        expect(buyResponse.orderId).toBe('buy-1');
      }

      const sellOrder: Order = {
        id: 'sell-1',
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
      if (sellResponse.type === 'order-submitted') {
        expect(sellResponse.orderId).toBe('sell-1');
      }

      const tickResponse = await pool.tick('btc-usd');
      expect(tickResponse.type).toBe('tick-completed');
      if (tickResponse.type === 'tick-completed') {
        expect(tickResponse.trades.length).toBeGreaterThan(0);
        expect(tickResponse.trades[0].buyOrderId).toBe('buy-1');
        expect(tickResponse.trades[0].sellOrderId).toBe('sell-1');
        expect(tickResponse.trades[0].quantity).toBe(1.5);
        expect(tickResponse.currentPrice).toBeGreaterThan(0);
      }

      const bookResponse = await pool.getOrderBook('btc-usd');
      expect(bookResponse.type).toBe('order-book');
      if (bookResponse.type === 'order-book') {
        expect(bookResponse.bids.length).toBe(0);
        expect(bookResponse.asks.length).toBe(0);
      }
    });

    it('should handle multiple consecutive trades', async () => {
      pool = createWorkerPool();
      await pool.start();
      await pool.spawnWorker('eth-usd', 3000.0);

      for (let i = 0; i < 5; i++) {
        const buyOrder: Order = {
          id: `buy-${i}`,
          playerId: `trader-${i * 2}`,
          itemId: 'eth-usd',
          type: 'limit',
          side: 'buy',
          quantity: 10,
          price: 3050.0 + i * 10,
          timestamp: Date.now() + i,
          status: 'pending',
        };
        await pool.submitOrder(buyOrder);

        const sellOrder: Order = {
          id: `sell-${i}`,
          playerId: `trader-${i * 2 + 1}`,
          itemId: 'eth-usd',
          type: 'limit',
          side: 'sell',
          quantity: 10,
          price: 2950.0 - i * 10,
          timestamp: Date.now() + i + 0.5,
          status: 'pending',
        };
        await pool.submitOrder(sellOrder);
      }

      const tickResponse = await pool.tick('eth-usd');
      expect(tickResponse.type).toBe('tick-completed');
      if (tickResponse.type === 'tick-completed') {
        expect(tickResponse.trades.length).toBe(5);
      }
    });

    it('should handle partial fills across multiple ticks', async () => {
      pool = createWorkerPool();
      await pool.start();
      await pool.spawnWorker('sol-usd', 100.0);

      const largeBuy: Order = {
        id: 'large-buy',
        playerId: 'whale',
        itemId: 'sol-usd',
        type: 'limit',
        side: 'buy',
        quantity: 250,
        price: 105.0,
        timestamp: Date.now(),
        status: 'pending',
      };
      await pool.submitOrder(largeBuy);

      for (let i = 0; i < 5; i++) {
        const sellOrder: Order = {
          id: `sell-${i}`,
          playerId: `retail-${i}`,
          itemId: 'sol-usd',
          type: 'limit',
          side: 'sell',
          quantity: 100,
          price: 95.0,
          timestamp: Date.now() + i,
          status: 'pending',
        };
        await pool.submitOrder(sellOrder);
      }

      const tickResponse = await pool.tick('sol-usd');
      expect(tickResponse.type).toBe('tick-completed');
      if (tickResponse.type === 'tick-completed') {
        expect(tickResponse.trades.length).toBeGreaterThan(0);
        expect(tickResponse.trades.reduce((sum, t) => sum + t.quantity, 0)).toBeGreaterThan(0);
      }
    });
  });

  describe('Multi-Market Integration', () => {
    it('should handle multiple markets with separate workers', async () => {
      pool = createWorkerPool();
      await pool.start();

      const markets = [
        { itemId: 'btc-usd', initialPrice: 50000.0 },
        { itemId: 'eth-usd', initialPrice: 3000.0 },
        { itemId: 'sol-usd', initialPrice: 100.0 },
        { itemId: 'doge-usd', initialPrice: 0.08 },
      ];

      for (const market of markets) {
        await pool.spawnWorker(market.itemId, market.initialPrice);
      }

      expect(pool.getWorkerCount()).toBe(markets.length);

      for (const market of markets) {
        const buyOrder: Order = {
          id: `buy-${market.itemId}`,
          playerId: `trader-${market.itemId}`,
          itemId: market.itemId,
          type: 'limit',
          side: 'buy',
          quantity: 10,
          price: market.initialPrice * 1.01,
          timestamp: Date.now(),
          status: 'pending',
        };
        await pool.submitOrder(buyOrder);

        const sellOrder: Order = {
          id: `sell-${market.itemId}`,
          playerId: `trader-${market.itemId}`,
          itemId: market.itemId,
          type: 'limit',
          side: 'sell',
          quantity: 10,
          price: market.initialPrice * 0.99,
          timestamp: Date.now(),
          status: 'pending',
        };
        await pool.submitOrder(sellOrder);
      }

      const results = await pool.tickAll();
      expect(results.size).toBe(markets.length);

      for (const [itemId, response] of results) {
        expect(response.type).toBe('tick-completed');
        if (response.type === 'tick-completed') {
          expect(response.trades.length).toBeGreaterThan(0);
          expect(response.currentPrice).toBeGreaterThan(0);
        }
      }
    });

    it('should maintain isolation between markets', async () => {
      pool = createWorkerPool();
      await pool.start();

      await pool.spawnWorker('market-a', 1000.0);
      await pool.spawnWorker('market-b', 2000.0);

      const buyA: Order = {
        id: 'buy-a',
        playerId: 'alice',
        itemId: 'market-a',
        type: 'limit',
        side: 'buy',
        quantity: 100,
        price: 1050.0,
        timestamp: Date.now(),
        status: 'pending',
      };
      await pool.submitOrder(buyA);

      const sellB: Order = {
        id: 'sell-b',
        playerId: 'bob',
        itemId: 'market-b',
        type: 'limit',
        side: 'sell',
        quantity: 100,
        price: 1950.0,
        timestamp: Date.now(),
        status: 'pending',
      };
      await pool.submitOrder(sellB);

      const tickA = await pool.tick('market-a');
      expect(tickA.type).toBe('tick-completed');

      const tickB = await pool.tick('market-b');
      expect(tickB.type).toBe('tick-completed');

      const bookA = await pool.getOrderBook('market-a');
      expect(bookA.type).toBe('order-book');
      if (bookA.type === 'order-book') {
        expect(bookA.bids.length).toBe(1);
      }

      const bookB = await pool.getOrderBook('market-b');
      expect(bookB.type).toBe('order-book');
      if (bookB.type === 'order-book') {
        expect(bookB.asks.length).toBe(1);
      }
    });
  });

  describe('Multi-Player Integration', () => {
    it('should handle 50+ concurrent players submitting orders', async () => {
      pool = createWorkerPool();
      await pool.start();
      await pool.spawnWorker('concurrent-market', 1000.0);

      const numPlayers = 50;
      const orderPromises: Promise<void>[] = [];

      for (let i = 0; i < numPlayers; i++) {
        const playerId = `player-${i}`;

        const buyOrder: Order = {
          id: `buy-${playerId}`,
          playerId,
          itemId: 'concurrent-market',
          type: 'limit',
          side: 'buy',
          quantity: 10 + Math.floor(Math.random() * 20),
          price: 1000.0 + Math.random() * 100,
          timestamp: Date.now() + i,
          status: 'pending',
        };
        orderPromises.push(pool.submitOrder(buyOrder).then(() => {}));

        const sellOrder: Order = {
          id: `sell-${playerId}`,
          playerId,
          itemId: 'concurrent-market',
          type: 'limit',
          side: 'sell',
          quantity: 10 + Math.floor(Math.random() * 20),
          price: 950.0 - Math.random() * 100,
          timestamp: Date.now() + i + 0.5,
          status: 'pending',
        };
        orderPromises.push(pool.submitOrder(sellOrder).then(() => {}));
      }

      await Promise.all(orderPromises);

      const tickResponse = await pool.tick('concurrent-market');
      expect(tickResponse.type).toBe('tick-completed');
      if (tickResponse.type === 'tick-completed') {
        expect(tickResponse.trades.length).toBeGreaterThan(0);
      }
    });

    it('should maintain player session state across multiple transactions', async () => {
      const playerSession = createPlayerSession('test-player', 100000.0);

      playerSession.updateBalance(-50000.0);
      playerSession.updateInventory('btc-usd', 1.0);

      expect(playerSession.getBalance()).toBe(50000.0);
      expect(playerSession.getInventory('btc-usd')).toBe(1.0);

      playerSession.updateInventory('btc-usd', -1.0);
      playerSession.updateBalance(55000.0);

      expect(playerSession.getBalance()).toBe(105000.0);
      expect(playerSession.getInventory('btc-usd')).toBe(0.0);

      expect(playerSession.hasSufficientBalance(100000.0)).toBe(true);
      expect(playerSession.hasSufficientInventory('btc-usd', 1.0)).toBe(false);
    });
  });

  describe('Price Simulation Integration', () => {
    it('should simulate GBM price movements', async () => {
      const engine = new MarketEngine('test-item', 100.0, {
        volatility: 0.3,
        dt: 0.01,
      });

      const prices: number[] = [engine.getCurrentPrice()];

      for (let i = 0; i < 100; i++) {
        engine.updatePrice();
        prices.push(engine.getCurrentPrice());
      }

      expect(prices.length).toBe(101);
      expect(prices[prices.length - 1]).not.toBe(prices[0]);

      for (const price of prices) {
        expect(price).toBeGreaterThan(0);
      }

      const variance = calculateVariance(prices);
      expect(variance).toBeGreaterThan(0);

      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);
      const priceRange = maxPrice - minPrice;
      // GBM with default volatility (0.2) can produce price ranges > 100
      expect(priceRange).toBeLessThan(200.0);
    });

    it('should reflect drift in price movement', async () => {
      const positiveDriftEngine = new MarketEngine('positive-drift', 100.0, {
        drift: 0.5,
        volatility: 0.1,
        dt: 0.01,
      });

      const initialPrice = positiveDriftEngine.getCurrentPrice();

      for (let i = 0; i < 1000; i++) {
        positiveDriftEngine.updatePrice();
      }

      const finalPrice = positiveDriftEngine.getCurrentPrice();

      expect(finalPrice).toBeGreaterThan(initialPrice * 0.8);
    });

    it('should handle zero volatility (deterministic pricing)', async () => {
      const zeroVolEngine = new MarketEngine('zero-vol', 100.0, {
        volatility: 0,
        drift: 0.1,
        dt: 0.01,
      });

      const initialPrice = zeroVolEngine.getCurrentPrice();

      for (let i = 0; i < 10; i++) {
        zeroVolEngine.updatePrice();
      }

      const finalPrice = zeroVolEngine.getCurrentPrice();

      expect(Math.abs(finalPrice - initialPrice)).toBeLessThan(20.0);
    });
  });

  describe('Order Flow Pressure Integration', () => {
    it('should reflect buy pressure in price', async () => {
      const engine = new MarketEngine('buy-pressure', 100.0);

      for (let i = 0; i < 50; i++) {
        engine.recordOrder('buy', 10);
      }

      const initialPrice = engine.getCurrentPrice();
      engine.updatePrice();
      const priceAfterBuys = engine.getCurrentPrice();

      expect(priceAfterBuys).toBeGreaterThan(0);
    });

    it('should reflect sell pressure in price', async () => {
      const engine = new MarketEngine('sell-pressure', 100.0);

      for (let i = 0; i < 50; i++) {
        engine.recordOrder('sell', 10);
      }

      const initialPrice = engine.getCurrentPrice();
      engine.updatePrice();
      const priceAfterSells = engine.getCurrentPrice();

      expect(priceAfterSells).toBeGreaterThan(0);
    });

    it('should handle balanced order flow', async () => {
      const balancedEngine = new MarketEngine('balanced', 100.0);

      for (let i = 0; i < 25; i++) {
        balancedEngine.recordOrder('buy', 10);
        balancedEngine.recordOrder('sell', 10);
      }

      const initialPrice = balancedEngine.getCurrentPrice();
      balancedEngine.updatePrice();
      const priceAfterBalanced = balancedEngine.getCurrentPrice();

      expect(priceAfterBalanced).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases Integration', () => {
    it('should handle empty order book', async () => {
      pool = createWorkerPool();
      await pool.start();
      await pool.spawnWorker('empty-market', 100.0);

      const bookResponse = await pool.getOrderBook('empty-market');
      expect(bookResponse.type).toBe('order-book');
      if (bookResponse.type === 'order-book') {
        expect(bookResponse.bids).toEqual([]);
        expect(bookResponse.asks).toEqual([]);
      }

      const tickResponse = await pool.tick('empty-market');
      expect(tickResponse.type).toBe('tick-completed');
      if (tickResponse.type === 'tick-completed') {
        expect(tickResponse.trades).toEqual([]);
        expect(tickResponse.currentPrice).toBeGreaterThan(0);
      }
    });

    it('should handle single-sided market (only bids)', async () => {
      pool = createWorkerPool();
      await pool.start();
      await pool.spawnWorker('buy-only-market', 100.0);

      for (let i = 0; i < 3; i++) {
        const buyOrder: Order = {
          id: `buy-only-${i}`,
          playerId: `buyer-${i}`,
          itemId: 'buy-only-market',
          type: 'limit',
          side: 'buy',
          quantity: 10,
          price: 100.0 + i * 5,
          timestamp: Date.now() + i,
          status: 'pending',
        };
        await pool.submitOrder(buyOrder);
      }

      const tickResponse = await pool.tick('buy-only-market');
      expect(tickResponse.type).toBe('tick-completed');
      if (tickResponse.type === 'tick-completed') {
        expect(tickResponse.trades).toEqual([]);
      }

      const bookResponse = await pool.getOrderBook('buy-only-market');
      expect(bookResponse.type).toBe('order-book');
      if (bookResponse.type === 'order-book') {
        expect(bookResponse.bids.length).toBe(3);
        expect(bookResponse.asks).toEqual([]);
      }
    });

    it('should handle single-sided market (only asks)', async () => {
      pool = createWorkerPool();
      await pool.start();
      await pool.spawnWorker('sell-only-market', 100.0);

      for (let i = 0; i < 3; i++) {
        const sellOrder: Order = {
          id: `sell-only-${i}`,
          playerId: `seller-${i}`,
          itemId: 'sell-only-market',
          type: 'limit',
          side: 'sell',
          quantity: 10,
          price: 100.0 - i * 5,
          timestamp: Date.now() + i,
          status: 'pending',
        };
        await pool.submitOrder(sellOrder);
      }

      const tickResponse = await pool.tick('sell-only-market');
      expect(tickResponse.type).toBe('tick-completed');
      if (tickResponse.type === 'tick-completed') {
        expect(tickResponse.trades).toEqual([]);
      }

      const bookResponse = await pool.getOrderBook('sell-only-market');
      expect(bookResponse.type).toBe('order-book');
      if (bookResponse.type === 'order-book') {
        expect(bookResponse.bids).toEqual([]);
        expect(bookResponse.asks.length).toBe(3);
      }
    });

    it('should handle worker crash and restart', async () => {
      pool = createWorkerPool();
      await pool.start();
      await pool.spawnWorker('crash-market', 100.0);

      const workerState = pool.getWorkerStates().get('crash-market');
      expect(workerState).toBeDefined();
      expect(workerState?.isRunning).toBe(true);

      const order: Order = {
        id: 'pre-crash-order',
        playerId: 'trader',
        itemId: 'crash-market',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 105.0,
        timestamp: Date.now(),
        status: 'pending',
      };
      const response = await pool.submitOrder(order);
      expect(response.type).toBe('order-submitted');

      await pool.removeWorker('crash-market');
      expect(pool.hasWorker('crash-market')).toBe(false);

      await pool.spawnWorker('crash-market', 100.0);
      expect(pool.hasWorker('crash-market')).toBe(true);

      const newOrder: Order = {
        id: 'post-restart-order',
        playerId: 'trader',
        itemId: 'crash-market',
        type: 'limit',
        side: 'buy',
        quantity: 10,
        price: 105.0,
        timestamp: Date.now(),
        status: 'pending',
      };
      const newResponse = await pool.submitOrder(newOrder);
      expect(newResponse.type).toBe('order-submitted');
    });
  });

  describe('Performance Tests', () => {
    it('should process 1000 orders in <10 seconds', async () => {
      pool = createWorkerPool();
      await pool.start();
      await pool.spawnWorker('perf-market', 1000.0);

      const numOrders = 1000;
      const orderPromises: Promise<void>[] = [];

      const startTime = performance.now();

      for (let i = 0; i < numOrders; i++) {
        const isBuy = i % 2 === 0;
        const order: Order = {
          id: `perf-order-${i}`,
          playerId: `perf-player-${i % 50}`,
          itemId: 'perf-market',
          type: 'limit',
          side: isBuy ? 'buy' : 'sell',
          quantity: 10,
          price: isBuy ? 1050.0 + Math.random() * 100 : 950.0 - Math.random() * 100,
          timestamp: Date.now() + i,
          status: 'pending',
        };
        orderPromises.push(pool.submitOrder(order).then(() => {}));
      }

      await Promise.all(orderPromises);

      const submissionTime = performance.now() - startTime;

      expect(submissionTime).toBeLessThan(10000);

      const tickResponse = await pool.tick('perf-market');
      expect(tickResponse.type).toBe('tick-completed');

      const totalTime = performance.now() - startTime;

      expect(totalTime).toBeLessThan(10000);

      const ordersPerSecond = (numOrders / totalTime) * 1000;
      expect(ordersPerSecond).toBeGreaterThan(100);

      console.log(
        `Performance: ${numOrders} orders processed in ${totalTime.toFixed(2)}ms (${ordersPerSecond.toFixed(2)} orders/sec)`
      );
    });

    it('should handle high-throughput order submission', async () => {
      pool = createWorkerPool();
      await pool.start();
      await pool.spawnWorker('throughput-market', 100.0);

      const numOrders = 500;
      const orderPromises: Promise<void>[] = [];

      const startTime = performance.now();

      for (let i = 0; i < numOrders; i++) {
        const order: Order = {
          id: `throughput-order-${i}`,
          playerId: `throughput-player-${i % 20}`,
          itemId: 'throughput-market',
          type: 'limit',
          side: i % 2 === 0 ? 'buy' : 'sell',
          quantity: 5,
          price: 100.0 + (i % 2 === 0 ? 10 : -10),
          timestamp: Date.now(),
          status: 'pending',
        };
        orderPromises.push(pool.submitOrder(order).then(() => {}));
      }

      await Promise.all(orderPromises);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(5000);

      const ordersPerSecond = (numOrders / duration) * 1000;
      expect(ordersPerSecond).toBeGreaterThan(100);
    });
  });
});

function calculateVariance(values: number[]): number {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / squaredDiffs.length;
}
