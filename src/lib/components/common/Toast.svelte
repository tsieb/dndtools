<script lang="ts">
	import { toastState } from '$lib/stores/toast.svelte.js';
</script>

{#if toastState.toasts.length > 0}
	<div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" aria-live="polite">
		{#each toastState.toasts as toast (toast.id)}
			<div
				class="pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium animate-slide-in
					{toast.type === 'success'
					? 'bg-success/10 border-success/30 text-success dark:bg-tavern-success/10 dark:border-tavern-success/30 dark:text-tavern-success'
					: toast.type === 'error'
						? 'bg-error/10 border-error/30 text-error dark:bg-tavern-error/10 dark:border-tavern-error/30 dark:text-tavern-error'
						: 'bg-accent/10 border-accent/30 text-accent dark:bg-tavern-accent/10 dark:border-tavern-accent/30 dark:text-tavern-accent'}"
				role="status"
			>
				<span class="shrink-0">
					{#if toast.type === 'success'}&#10003;{:else if toast.type === 'error'}&#10007;{:else}&#8505;{/if}
				</span>
				<span>{toast.message}</span>
				<button
					class="ml-2 opacity-60 hover:opacity-100 transition-opacity"
					onclick={() => toastState.remove(toast.id)}
					aria-label="Dismiss"
				>
					&#10005;
				</button>
			</div>
		{/each}
	</div>
{/if}
