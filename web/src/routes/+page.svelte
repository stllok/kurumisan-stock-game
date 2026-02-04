<script lang="ts">
	import { getMarket, getPlayerState } from '$lib/api';
	import { browser } from '$app/environment';

	let market = $state<any>(null);
	let player = $state<any>(null);
	let error = $state('');

	async function loadData() {
		if (!browser) return;

		try {
			const playerId = globalThis.localStorage.getItem('playerId') || '';
			if (!playerId) {
				error = 'No player session found';
				return;
			}

			[market, player] = await Promise.all([getMarket(), getPlayerState(playerId)]);
			error = '';
		} catch (e) {
			console.error(e);
			error = 'Failed to load data';
		}
	}

	loadData();
	setInterval(loadData, 1000);
</script>

<div class="min-h-screen bg-gray-900 text-white p-8">
	<h1 class="text-4xl font-bold mb-8">Trading Dashboard</h1>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
		<div class="bg-gray-800 rounded-lg p-6">
			<h2 class="text-2xl font-semibold mb-4">BTC/USD</h2>
			{#if market}
				<div class="text-5xl font-mono mb-4">${market.currentPrice.toFixed(2)}</div>
				<div class="grid grid-cols-2 gap-4 text-sm">
					<div>
						<span class="text-gray-400">Best Bid:</span>
						<span class="text-green-400">
							{market.bestBid ? market.bestBid.toFixed(2) : '-'}
						</span>
					</div>
					<div>
						<span class="text-gray-400">Best Ask:</span>
						<span class="text-red-400">
							{market.bestAsk ? market.bestAsk.toFixed(2) : '-'}
						</span>
					</div>
					<div>
						<span class="text-gray-400">Volatility:</span>
						<span>{(market.volatility * 100).toFixed(2)}%</span>
					</div>
				</div>
			{:else}
				<div class="text-gray-500">Loading market data...</div>
			{/if}
		</div>

		<div class="bg-gray-800 rounded-lg p-6">
			<h2 class="text-2xl font-semibold mb-4">Portfolio</h2>
			{#if player}
				<div class="text-3xl font-mono mb-4">${player.balance.toFixed(2)} USD</div>
				<div class="text-sm">
					<span class="text-gray-400">BTC Balance:</span>
					<span>
						{player.inventory?.get('BTC') || 0} BTC
					</span>
				</div>
			{:else}
				<div class="text-gray-500">Loading portfolio...</div>
			{/if}
		</div>
	</div>

	{#if error}
		<div class="mt-8 bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
			{error}
		</div>
	{/if}

	<a
		href="/market"
		class="inline-block mt-8 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg"
	>
		Start Trading →
	</a>
</div>
