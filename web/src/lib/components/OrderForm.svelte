<script lang="ts">
	import { submitOrder, type OrderInput } from '$lib/api';

	let { price }: { price: number } = $props();

	let side = $state<'buy' | 'sell'>('buy');
	let type = $state<'limit' | 'market'>('limit');
	let limitPrice = $state(price);
	let quantity = $state(0.1);
	let status = $state('');
	let isSubmitting = $state(false);

	async function handleSubmit() {
		isSubmitting = true;
		try {
			const playerId = localStorage.getItem('playerId') || '';
			if (!playerId) {
				status = 'No session found';
				isSubmitting = false;
				return;
			}

			const order: OrderInput = {
				side,
				type,
				quantity,
				price: type === 'limit' ? limitPrice : undefined
			};

			await submitOrder(playerId, order);
			status = 'Order submitted!';
		} catch (e) {
			console.error(e);
			status = `Error: ${(e as any).message}`;
		} finally {
			isSubmitting = false;
		}
	}

	$effect(() => {
		limitPrice = price;
	});
</script>

<div class="bg-gray-800 rounded-lg p-6">
	<h2 class="text-xl font-semibold mb-6">Place Order</h2>

	<div class="space-y-6">
		<div class="flex gap-4">
			<button
				class="flex-1 py-3 rounded-lg font-semibold transition-colors"
				class:bg-green-600={side === 'buy'}
				class:bg-gray-700={side !== 'buy'}
				class:hover:bg-green-700={side === 'buy'}
				class:hover:bg-gray-600={side !== 'buy'}
				onclick={() => (side = 'buy')}
				disabled={isSubmitting}
			>
				Buy
			</button>
			<button
				class="flex-1 py-3 rounded-lg font-semibold transition-colors"
				class:bg-red-600={side === 'sell'}
				class:bg-gray-700={side !== 'sell'}
				class:hover:bg-red-700={side === 'sell'}
				class:hover:bg-gray-600={side !== 'sell'}
				onclick={() => (side = 'sell')}
				disabled={isSubmitting}
			>
				Sell
			</button>
		</div>

		<div class="flex gap-4">
			<button
				class="flex-1 py-2 rounded-lg transition-colors"
				class:bg-blue-600={type === 'limit'}
				class:bg-gray-700={type !== 'limit'}
				class:hover:bg-blue-700={type === 'limit'}
				class:hover:bg-gray-600={type !== 'limit'}
				onclick={() => (type = 'limit')}
				disabled={isSubmitting}
			>
				Limit
			</button>
			<button
				class="flex-1 py-2 rounded-lg transition-colors"
				class:bg-blue-600={type === 'market'}
				class:bg-gray-700={type !== 'market'}
				class:hover:bg-blue-700={type === 'market'}
				class:hover:bg-gray-600={type !== 'market'}
				onclick={() => (type = 'market')}
				disabled={isSubmitting}
			>
				Market
			</button>
		</div>

		{#if type === 'limit'}
			<div>
				<label class="block text-sm text-gray-400 mb-2">Price (USD)</label>
				<input
					type="number"
					bind:value={limitPrice}
					step="0.01"
					class="w-full bg-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
					disabled={isSubmitting}
				/>
			</div>
		{/if}

		<div>
			<label class="block text-sm text-gray-400 mb-2">Quantity (BTC)</label>
			<input
				type="number"
				bind:value={quantity}
				step="0.001"
				min="0.001"
				class="w-full bg-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
				disabled={isSubmitting}
			/>
		</div>

		<button
			onclick={handleSubmit}
			disabled={isSubmitting}
			class="w-full py-4 rounded-lg font-semibold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed
				{side === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}"
		>
			{isSubmitting ? 'Submitting...' : (side === 'buy' ? 'Buy' : 'Sell') + ' BTC'}
		</button>

		{#if status}
			<p class="text-center text-sm {status.includes('Error') ? 'text-red-400' : 'text-green-400'}">
				{status}
			</p>
		{/if}
	</div>
</div>
