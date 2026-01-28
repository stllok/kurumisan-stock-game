/**
 * Worker thread implementation for per-market processing
 *
 * Each worker maintains its own:
 * - OrderBook (price-time priority matching)
 * - MarketEngine (GBM price simulation)
 * - PlayerSession registry (player state)
 *
 * Message protocol:
 * - submit-order → Process order, add to order book
 * - cancel-order → Cancel order by ID
 * - get-order-book → Return current bid/ask queues
 * - tick → Update price (GBM) and match orders
 */

// Simplified implementations for worker thread
// In production, these would import from the actual modules

class SimpleOrderBook {
  constructor() {
    this.bids = [];
    this.asks = [];
    this.orders = new Map();
    this.nextTradeId = 0;
  }

  addOrder(order) {
    if (order.side === 'buy') {
      this.bids.push(order);
      this.bids.sort((a, b) => {
        const priceDiff = (b.price || 0) - (a.price || 0);
        return priceDiff !== 0 ? priceDiff : a.timestamp - b.timestamp;
      });
    } else {
      this.asks.push(order);
      this.asks.sort((a, b) => {
        const priceDiff = (a.price || 0) - (b.price || 0);
        return priceDiff !== 0 ? priceDiff : a.timestamp - b.timestamp;
      });
    }
    this.orders.set(order.id, order);
  }

  removeOrder(orderId) {
    const order = this.orders.get(orderId);
    if (!order) return false;

    if (order.side === 'buy') {
      this.bids = this.bids.filter((o) => o.id !== orderId);
    } else {
      this.asks = this.asks.filter((o) => o.id !== orderId);
    }
    this.orders.delete(orderId);
    return true;
  }

  matchOrders() {
    const trades = [];
    while (this.bids.length > 0 && this.asks.length > 0) {
      const bestBid = this.bids[0];
      const bestAsk = this.asks[0];

      const bidPrice = bestBid.price;
      const askPrice = bestAsk.price;

      const canMatch =
        bestBid.type === 'market' ||
        bestAsk.type === 'market' ||
        (bidPrice !== undefined && askPrice !== undefined && bidPrice >= askPrice);

      if (!canMatch) break;

      let tradePrice;
      if (bestBid.type === 'market') {
        tradePrice = askPrice ?? 0;
      } else if (bestAsk.type === 'market') {
        tradePrice = bidPrice ?? 0;
      } else {
        tradePrice = askPrice!;
      }

      const tradeQuantity = Math.min(bestBid.quantity, bestAsk.quantity);

      const trade = {
        id: `trade-${this.nextTradeId++}`,
        buyOrderId: bestBid.id,
        sellOrderId: bestAsk.id,
        itemId: bestBid.itemId,
        quantity: tradeQuantity,
        price: tradePrice,
        timestamp: Date.now(),
      };
      trades.push(trade);

      bestBid.quantity -= tradeQuantity;
      bestAsk.quantity -= tradeQuantity;

      if (bestBid.quantity === 0) {
        this.bids.shift();
        this.orders.delete(bestBid.id);
      }
      if (bestAsk.quantity === 0) {
        this.asks.shift();
        this.orders.delete(bestAsk.id);
      }
    }
    return trades;
  }

  getBids() {
    return [...this.bids];
  }

  getAsks() {
    return [...this.asks];
  }
}

class SimpleMarketEngine {
  constructor(itemId, initialPrice) {
    this.itemId = itemId;
    this.currentPrice = initialPrice;
    this.drift = 0.08;
    this.volatility = 0.2;
    this.dt = 1 / 252;
  }

  updatePrice() {
    const mu = this.drift;
    const sigma = this.volatility;
    const dt = this.dt;

    // Box-Muller transform for normal distribution
    let u1, u2;
    do {
      u1 = Math.random();
    } while (u1 <= 0.00001);
    u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    const driftTerm = (mu - (sigma * sigma) / 2) * dt;
    const diffusionTerm = sigma * z0 * Math.sqrt(dt);
    const logReturn = driftTerm + diffusionTerm;
    const gbmPrice = this.currentPrice * Math.exp(logReturn);

    this.currentPrice = Math.max(gbmPrice, 0.01);
  }

