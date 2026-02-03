import type { Order, OrderResult, Player } from './types';

export interface MarketUpdate {
  itemId: string;
  currentPrice: number;
  bestBid: number;
  bestAsk: number;
  timestamp: number;
}

export interface OrderSubmissionInterface {
  submitOrder(order: Order): Promise<OrderResult>;
}

export interface MarketDataInterface {
  subscribeToMarket(itemId: string): Stream<MarketUpdate>;
}

export interface PlayerStateInterface {
  getPlayerState(playerId: string): Promise<Player>;
}

export interface Stream<A> {
  subscribe(onNext: (a: A) => void): void;
}
