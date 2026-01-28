/**
 * Per-Market Worker Spawning with Bun Workers
 *
 * Spawns one Bun.Worker per market/item for dedicated market processing.
 * Each worker maintains its own:
 * - OrderBook (price-time priority matching)
 * - MarketEngine (GBM price simulation)
 * - PlayerSession registry (player state)
 *
 * Worker message protocol:
 * - 'submit-order' → Process order, add to order book
 * - 'cancel-order' → Cancel order by ID
 * - 'get-order-book' → Return current bid/ask queues
 * - 'tick' → Update price (GBM) and match orders
 *
 * IMPORTANT: WorkerManager (Task 6) manages worker lifecycle via postMessage.
 * Effect.fork creates fibers that send messages to workers.
 * Workers themselves run as separate Bun threads (managed by Bun runtime).
 */

import type { Order, Trade } from './types';

/**
 * Worker message types for main thread → worker communication
 */
export type WorkerMessage =
  | { type: 'submit-order'; order: Order }
  | { type: 'cancel-order'; orderId: string }
  | { type: 'get-order-book' }
  | { type: 'tick' };

/**
 * Worker response types for worker → main thread communication
 */
export type WorkerResponse =
  | { type: 'order-submitted'; orderId: string; trades: Trade[] }
  | { type: 'order-cancelled'; orderId: string }
  | { type: 'order-book'; bids: Order[]; asks: Order[] }
  | { type: 'tick-completed'; trades: Trade[]; currentPrice: number }
  | { type: 'error'; message: string };

/**
 * Market worker state for crash recovery
 */
interface MarketWorkerState {
  itemId: string;
  initialPrice: number;
  isRunning: boolean;
  crashCount: number;
  lastCrashTime: number;
}

/**
 * MarketWorker class wraps a Bun.Worker for per-market processing
 *
 * Manages:
 * - Worker lifecycle (spawn, restart, shutdown)
 * - Message routing (postMessage to worker)
 * - Crash handling (exponential backoff restart)
 */
export class MarketWorker {
  readonly itemId: string;
  private worker: Worker | null = null;
  private state: MarketWorkerState;
  private pendingResponses: Map<number, (response: WorkerResponse) => void>;
  private nextMessageId: number = 0;
  private restartTimeout?: ReturnType<typeof setTimeout>;

  constructor(itemId: string, initialPrice: number) {
    this.itemId = itemId;
    this.state = {
      itemId,
      initialPrice,
      isRunning: false,
      crashCount: 0,
      lastCrashTime: 0,
    };
    this.pendingResponses = new Map();
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.state.isRunning) {
      console.warn(`MarketWorker for ${this.itemId} is already running`);
      return;
    }

    await this.spawnWorker();
    this.state.isRunning = true;
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    if (!this.state.isRunning) {
      return;
    }

