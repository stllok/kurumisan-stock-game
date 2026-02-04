export interface OrderInput {
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price?: number;
  quantity: number;
}

export interface MarketState {
  itemId: string;
  currentPrice: number;
  volatility: number;
  bestBid: number | null;
  bestAsk: number | null;
}

export interface MarketUpdate {
  type: 'init' | 'price' | 'trade';
  data: MarketState & { timestamp: number };
}
