import { Elysia, t } from 'elysia';
import { MarketEngine } from '../game/market-engine';
import { OrderBook } from '../game/order-book';
import { sessionManager } from './sessions';
import { OrderSide, OrderType } from '../game/types';

const marketEngine = new MarketEngine('BTC', 50000);
const orderBook = new OrderBook();

const OrderModel = {
  body: t.Object({
    side: t.Union([t.Literal('buy'), t.Literal('sell')]),
    type: t.Union([t.Literal('limit'), t.Literal('market')]),
    price: t.Optional(t.Number()),
    quantity: t.Number({ minimum: 1 }),
  }),
};

export const apiRoutes = (app: Elysia) =>
  app
    .get('/api/health', () => ({ status: 'ok', timestamp: Date.now() }))
    .post('/api/session', () => {
      const playerId = sessionManager.createSession();
      return { playerId };
    })
    .get('/api/player/:playerId', ({ params }) => {
      const session = sessionManager.getSession(params.playerId);
      if (!session) return { error: 'Session not found' };
      return session.getState();
    })
    .get('/api/market', () => {
      const market = marketEngine.getMarketState();
      return {
        ...market,
        bestBid: orderBook.getBestBid(),
        bestAsk: orderBook.getBestAsk(),
      };
    })
    .post(
      '/api/orders',
      (ctx) => {
        const playerId = ctx.headers.get('x-player-id');
        if (!playerId) return { error: 'No session' };

        const session = sessionManager.getSession(playerId);
        if (!session) return { error: 'Invalid session' };

        const { body } = ctx;
        const orderSide: OrderSide = body.side === 'buy' ? 'buy' : 'sell';
        const orderType: OrderType = body.type === 'limit' ? 'limit' : 'market';
        const cost =
          orderSide === 'buy' ? (body.price || marketEngine.getCurrentPrice()) * body.quantity : 0;

        if (!session.hasSufficientBalance(cost)) {
          return { error: 'Insufficient balance' };
        }

        const order = {
          id: `order-${Date.now()}`,
          itemId: 'BTC',
          side: orderSide,
          type: orderType,
          price: body.price || marketEngine.getCurrentPrice(),
          quantity: body.quantity,
          playerId,
          timestamp: Date.now(),
          status: 'pending' as const,
        };

        orderBook.addOrder(order);
        marketEngine.recordOrder(order.side, order.quantity);

        return { orderId: order.id, status: 'pending' };
      },
      { body: OrderModel.body }
    )
    .get('/api/orders/:playerId', ({ params }) => {
      const orders = orderBook.getBids().concat(orderBook.getAsks());
      return orders.filter((o) => o.playerId === params.playerId);
    })
    .delete('/api/orders/:orderId', ({ params }) => {
      const success = orderBook.removeOrder(params.orderId);
      return { success };
    });

export { marketEngine, orderBook };