    this.state.isRunning = false;

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = undefined;
    }

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    // Reject all pending responses
    for (const [messageId, callback] of this.pendingResponses) {
      callback({ type: 'error', message: 'Worker stopped' });
    }
    this.pendingResponses.clear();
  }

  /**
   * Submit an order to the worker
   * @param order - Order to submit
   * @returns Promise resolving to worker response
   */
  async submitOrder(order: Order): Promise<WorkerResponse> {
    const message: WorkerMessage = { type: 'submit-order', order };
    return this.sendMessage(message);
  }

  /**
   * Cancel an order
   * @param orderId - Order ID to cancel
   * @returns Promise resolving to worker response
   */
  async cancelOrder(orderId: string): Promise<WorkerResponse> {
    const message: WorkerMessage = { type: 'cancel-order', orderId };
    return this.sendMessage(message);
  }

  /**
   * Get current order book
   * @returns Promise resolving to order book data
   */
  async getOrderBook(): Promise<WorkerResponse> {
    const message: WorkerMessage = { type: 'get-order-book' };
    return this.sendMessage(message);
  }

  /**
   * Trigger market tick (price update and order matching)
   * @returns Promise resolving to tick result
   */
  async tick(): Promise<WorkerResponse> {
    const message: WorkerMessage = { type: 'tick' };
    return this.sendMessage(message);
  }

  /**
   * Get worker state
   */
  getState(): MarketWorkerState {
    return { ...this.state };
  }

  /**
   * Send a message to the worker and wait for response
   * @param message - Message to send
   * @returns Promise resolving to worker response
   */
  private async sendMessage(message: WorkerMessage): Promise<WorkerResponse> {
    if (!this.worker || !this.state.isRunning) {
      return { type: 'error', message: 'Worker not running' };
    }

    const messageId = this.nextMessageId++;

    return new Promise((resolve) => {
      this.pendingResponses.set(messageId, resolve);

      // Set timeout for response
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(messageId);
        resolve({ type: 'error', message: 'Worker response timeout' });
      }, 5000);

      // Override resolve to clear timeout
      const originalResolve = resolve;
      const wrappedResolve = (response: WorkerResponse) => {
        clearTimeout(timeout);
        originalResolve(response);
      };

      this.pendingResponses.set(messageId, wrappedResolve);

      // Send message with correlation ID
      if (this.worker) {
        this.worker.postMessage({ ...message, _messageId: messageId });
      }
    });
  }

  /**
   * Spawn a new Bun worker
   */
  private async spawnWorker(): Promise<void> {
    const workerPath = import.meta.url.replace('market-worker.ts', 'market-worker-thread.ts');

    this.worker = new Worker(workerPath, {
      type: 'module',
    });

    // Set up message handler
    this.worker.onmessage = (event) => {
      const response = event.data as WorkerResponse & { _messageId?: number };
      const messageId = response._messageId;

      if (messageId !== undefined && this.pendingResponses.has(messageId)) {
        const callback = this.pendingResponses.get(messageId);
        if (callback) {
          this.pendingResponses.delete(messageId);
          callback(response);
        }
      }
    };

    // Set up error handler for crash detection
    this.worker.onerror = (error) => {
      console.error(`Worker for ${this.itemId} error:`, error);
      this.handleCrash();
    };

    // Initialize worker with market state
    this.worker.postMessage({
      type: 'initialize',
      itemId: this.itemId,
      initialPrice: this.state.initialPrice,
    });
  }

  /**
   * Handle worker crash with exponential backoff restart
   */
  private handleCrash(): void {
    if (!this.state.isRunning) {
      return;
    }

    this.state.crashCount++;
    this.state.lastCrashTime = Date.now();

    // Calculate exponential backoff: 2^crashCount * 100ms, max 10s
    const backoffMs = Math.min(Math.pow(2, this.state.crashCount) * 100, 10000);

    console.warn(
      `Worker for ${this.itemId} crashed (count: ${this.state.crashCount}). ` +
        `Restarting in ${backoffMs}ms...`
    );

    // Clean up old worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    // Schedule restart
    this.restartTimeout = setTimeout(async () => {
      if (!this.state.isRunning) {
        return;
      }

      try {
        await this.spawnWorker();
        console.log(`Worker for ${this.itemId} restarted successfully`);
      } catch (error) {
        console.error(`Failed to restart worker for ${this.itemId}:`, error);
        this.handleCrash();
      }
    }, backoffMs);
  }
}

/**
 * WorkerPool manages per-market workers
 *
 * Provides:
 * - Worker pool (Map<itemId, MarketWorker>)
 * - Spawn workers for new markets
 * - Route orders to correct worker by itemId
 * - Aggregate market updates from workers
 */
export class WorkerPool {
  private workers: Map<string, MarketWorker>;
  private isRunning: boolean = false;

  constructor() {
    this.workers = new Map();
  }

