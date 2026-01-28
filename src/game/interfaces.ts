import type { Effect } from 'effect';

import type { Market, Order, OrderResult, Player } from './types';

export interface MarketUpdate {
  itemId: string;
  currentPrice: number;
  bestBid: number;
  bestAsk: number;
  timestamp: number;
}

export interface OrderSubmissionInterface {
  submitOrder(order: Order): Effect.Effect<unknown, unknown, OrderResult>;
}

export interface MarketDataInterface {
  subscribeToMarket(itemId: string): Effect.Effect<unknown, unknown, Stream<MarketUpdate>>;
}

export interface PlayerStateInterface {
  getPlayerState(playerId: string): Effect.Effect<unknown, unknown, Player>;
}

export interface Stream<A> {
  subscribe(onNext: (a: A) => void): void;
}
