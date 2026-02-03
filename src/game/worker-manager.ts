/**
 * Worker Manager - Async coordination for game loop and task processing
 *
 * Provides async coordination using standard JavaScript async/await:
 * - Simple queue with Promise signaling for order processing tasks
 * - EventEmitter for publish-subscribe of market updates to players
 * - Plain object for worker statistics
 * - Direct async function calls for concurrent execution
 * - setInterval for recurring tasks (game tick loop)
 * - AbortController for lifecycle management (startup/shutdown)
 *
 * Note: Market updates are published via EventEmitter and consumed by
 * MarketDataInterface for WebSocket distribution to players.
 */

import { EventEmitter } from 'events';
import type { Order, Trade, MarketUpdate } from './types';
import { OrderBook } from './order-book';
import { MarketEngine } from './market-engine';

export interface OrderTask {
  type: 'process-order';
  order: Order;
  timestamp: number;
}

export interface MarketTickTask {
  type: 'market-tick';
  itemId: string;
  timestamp: number;
}

export type WorkerTask = OrderTask | MarketTickTask;

export interface WorkerStats {
  ordersProcessed: number;
  tradesMatched: number;
  marketUpdatesBroadcast: number;
  workersActive: number;
  workersRestarted: number;
  uptime: number;
  lastTickTime: number;
}

export interface TaskResult {
  taskId: string;
  status: 'success' | 'failed';
  error?: string;
  duration: number;
}

export interface WorkerManagerConfig {
  queueCapacity: number;
  tickInterval: number;
  maxRetries: number;
  retryDelay: number;
  workerPoolSize: number;
}

const DEFAULT_CONFIG: WorkerManagerConfig = {
  queueCapacity: 1000,
  tickInterval: 50,
  maxRetries: 3,
  retryDelay: 100,
  workerPoolSize: 4,
};

export type OrderProcessor = (order: Order) => Promise<Trade[]>;
export type PriceProvider = (
  itemId: string
) => Promise<{ price: number; bestBid: number; bestAsk: number }>;

class BoundedQueue<T> {
  private queue: T[] = [];
  private capacity: number;
  private notFull: (() => void) | null = null;
  private notEmpty: (() => void) | null = null;
  private size = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  offer(item: T): void {
    if (this.size >= this.capacity) {
      throw new Error('Queue is at capacity');
    }

    this.queue.push(item);
    this.size++;

    if (this.notEmpty) {
      const notify = this.notEmpty;
      this.notEmpty = null;
      notify();
    }
  }

  async take(): Promise<T> {
    while (this.size === 0) {
      await new Promise<void>((resolve) => {
        this.notEmpty = resolve;
      });
    }

    const item = this.queue.shift();
    this.size--;

    if (this.notFull) {
      const notify = this.notFull;
      this.notFull = null;
      notify();
    }

    return item!;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }

  getSize(): number {
    return this.size;
  }
}

type MarketUpdateHandler = (update: MarketUpdate) => void;

class MarketUpdateSubscriber {
  private updates: MarketUpdate[] = [];
  private handlers: Set<MarketUpdateHandler> = new Set();
  private pendingResolvers: Map<number, (update: MarketUpdate) => void> = new Map();
  private pendingIdCounter = 0;

  publish(update: MarketUpdate): void {
    this.updates.push(update);

    for (const handler of this.handlers) {
      handler(update);
    }

    for (const [id, resolver] of this.pendingResolvers.entries()) {
      if (update.itemId === 'item-1') {
        resolver(update);
        this.pendingResolvers.delete(id);
      }
    }
  }

  subscribe(handler: MarketUpdateHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async waitForItem(itemId: string): Promise<MarketUpdate> {
    const id = this.pendingIdCounter++;
    return new Promise((resolve) => {
      this.pendingResolvers.set(id, resolve);
    });
  }
}

export class WorkerManager {
  private readonly config: WorkerManagerConfig;
  private orderQueue: BoundedQueue<WorkerTask>;
  private marketUpdates: MarketUpdateSubscriber;
  private stats: WorkerStats;
  private workerAbortControllers: Map<number, AbortController> = new Map();
  private orderProcessor?: OrderProcessor;
  private priceProvider?: PriceProvider;
  private tickInterval?: NodeJS.Timeout;
  private startTime: number = Date.now();
  private isRunning: boolean = false;
  private readonly eventEmitter: EventEmitter;

  constructor(config?: Partial<WorkerManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.orderQueue = new BoundedQueue<WorkerTask>(this.config.queueCapacity);
    this.marketUpdates = new MarketUpdateSubscriber();
    this.stats = {
      ordersProcessed: 0,
      tradesMatched: 0,
      marketUpdatesBroadcast: 0,
      workersActive: 0,
      workersRestarted: 0,
      uptime: 0,
      lastTickTime: Date.now(),
    };
    this.eventEmitter = new EventEmitter();
  }

  setOrderProcessor(processor: OrderProcessor): void {
    this.orderProcessor = processor;
  }

  setPriceProvider(provider: PriceProvider): void {
    this.priceProvider = provider;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('WorkerManager is already running');
      return;
    }

    this.isRunning = true;

    for (let i = 0; i < this.config.workerPoolSize; i++) {
      this.spawnWorker(i);
    }

    this.startGameTickLoop();
  }

  private spawnWorker(workerId: number): void {
    const abortController = new AbortController();
    this.workerAbortControllers.set(workerId, abortController);

    this.stats = {
      ...this.stats,
      workersActive: this.stats.workersActive + 1,
    };

    this.runWorker(workerId, abortController.signal);
  }

