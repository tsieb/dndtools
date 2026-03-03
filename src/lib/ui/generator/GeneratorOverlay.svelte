<script lang="ts">
	import GeneratorPanel from '$lib/ui/generator/GeneratorPanel.svelte';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open = $bindable(), onclose }: Props = $props();

	function handleBackdrop(event: MouseEvent): void {
		if (event.target === event.currentTarget) onclose();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 bg-black/45 flex items-start justify-end p-4 sm:p-6"
		role="dialog"
		aria-modal="true"
		aria-label="Generator panel"
		onclick={handleBackdrop}
		onkeydown={handleKeydown}
		tabindex="-1"
	>
		<section
			class="w-full max-w-xl h-[82vh] rounded-xl border border-border dark:border-tavern-border bg-surface/98 dark:bg-tavern-surface/98 shadow-2xl flex flex-col overflow-hidden"
		>
			<header
				class="px-4 py-3 border-b border-border dark:border-tavern-border flex items-center gap-2"
			>
				<div class="flex-1 min-w-0">
					<h2 class="text-sm font-semibold text-ink dark:text-tavern-text truncate">Generator</h2>
					<p class="text-[11px] text-ink-muted dark:text-tavern-muted">
						Ctrl+G toggles this panel from any route.
					</p>
				</div>
				<button
					type="button"
					class="px-2.5 py-1 rounded border border-border dark:border-tavern-border text-xs hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors"
					onclick={onclose}
				>
					Close
				</button>
			</header>
			<div class="flex-1 min-h-0 overflow-hidden">
				<GeneratorPanel />
			</div>
		</section>
	</div>
{/if}
