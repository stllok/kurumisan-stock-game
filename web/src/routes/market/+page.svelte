<script lang="ts">
	import { subscribeToMarketStream, type MarketUpdate } from '$lib/api';

	let price = $state(0);
	let bestBid = $state(0);
	let bestAsk = $state(0);
	let priceHistory = $state<number[]>([]);
	let unsubscribe: (() => void) | null = $state(null);

	$effect(() => {
		unsubscribe = subscribeToMarketStream((update: MarketUpdate) => {
			price = update.data.currentPrice;
			bestBid = update.data.bestBid || 0;
			bestAsk = update.data.bestAsk || 0;

			if (update.type === 'price') {
				priceHistory = [...priceHistory.slice(-99), price];
			}
		});

		return () => {
			unsubscribe?.();
		};
	});

	function getChartPath(): string {
		if (priceHistory.length < 2) return '';
		const min = Math.min(...priceHistory);
		const max = Math.max(...priceHistory);
		const range = max - min || 1;

		return priceHistory
			.map((p, i) => {
				const x = (i / (priceHistory.length - 1)) * 100;
				const y = 100 - ((p - min) / range) * 100;
				return `${x},${y}`;
			})
			.join(' ');
	}
</script>

<div class="min-h-screen bg-gray-900 text-white p-8">
	<h1 class="text-4xl font-bold mb-8">Market: BTC/USD</h1>

	<div class="bg-gray-800 rounded-lg p-6 mb-8">
		<h2 class="text-xl font-semibold mb-4">Price Chart</h2>
		<div class="h-64">
			<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="w-full h-full">
				<polyline
					fill="none"
					stroke="#10b981"
					stroke-width="2"
					points={getChartPath()}
				/>
			</svg>
		</div>
		<div class="mt-4 text-center">
			<span class="text-6xl font-mono">${price.toFixed(2)}</span>
		</div>
	</div>

	<div class="grid grid-cols-2 gap-8 mb-8">
		<div class="bg-gray-800 rounded-lg p-6">
			<h2 class="text-xl font-semibold mb-4 text-green-400">Best Bid</h2>
			<div class="text-4xl font-mono">{bestBid.toFixed(2)}</div>
		</div>
		<div class="bg-gray-800 rounded-lg p-6">
			<h2 class="text-xl font-semibold mb-4 text-red-400">Best Ask</h2>
			<div class="text-4xl font-mono">{bestAsk.toFixed(2)}</div>
		</div>
	</div>

	<a href="/portfolio" class="inline-block px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg">
		View Portfolio →
	</a>
</div>
