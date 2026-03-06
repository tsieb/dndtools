<script lang="ts">
	import { pwaState } from '$lib/state/pwa.svelte.js';

	async function handleInstall(): Promise<void> {
		await pwaState.promptInstall();
	}
</script>

{#if pwaState.shouldShowInstallPrompt}
	<aside
		class="fixed bottom-4 left-4 right-4 z-40 rounded-xl border border-border bg-surface shadow-lg p-4 sm:left-auto sm:w-[26rem]"
		role="status"
		aria-live="polite"
	>
		<p class="text-sm font-semibold text-ink">Install DND Tools</p>
		<p class="mt-1 text-xs text-ink-muted">
			{pwaState.installPromptDescription}
		</p>
		<div class="mt-3 flex items-center justify-end gap-2">
			<button
				type="button"
				class="rounded-md border border-border px-3 py-1.5 text-xs text-ink hover:bg-surface-alt transition-colors"
				onclick={() => pwaState.dismissInstallPrompt()}
			>
				Not now
			</button>
			{#if pwaState.promptEvent}
				<button
					type="button"
					class="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
					onclick={handleInstall}
				>
					Install app
				</button>
			{/if}
		</div>
	</aside>
{/if}
