/**
 * Core types for the stock simulator game
 */

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'partial';

export interface Order {
  id: string;
  playerId: string;
  itemId: string;
  type: OrderType;
  side: OrderSide;
  quantity: number;
  price?: number;
  timestamp: number;
  status: OrderStatus;
}

export interface Trade {
  id: string;
  buyOrderId: string;
  sellOrderId: string;
  itemId: string;
  quantity: number;
  price: number;
  timestamp: number;
}

export interface Player {
  id: string;
  balance: number;
  inventory: Map<string, number>;
}

export interface Market {
  itemId: string;
  orderBook: OrderBook;
  currentPrice: number;
  volatility: number;
}

export interface OrderBook {
  bids: Order[];
  asks: Order[];
}

export interface OrderResult {
  orderId: string;
  status: OrderStatus;
  filledQuantity: number;
  avgPrice: number;
  trades: Trade[];
}
