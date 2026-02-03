import type { Order, OrderResult, Player } from './types';

export interface MarketUpdate {
  itemId: string;
  currentPrice: number;
  bestBid: number;
  bestAsk: number;
  timestamp: number;
}

export interface OrderSubmissionInterface {
  submitOrder(_order: Order): Promise<OrderResult>;
}

export interface MarketDataInterface {
  subscribeToMarket(_itemId: string): Stream<MarketUpdate>;
}

export interface PlayerStateInterface {
  getPlayerState(_playerId: string): Promise<Player>;
}

export interface Stream<A> {
  subscribe(_onNext: (_a: A) => void): void;
}
