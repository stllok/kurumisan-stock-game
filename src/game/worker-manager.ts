/**
 * Worker Manager - Effect-based coordination for game loop and task processing
 *
 * Provides async coordination using Effect primitives:
 * - Queue<T>: Bounded queue for order processing tasks
 * - PubSub<T>: Publish-subscribe for market updates to players
 * - Ref<WorkerStats>: Worker statistics (orders processed, trades matched)
 * - Effect.fork: Spawn worker fibers for concurrent execution
 * - Effect.repeat(Schedule): Game tick loop with configurable intervals
 * - Effect.acquireRelease: Worker lifecycle management (startup/shutdown)
 *
 * Note: PubSub publishes MarketUpdate events that are consumed by MarketDataInterface
 * for WebSocket distribution to players (not implemented in this task).
 */

import { Queue, PubSub, Ref, Effect, Schedule, Fiber, Scope } from 'effect';
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

export class WorkerManager {
  private readonly config: WorkerManagerConfig;
  private orderQueue: Queue.Queue<WorkerTask>;
  private marketUpdates: PubSub.PubSub<MarketUpdate>;
  private stats: Ref.Ref<WorkerStats>;
  private workerFibers: Set<Fiber.RuntimeFiber<void>> = new Set();
  private orderProcessor?: OrderProcessor;
  private priceProvider?: PriceProvider;
  private scope?: Scope.Scope;
  private startTime: number = Date.now();
  private isRunning: boolean = false;

  constructor(config?: Partial<WorkerManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.orderQueue = Effect.runSync(Queue.bounded<WorkerTask>(this.config.queueCapacity));
    this.marketUpdates = Effect.runSync(PubSub.bounded<MarketUpdate>(this.config.queueCapacity));
    this.stats = Effect.runSync(
      Ref.make<WorkerStats>({
        ordersProcessed: 0,
        tradesMatched: 0,
        marketUpdatesBroadcast: 0,
        workersActive: 0,
        workersRestarted: 0,
        uptime: 0,
        lastTickTime: Date.now(),
      })
    );
  }

  setOrderProcessor(processor: OrderProcessor): void {
    this.orderProcessor = processor;
  }

  setPriceProvider(provider: PriceProvider): void {
    this.priceProvider = provider;
  }

  async start(scope: Scope.Scope): Promise<void> {
    if (this.isRunning) {
      console.warn('WorkerManager is already running');
      return;
    }

    this.scope = scope;
    this.isRunning = true;

    for (let i = 0; i < this.config.workerPoolSize; i++) {
      const workerId = i;
      const self = this;

      await Effect.runPromise(
        Effect.gen(function* ($) {
          const fiber = yield* $(Effect.fork(Effect.forever(self.processOrderQueue(workerId))));
          return fiber;
        }).pipe(
          Effect.tap((fiber) => {
            self.workerFibers.add(fiber);
            Effect.runSync(
              Ref.update(self.stats, (s) => ({ ...s, workersActive: s.workersActive + 1 }))
            );
          })
        )
      );
    }

    const self = this;

    await Effect.runPromise(
      Effect.gen(function* ($) {
        const tickFiber = yield* $(Effect.fork(Effect.forever(self.gameTickLoop())));
        return tickFiber;
      }).pipe(
        Effect.tap((fiber) => {
          self.workerFibers.add(fiber);
        })
      )
    );
  }

  async gracefulShutdown(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('Initiating graceful shutdown of WorkerManager...');
    this.isRunning = false;

    for (const fiber of this.workerFibers) {
      await Effect.runPromise(Fiber.interrupt(fiber));
    }

    this.workerFibers.clear();

    Effect.runSync(
      Ref.update(this.stats, (s) => ({
        ...s,
        workersActive: 0,
      }))
    );

    console.log('WorkerManager shutdown complete');
  }

  async enqueueOrder(order: Order): Promise<void> {
    const task: OrderTask = {
      type: 'process-order',
      order,
      timestamp: Date.now(),
    };

    await Effect.runPromise(Queue.offer(this.orderQueue, task));
  }

  async enqueueMarketTick(itemId: string): Promise<void> {
    const task: MarketTickTask = {
      type: 'market-tick',
      itemId,
      timestamp: Date.now(),
    };

    await Effect.runPromise(Queue.offer(this.orderQueue, task));
  }

  getStats(): WorkerStats {
    return Effect.runSync(Ref.get(this.stats));
  }

  processOrderQueue(workerId: number): Effect.Effect<void, never, never> {
    const self = this;

    return Effect.gen(function* ($) {
      while (true) {
        const task = yield* $(Queue.take(self.orderQueue));

        const startTime = Date.now();

        if (task.type === 'process-order') {
          yield* $(
            self.processOrder(task).pipe(
              Effect.catchAll((error) =>
                Effect.sync(() => {
                  console.error(`Failed to process order ${task.order.id}:`, error);
                })
              ),
              Effect.retry(Schedule.exponential(self.config.retryDelay)),
              Effect.timeout(self.config.retryDelay * self.config.maxRetries)
            )
          );
        } else if (task.type === 'market-tick') {
          yield* $(self.processMarketTick(task));
        }

        const duration = Date.now() - startTime;

        Effect.runSync(
          Ref.update(self.stats, (s) => ({
            ...s,
            uptime: Date.now() - self.startTime,
          }))
        );
      }
    }).pipe(Effect.annotateLogs({ worker: `worker-${workerId}` }));
  }