  /**
   * Start the worker pool
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('WorkerPool is already running');
      return;
    }

    this.isRunning = true;
    console.log('WorkerPool started');
  }

  /**
   * Stop all workers
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop all workers
    const stopPromises = Array.from(this.workers.values()).map((worker) => worker.stop());
    await Promise.all(stopPromises);

    this.workers.clear();
    console.log('WorkerPool stopped');
  }

  /**
   * Spawn a worker for a new market
   * @param itemId - Item/market identifier
   * @param initialPrice - Initial price for the market
   */
  async spawnWorker(itemId: string, initialPrice: number): Promise<void> {
    if (this.workers.has(itemId)) {
      console.warn(`Worker for ${itemId} already exists`);
      return;
    }

    const worker = new MarketWorker(itemId, initialPrice);
    await worker.start();
    this.workers.set(itemId, worker);
    console.log(`Worker spawned for ${itemId}`);
  }

  /**
   * Submit an order to the correct worker by itemId
   * @param order - Order to submit
   * @returns Promise resolving to worker response
   */
  async submitOrder(order: Order): Promise<WorkerResponse> {
    const worker = this.workers.get(order.itemId);

    if (!worker) {
      return {
        type: 'error',
        message: `No worker for item ${order.itemId}`,
      };
    }

    return await worker.submitOrder(order);
  }

  /**
   * Cancel an order
   * @param itemId - Item identifier
   * @param orderId - Order ID to cancel
   * @returns Promise resolving to worker response
   */
  async cancelOrder(itemId: string, orderId: string): Promise<WorkerResponse> {
    const worker = this.workers.get(itemId);

    if (!worker) {
      return {
        type: 'error',
        message: `No worker for item ${itemId}`,
      };
    }

    return await worker.cancelOrder(orderId);
  }

  /**
   * Get order book for a market
   * @param itemId - Item identifier
   * @returns Promise resolving to order book data
   */
  async getOrderBook(itemId: string): Promise<WorkerResponse> {
    const worker = this.workers.get(itemId);

    if (!worker) {
      return {
        type: 'error',
        message: `No worker for item ${itemId}`,
      };
    }

    return await worker.getOrderBook();
  }

  /**
   * Trigger tick for all markets
   * @returns Map of itemId to tick results
   */
  async tickAll(): Promise<Map<string, WorkerResponse>> {
    const results = new Map<string, WorkerResponse>();

    const tickPromises = Array.from(this.workers.entries()).map(async ([itemId, worker]) => {
      const result = await worker.tick();
      results.set(itemId, result);
    });

    await Promise.all(tickPromises);
    return results;
  }

  /**
   * Trigger tick for a specific market
   * @param itemId - Item identifier
   * @returns Promise resolving to tick result
   */
  async tick(itemId: string): Promise<WorkerResponse> {
    const worker = this.workers.get(itemId);

    if (!worker) {
      return {
        type: 'error',
        message: `No worker for item ${itemId}`,
      };
    }

    return await worker.tick();
  }

  /**
   * Check if a worker exists for an item
   * @param itemId - Item identifier
   * @returns True if worker exists
   */
  hasWorker(itemId: string): boolean {
    return this.workers.has(itemId);
  }

  /**
   * Get all worker states
   * @returns Map of itemId to worker state
   */
  getWorkerStates(): Map<string, MarketWorkerState> {
    const states = new Map<string, MarketWorkerState>();

    for (const [itemId, worker] of this.workers) {
      states.set(itemId, worker.getState());
    }

    return states;
  }

  /**
   * Get number of active workers
   */
  getWorkerCount(): number {
    return this.workers.size;
  }

  /**
   * Remove a worker from the pool
   * @param itemId - Item identifier
   */
  async removeWorker(itemId: string): Promise<void> {
    const worker = this.workers.get(itemId);

    if (worker) {
      await worker.stop();
      this.workers.delete(itemId);
      console.log(`Worker removed for ${itemId}`);
    }
  }
}

/**
 * Factory function to create a WorkerPool
 */
export function createWorkerPool(): WorkerPool {
  return new WorkerPool();
}

/**
 * Market worker state type for external use
 */
export type { MarketWorkerState };