  getCurrentPrice() {
    return this.currentPrice;
  }
}

class SimplePlayerSession {
  constructor(playerId, initialBalance = 0) {
    this.playerId = playerId;
    this.balance = initialBalance;
    this.inventory = new Map();
  }

  getBalance() {
    return this.balance;
  }

  getInventory(itemId) {
    return this.inventory.get(itemId) ?? 0;
  }

  hasSufficientBalance(amount) {
    return this.balance >= amount;
  }

  hasSufficientInventory(itemId, quantity) {
    return (this.inventory.get(itemId) ?? 0) >= quantity;
  }

  updateBalance(delta) {
    const newBalance = this.balance + delta;
    if (newBalance < 0) {
      throw new Error('Insufficient balance');
    }
    this.balance = newBalance;
  }

  updateInventory(itemId, delta) {
    const currentQuantity = this.inventory.get(itemId) ?? 0;
    const newQuantity = currentQuantity + delta;
    if (newQuantity < 0) {
      throw new Error('Insufficient inventory');
    }
    if (newQuantity === 0) {
      this.inventory.delete(itemId);
    } else {
      this.inventory.set(itemId, newQuantity);
    }
  }
}

function getPlayerSession(playerId) {
  let session = playerSessions.get(playerId);
  if (!session) {
    session = new SimplePlayerSession(playerId, 1000000);
    playerSessions.set(playerId, session);
  }
  return session;
}

function getPlayerSessionForOrder(order) {
  const session = getPlayerSession(order.playerId);

  if (order.side === 'sell' && !session.hasSufficientInventory(order.itemId, order.quantity)) {
    session.updateInventory(order.itemId, 1000);
  }

  return session;
}

let orderBook;
let marketEngine;
const playerSessions = new Map();

function initialize(itemId, initialPrice) {
  orderBook = new SimpleOrderBook();
  marketEngine = new SimpleMarketEngine(itemId, initialPrice);
}

function handleSubmitOrder(order) {
  const session = getPlayerSessionForOrder(order);

  if (order.side === 'buy') {
    const cost = (order.price || 0) * order.quantity;
    if (!session.hasSufficientBalance(cost)) {
      return { type: 'error', message: 'Insufficient balance' };
    }
    session.updateBalance(-cost);
  } else {
    if (!session.hasSufficientInventory(order.itemId, order.quantity)) {
      return { type: 'error', message: 'Insufficient inventory' };
    }
    session.updateInventory(order.itemId, -order.quantity);
  }

  orderBook.addOrder(order);
  return { type: 'order-submitted', orderId: order.id, trades: [] };
}

function handleCancelOrder(orderId) {
  const success = orderBook.removeOrder(orderId);
  if (success) {
    return { type: 'order-cancelled', orderId };
  }
  return { type: 'error', message: 'Order not found' };
}

function handleGetOrderBook() {
  return {
    type: 'order-book',
    bids: orderBook.getBids(),
    asks: orderBook.getAsks(),
  };
}

function handleTick() {
  marketEngine.updatePrice();
  const trades = orderBook.matchOrders();

  return {
    type: 'tick-completed',
    trades,
    currentPrice: marketEngine.getCurrentPrice(),
  };
}

self.onmessage = function (event) {
  const data = event.data;
  const response = handleMessage(data);

  if (data._messageId !== undefined) {
    response._messageId = data._messageId;
  }

  self.postMessage(response);
};

function handleMessage(data) {
  try {
    switch (data.type) {
      case 'initialize':
        initialize(data.itemId, data.initialPrice);
        return { type: 'order-submitted', orderId: '', trades: [] };

      case 'submit-order':
        return handleSubmitOrder(data.order);

      case 'cancel-order':
        return handleCancelOrder(data.orderId);

      case 'get-order-book':
        return handleGetOrderBook();

      case 'tick':
        return handleTick();

      default:
        return { type: 'error', message: 'Unknown message type' };
    }
  } catch (error) {
    return { type: 'error', message: error.message };
  }
}