  broadcastMarketUpdates(): Effect.Effect<void, never, never> {
    const self = this;

    return Effect.gen(function* ($) {
      const priceProvider = self.priceProvider;

      if (!priceProvider) {
        yield* $(Effect.log('PriceProvider not set, skipping market updates'));
        return;
      }

      try {
        const priceData = yield* $(Effect.tryPromise(() => priceProvider('item-1')));

        const update: MarketUpdate = {
          itemId: 'item-1',
          currentPrice: priceData.price,
          bestBid: priceData.bestBid,
          bestAsk: priceData.bestAsk,
          timestamp: Date.now(),
        };

        yield* $(PubSub.publish(self.marketUpdates, update));

        yield* $(
          Effect.sync(() => {
            Effect.runSync(
              Ref.update(self.stats, (s) => ({
                ...s,
                marketUpdatesBroadcast: s.marketUpdatesBroadcast + 1,
              }))
            );
          })
        );
      } catch (error) {
        yield* $(Effect.logError('Failed to broadcast market update', { error }));
      }
    });
  }

  async subscribeToMarket(itemId: string): Promise<Effect.Effect<MarketUpdate, never, never>> {
    const subscription = PubSub.subscribe(this.marketUpdates);

    return Effect.gen(function* ($) {
      while (true) {
        const update = yield* $(Queue.take(subscription));
        if (update.itemId === itemId) {
          return update;
        }
      }
    });
  }

  async restartWorker(workerId: number): Promise<void> {
    console.log(`Restarting worker ${workerId}...`);

    const self = this;

    Effect.runSync(
      Ref.update(self.stats, (s) => ({
        ...s,
        workersRestarted: s.workersRestarted + 1,
      }))
    );

    await Effect.runPromise(
      Effect.gen(function* ($) {
        const fiber = yield* $(Effect.fork(Effect.forever(self.processOrderQueue(workerId))));
        return fiber;
      }).pipe(
        Effect.tap((fiber) => {
          self.workerFibers.add(fiber);
          console.log(`Worker ${workerId} restarted successfully`);
        })
      )
    );
  }

  isQueueEmpty(): boolean {
    return Effect.runSync(Queue.isEmpty(this.orderQueue));
  }

  getQueueSize(): number {
    return Effect.runSync(Queue.size(this.orderQueue));
  }

  private processOrder(task: OrderTask): Effect.Effect<Trade[], never, never> {
    const self = this;

    return Effect.gen(function* ($) {
      const processor = self.orderProcessor;

      if (!processor) {
        yield* $(Effect.logWarning('OrderProcessor not set, skipping order processing'));
        return [];
      }

      const trades = yield* $(Effect.tryPromise(() => processor(task.order)));

      yield* $(
        Effect.sync(() => {
          Effect.runSync(
            Ref.update(self.stats, (s) => ({
              ...s,
              ordersProcessed: s.ordersProcessed + 1,
              tradesMatched: s.tradesMatched + trades.length,
            }))
          );
        })
      );

      yield* $(Effect.log(`Order ${task.order.id} processed, ${trades.length} trades generated`));

      return trades;
    });
  }

  private processMarketTick(task: MarketTickTask): Effect.Effect<void, never, never> {
    const self = this;

    return Effect.gen(function* ($) {
      const provider = self.priceProvider;

      if (!provider) {
        yield* $(Effect.logWarning('PriceProvider not set, skipping market tick'));
        return;
      }

      const priceData = yield* $(Effect.tryPromise(() => provider(task.itemId)));

      const update: MarketUpdate = {
        itemId: task.itemId,
        currentPrice: priceData.price,
        bestBid: priceData.bestBid,
        bestAsk: priceData.bestAsk,
        timestamp: Date.now(),
      };

      yield* $(PubSub.publish(self.marketUpdates, update));

      yield* $(
        Effect.sync(() => {
          Effect.runSync(
            Ref.update(self.stats, (s) => ({
              ...s,
              lastTickTime: Date.now(),
            }))
          );
        })
      );

      yield* $(Effect.log(`Market tick processed for ${task.itemId}: ${priceData.price}`));
    });
  }

  private gameTickLoop(): Effect.Effect<void, never, never> {
    const self = this;

    return Effect.gen(function* ($) {
      yield* $(Effect.log('Game tick loop started'));

      yield* $(
        Effect.sync(() => {
          Effect.runSync(
            Ref.update(self.stats, (s) => ({
              ...s,
              lastTickTime: Date.now(),
            }))
          );
        })
      );

      yield* $(self.broadcastMarketUpdates());
    }).pipe(Effect.repeat(Schedule.spaced(`${self.config.tickInterval} millis`)));
  }
}

export function createOrderProcessor(orderBook: OrderBook): OrderProcessor {
  return async (order: Order) => {
    return [];
  };
}

export function createPriceProvider(marketEngine: MarketEngine): PriceProvider {
  return async (itemId: string) => {
    const price = marketEngine.getCurrentPrice();
    const bestBid = price * 0.99;
    const bestAsk = price * 1.01;

    return { price, bestBid, bestAsk };
  };
}

export function createWorkerManager(config?: Partial<WorkerManagerConfig>): WorkerManager {
  return new WorkerManager(config);
}

export function acquireWorkerManager(
  config?: Partial<WorkerManagerConfig>
): Effect.Effect<WorkerManager, never, Scope.Scope> {
  return Effect.gen(function* ($) {
    const manager = new WorkerManager(config);
    const scope = yield* $(Scope.make());

    yield* $(Effect.tryPromise(() => manager.start(scope)));

    yield* $(
      Scope.addFinalizer(
        scope,
        Effect.sync(() => manager.gracefulShutdown())
      )
    );

    return manager;
  });
}
