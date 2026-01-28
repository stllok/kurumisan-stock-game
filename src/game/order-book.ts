/**
 * Order Book with price-time priority matching
 *
 * Implements a double-sided order book with:
 * - Bid heap: Max heap (highest price first), price-time priority
 * - Ask heap: Min heap (lowest price first), price-time priority
 * - Support for limit and market orders
 * - Partial fills supported
 */

import type { Order, OrderSide, Trade } from './types';

/**
 * Priority queue implementation with custom comparator
 */
class PriorityQueue<T> {
  private heap: T[] = [];
  private comparator: (a: T, b: T) => number;

  constructor(comparator: (a: T, b: T) => number) {
    this.comparator = comparator;
  }

  size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  peek(): T | undefined {
    return this.heap[0];
  }

  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }
    const root = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return root;
  }

  remove(predicate: (item: T) => boolean): boolean {
    const index = this.heap.findIndex(predicate);
    if (index === -1) {
      return false;
    }
    const last = this.heap.pop()!;
    if (index < this.heap.length) {
      this.heap[index] = last;
      this.bubbleUp(index);
      this.bubbleDown(index);
    }
    return true;
  }

  toArray(): T[] {
    return [...this.heap];
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.comparator(this.heap[index], this.heap[parentIndex]) >= 0) {
        break;
      }
      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;
      let swapIndex = index;

      if (
        leftChildIndex < length &&
        this.comparator(this.heap[leftChildIndex], this.heap[swapIndex]) < 0
      ) {
        swapIndex = leftChildIndex;
      }

      if (
        rightChildIndex < length &&
        this.comparator(this.heap[rightChildIndex], this.heap[swapIndex]) < 0
      ) {
        swapIndex = rightChildIndex;
      }

      if (swapIndex === index) {
        break;
      }

      [this.heap[index], this.heap[swapIndex]] = [this.heap[swapIndex], this.heap[index]];
      index = swapIndex;
    }
  }
}

/**
 * Order Book with price-time priority matching
 */
export class OrderBook {
  private bids: PriorityQueue<Order>;
  private asks: PriorityQueue<Order>;
  private orders: Map<string, Order>; // orderId -> Order for O(1) lookup
  private nextTradeId: number = 0;

  constructor() {
    // Bids: Max heap on price (highest first), min heap on timestamp (for same price, earliest first)
    this.bids = new PriorityQueue((a, b) => {
      if (a.price === undefined || b.price === undefined) {
        return 0;
      }
      // Max heap: higher price first (return negative when a should come before b)
      if (b.price !== a.price) {
        return b.price - a.price;
      }
      // Same price: FIFO (earlier timestamp first)
      return a.timestamp - b.timestamp;
    });

    // Asks: Min heap on price, min heap on timestamp (for same price, earliest first)
    this.asks = new PriorityQueue((a, b) => {
      if (a.price === undefined || b.price === undefined) {
        return 0;
      }
      // Min heap: lower price first
      if (a.price !== b.price) {
        return a.price - b.price;
      }
      // Same price: FIFO (earlier timestamp first)
      return a.timestamp - b.timestamp;
    });

    this.orders = new Map();
  }

  /**
   * Add an order to the book
   * @param order - Order to add
   */
  addOrder(order: Order): void {
    // Add to appropriate heap based on side
    if (order.side === 'buy') {
      this.bids.push(order);
    } else {
      this.asks.push(order);
    }

    // Store in map for O(1) lookup
    this.orders.set(order.id, order);
  }

  /**
   * Remove an order from the book (cancel order)
   * @param orderId - ID of order to remove
   * @returns true if order was found and removed, false otherwise
   */
  removeOrder(orderId: string): boolean {
    const order = this.orders.get(orderId);
    if (!order) {
      return false;
    }

    // Remove from appropriate heap
    if (order.side === 'buy') {
      this.bids.remove((o) => o.id === orderId);
    } else {
      this.asks.remove((o) => o.id === orderId);
    }

    // Remove from map
    this.orders.delete(orderId);
    return true;
  }

  /**
   * Match orders and generate trades
   * @returns Array of trades generated from matching
   */
  matchOrders(): Trade[] {
    const trades: Trade[] = [];

    while (true) {
      const bestBid = this.bids.peek();
      const bestAsk = this.asks.peek();

      // No matching possible if either side is empty
      if (!bestBid || !bestAsk) {
        break;
      }

      // Check if prices cross
      const bidPrice = bestBid.price;
      const askPrice = bestAsk.price;

      // Market orders or limit orders with crossing prices
      const canMatch =
        bestBid.type === 'market' ||
        bestAsk.type === 'market' ||
        (bidPrice !== undefined && askPrice !== undefined && bidPrice >= askPrice);

      if (!canMatch) {
        break;
      }

      // Determine trade price
      let tradePrice: number;
      if (bestBid.type === 'market') {
        // Market buy: use ask price
        tradePrice = askPrice ?? 0;
      } else if (bestAsk.type === 'market') {
        // Market sell: use bid price
        tradePrice = bidPrice ?? 0;
      } else {
        // Both limit: use ask price (earlier timestamp)
        tradePrice = askPrice!;
      }

      // Determine trade quantity
      const tradeQuantity = Math.min(bestBid.quantity, bestAsk.quantity);

      // Generate trade
      const trade: Trade = {
        id: `trade-${this.nextTradeId++}`,
        buyOrderId: bestBid.id,
        sellOrderId: bestAsk.id,
        itemId: bestBid.itemId,
        quantity: tradeQuantity,
        price: tradePrice,
        timestamp: Date.now(),
      };
      trades.push(trade);

      // Update quantities
      bestBid.quantity -= tradeQuantity;
      bestAsk.quantity -= tradeQuantity;

      // Remove filled orders from top of heap
      if (bestBid.quantity === 0) {
        this.bids.pop();
        this.orders.delete(bestBid.id);
      } else {
        // Partial fill: keep order with updated status
        bestBid.status = 'partial';
      }

      if (bestAsk.quantity === 0) {
        this.asks.pop();
        this.orders.delete(bestAsk.id);
      } else {
        // Partial fill: keep order with updated status
        bestAsk.status = 'partial';
      }
    }

    return trades;
  }

  /**
   * Get the best bid price (highest price)
   * @returns Best bid price or null if no bids
   */
  getBestBid(): number | null {
    const bestBid = this.bids.peek();
    if (!bestBid) {
      return null;
    }
    return bestBid.price ?? null;
  }

  /**
   * Get the best ask price (lowest price)
   * @returns Best ask price or null if no asks
   */
  getBestAsk(): number | null {
    const bestAsk = this.asks.peek();
    if (!bestAsk) {
      return null;
    }
    return bestAsk.price ?? null;
  }

  /**
   * Get all bids (for testing/inspection)
   * @returns Array of all bids in priority order
   */
  getBids(): Order[] {
    return this.bids.toArray();
  }

  /**
   * Get all asks (for testing/inspection)
   * @returns Array of all asks in priority order
   */
  getAsks(): Order[] {
    return this.asks.toArray();
  }

  /**
   * Get order by ID
   * @param orderId - Order ID
   * @returns Order or undefined if not found
   */
  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Get total bid depth
   * @returns Total quantity of all bids
   */
  getBidDepth(): number {
    return this.bids.toArray().reduce((sum, order) => sum + order.quantity, 0);
  }

  /**
   * Get total ask depth
   * @returns Total quantity of all asks
   */
  getAskDepth(): number {
    return this.asks.toArray().reduce((sum, order) => sum + order.quantity, 0);
  }
}
