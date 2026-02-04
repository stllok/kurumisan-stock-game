<script lang="ts">
	import { getPlayerState, getPlayerOrders, cancelOrder } from '$lib/api';
	import { browser } from '$app/environment';

	let player = $state<any>(null);
	let orders = $state<any[]>([]);

	async function loadData() {
		if (!browser) return;

		try {
			const playerId = globalThis.localStorage.getItem('playerId') || '';
			if (!playerId) return;

			[player, orders] = await Promise.all([getPlayerState(playerId), getPlayerOrders(playerId)]);
		} catch (e) {
			console.error(e);
		}
	}

	async function handleCancelOrder(orderId: string) {
		try {
			await cancelOrder(orderId);
			await loadData();
		} catch (e) {
			console.error(e);
		}
	}

	loadData();
	setInterval(loadData, 2000);
</script>

<div class="min-h-screen bg-gray-900 text-white p-8">
	<h1 class="text-4xl font-bold mb-8">Portfolio</h1>

	{#if player}
		<div class="bg-gray-800 rounded-lg p-6 mb-8">
			<h2 class="text-xl font-semibold mb-4">Account Balance</h2>
			<div class="text-5xl font-mono">${player.balance.toFixed(2)} USD</div>
		</div>

		<div class="bg-gray-800 rounded-lg p-6 mb-8">
			<h2 class="text-xl font-semibold mb-4">Holdings</h2>
			<div class="space-y-4">
				{#if player.inventory?.size > 0}
					{#each Array.from(player.inventory.entries()) as [item, qty]}
						<div class="flex justify-between py-2 border-b border-gray-700 last:border-0">
							<span class="text-2xl">{item}</span>
							<span class="text-2xl font-mono">{qty}</span>
						</div>
					{/each}
				{:else}
					<p class="text-gray-500">No holdings yet</p>
				{/if}
			</div>
		</div>

		<div class="bg-gray-800 rounded-lg p-6">
			<h2 class="text-xl font-semibold mb-4">Open Orders</h2>
			{#if orders.length > 0}
				<div class="space-y-4">
					{#each orders as order}
						<div
							class="flex justify-between items-center p-4 bg-gray-700 rounded-lg
								{order.side === 'buy' ? 'border-l-4 border-green-600' : 'border-l-4 border-red-600'}"
						>
							<div>
								<span class={order.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
									{order.side.toUpperCase()}
								</span>
								<span class="ml-4">{order.quantity} BTC</span>
								<span class="ml-4">@ {order.price?.toFixed(2)}</span>
							</div>
							<button
								onclick={() => handleCancelOrder(order.id)}
								class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
							>
								Cancel
							</button>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-gray-500">No open orders</p>
			{/if}
		</div>
	{:else}
		<div class="text-gray-500">Loading portfolio...</div>
	{/if}

	<a href="/market" class="inline-block mt-8 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg">
		← Back to Market
	</a>
</div>
