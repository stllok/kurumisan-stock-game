<script lang="ts">
	import { createSession } from '$lib/api';
	import { browser } from '$app/environment';

	let playerId = $state<string>('');

	async function initSession() {
		if (!playerId && browser) {
			try {
				const session = await createSession();
				playerId = session.playerId;
				globalThis.localStorage.setItem('playerId', session.playerId);
			} catch (e) {
				console.error('Failed to create session:', e);
			}
		}
	}

	initSession();
</script>

<div class="min-h-screen bg-gray-900 text-white">
	<slot />
</div>
