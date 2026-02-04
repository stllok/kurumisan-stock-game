import { treaty } from '@elysiajs/eden';

const baseUrl = 'http://localhost:3000';

export const api = treaty(baseUrl);

export type OrderInput = {
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price?: number;
  quantity: number;
};

export async function createSession(): Promise<{ playerId: string }> {
  const result = await api['/api/session'].post(undefined);
  if (result.error || !result.data) throw new Error('Failed to create session');
  return result.data as { playerId: string };
}

export async function getPlayerState(playerId: string) {
  const result = await api['/api/player'][{ playerId }].get();
  if (result.error) throw new Error((result.error as any).message);
  return result.data;
}

export async function getMarket() {
  const result = await api['/api/market'].get();
  if (result.error) throw new Error((result.error as any).message);
  return result.data;
}

export async function submitOrder(
  playerId: string,
  order: { side: 'buy' | 'sell'; type: 'limit' | 'market'; price?: number; quantity: number }
) {
  const result = await api['/api/orders'].post(order, {
    headers: { 'x-player-id': playerId },
  });
  if (result.error) throw new Error((result.error as any).message);
  return result.data;
}

export async function getPlayerOrders(playerId: string) {
  const result = await api['/api/orders'][{ playerId }].get();
  return result.data ?? [];
}

export async function cancelOrder(orderId: string) {
  const result = await api['/api/orders'][{ orderId }].delete();
  return result.data;
}

export type MarketUpdate = {
  type: 'init' | 'price' | 'trade';
  data: {
    itemId: string;
    currentPrice: number;
    bestBid: number | null;
    bestAsk: number | null;
    timestamp: number;
  };
};

export function subscribeToMarketStream(onUpdate: (update: MarketUpdate) => void) {
  const ws = new WebSocket('ws://localhost:3000/api/market/stream');

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      onUpdate(parsed);
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  return () => {
    ws.close();
  };
}
