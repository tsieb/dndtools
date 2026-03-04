<script lang="ts">
	import { pwaState } from '$lib/state/pwa.svelte.js';

	async function handleInstall(): Promise<void> {
		await pwaState.promptInstall();
	}
</script>

{#if pwaState.shouldShowInstallPrompt}
	<aside
		class="fixed bottom-4 left-4 right-4 z-40 rounded-xl border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface shadow-lg p-4 sm:left-auto sm:w-[26rem]"
		role="status"
		aria-live="polite"
	>
		<p class="text-sm font-semibold text-ink dark:text-tavern-text">Install DND Tools</p>
		<p class="mt-1 text-xs text-ink-muted dark:text-tavern-muted">
			{pwaState.installPromptDescription}
		</p>
		<div class="mt-3 flex items-center justify-end gap-2">
			<button
				type="button"
				class="rounded-md border border-border dark:border-tavern-border px-3 py-1.5 text-xs text-ink dark:text-tavern-text hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
				onclick={() => pwaState.dismissInstallPrompt()}
			>
				Not now
			</button>
			{#if pwaState.promptEvent}
				<button
					type="button"
					class="rounded-md bg-accent dark:bg-tavern-accent px-3 py-1.5 text-xs font-medium text-white dark:text-tavern-bg hover:bg-accent-hover dark:hover:bg-tavern-accent-hover transition-colors"
					onclick={handleInstall}
				>
					Install app
				</button>
			{/if}
		</div>
	</aside>
{/if}
