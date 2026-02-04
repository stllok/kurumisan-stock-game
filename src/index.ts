import { Elysia, t } from 'elysia';
import { staticPlugin } from '@elysiajs/static';
import { apiRoutes, marketEngine, orderBook } from './api/controllers';

const app = new Elysia()
  .use(
    await staticPlugin({
      prefix: '/',
      assets: 'web/build',
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    })
  )
  .use(apiRoutes)
  .ws('/api/market/stream', {
    open(ws) {
      const market = marketEngine.getMarketState();
      ws.send(
        JSON.stringify({
          type: 'init',
          data: {
            ...market,
            bestBid: orderBook.getBestBid(),
            bestAsk: orderBook.getBestAsk(),
          },
        })
      );
    },
  })
  .listen(3000);

setInterval(() => {
  marketEngine.updatePrice();
  orderBook.matchOrders();

  const market = marketEngine.getMarketState();
  const update = {
    type: 'price',
    data: {
      ...market,
      bestBid: orderBook.getBestBid(),
      bestAsk: orderBook.getBestAsk(),
      timestamp: Date.now(),
    },
  };

  app.server?.publish('/api/market/stream', JSON.stringify(update));
}, 50);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