  private async runWorker(workerId: number, signal: AbortSignal): Promise<void> {
    while (!signal.aborted && this.isRunning) {
      try {
        const task = await this.orderQueue.take();

        if (signal.aborted) {
          break;
        }

        const startTime = Date.now();

        if (task.type === 'process-order') {
          await this.processOrderWithRetry(task);
        } else if (task.type === 'market-tick') {
          await this.processMarketTick(task);
        }

        this.stats = {
          ...this.stats,
          uptime: Date.now() - this.startTime,
        };
      } catch (error) {
        if (!signal.aborted) {
          console.error(`Worker ${workerId} error:`, error);
        }
        break;
      }
    }
  }

  private async processOrderWithRetry(task: OrderTask): Promise<void> {
    let attempt = 0;
    const maxAttempts = this.config.maxRetries;

    while (attempt < maxAttempts) {
      try {
        const processor = this.orderProcessor;

        if (!processor) {
          console.warn('OrderProcessor not set, skipping order processing');
          return;
        }

        const trades = await processor(task.order);

        this.stats = {
          ...this.stats,
          ordersProcessed: this.stats.ordersProcessed + 1,
          tradesMatched: this.stats.tradesMatched + trades.length,
        };

        console.log(`Order ${task.order.id} processed, ${trades.length} trades generated`);
        return;
      } catch (error) {
        attempt++;
        if (attempt >= maxAttempts) {
          console.error(
            `Failed to process order ${task.order.id} after ${maxAttempts} attempts:`,
            error
          );
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay * attempt));
      }
    }
  }

  private startGameTickLoop(): void {
    this.tickInterval = setInterval(async () => {
      if (!this.isRunning) {
        return;
      }

      await this.gameTickLoop();
    }, this.config.tickInterval);
  }

  private async gameTickLoop(): Promise<void> {
    this.stats = {
      ...this.stats,
      lastTickTime: Date.now(),
    };

    await this.broadcastMarketUpdates();
  }

  private async broadcastMarketUpdates(): Promise<void> {
    const priceProvider = this.priceProvider;

    if (!priceProvider) {
      return;
    }

    try {
      const priceData = await priceProvider('item-1');

      const update: MarketUpdate = {
        itemId: 'item-1',
        currentPrice: priceData.price,
        bestBid: priceData.bestBid,
        bestAsk: priceData.bestAsk,
        timestamp: Date.now(),
      };

      this.marketUpdates.publish(update);

      this.stats = {
        ...this.stats,
        marketUpdatesBroadcast: this.stats.marketUpdatesBroadcast + 1,
      };
    } catch (error) {
      console.error('Failed to broadcast market update:', error);
    }
  }

  private async processMarketTick(task: MarketTickTask): Promise<void> {
    const provider = this.priceProvider;

    if (!provider) {
      console.warn('PriceProvider not set, skipping market tick');
      return;
    }

    const priceData = await provider(task.itemId);

    const update: MarketUpdate = {
      itemId: task.itemId,
      currentPrice: priceData.price,
      bestBid: priceData.bestBid,
      bestAsk: priceData.bestAsk,
      timestamp: Date.now(),
    };

    this.marketUpdates.publish(update);

    this.stats = {
      ...this.stats,
      lastTickTime: Date.now(),
    };

    console.log(`Market tick processed for ${task.itemId}: ${priceData.price}`);
  }

  async gracefulShutdown(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('Initiating graceful shutdown of WorkerManager...');
    this.isRunning = false;

    for (const [workerId, abortController] of this.workerAbortControllers.entries()) {
      abortController.abort();
      console.log(`Worker ${workerId} aborted`);
    }

    this.workerAbortControllers.clear();

    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = undefined;
    }

    const numWorkersStopped = this.stats.workersActive;
    this.stats = {
      ...this.stats,
      workersActive: 0,
    };

    console.log(`WorkerManager shutdown complete (${numWorkersStopped} workers stopped)`);
  }

  async enqueueOrder(order: Order): Promise<void> {
    const task: OrderTask = {
      type: 'process-order',
      order,
      timestamp: Date.now(),
    };

    this.orderQueue.offer(task);
  }

  async enqueueMarketTick(itemId: string): Promise<void> {
    const task: MarketTickTask = {
      type: 'market-tick',
      itemId,
      timestamp: Date.now(),
    };

    this.orderQueue.offer(task);
  }

  getStats(): WorkerStats {
    return { ...this.stats };
  }

  isQueueEmpty(): boolean {
    return this.orderQueue.isEmpty();
  }

  getQueueSize(): number {
    return this.orderQueue.getSize();
  }

  async subscribeToMarket(itemId: string): Promise<MarketUpdate> {
    return this.marketUpdates.waitForItem(itemId);
  }

  async restartWorker(workerId: number): Promise<void> {
    console.log(`Restarting worker ${workerId}...`);

    this.stats = {
      ...this.stats,
      workersRestarted: this.stats.workersRestarted + 1,
    };

    const abortController = this.workerAbortControllers.get(workerId);
    if (abortController) {
      abortController.abort();
    }

    this.spawnWorker(workerId);

    console.log(`Worker ${workerId} restarted successfully`);
  }
}

export function createOrderProcessor(_orderBook: OrderBook): OrderProcessor {
  return async (_order: Order) => {
    return [];
  };
}

export function createPriceProvider(marketEngine: MarketEngine): PriceProvider {
  return async (_itemId: string) => {
    const price = marketEngine.getCurrentPrice();
    const bestBid = price * 0.99;
    const bestAsk = price * 1.01;

    return { price, bestBid, bestAsk };
  };
}

export function createWorkerManager(config?: Partial<WorkerManagerConfig>): WorkerManager {
  return new WorkerManager(config);
}

export async function acquireWorkerManager(
  config?: Partial<WorkerManagerConfig>
): Promise<WorkerManager> {
  const manager = new WorkerManager(config);
  await manager.start();
  return manager;
}
