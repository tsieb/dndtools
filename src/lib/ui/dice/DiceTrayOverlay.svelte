<script lang="ts">
	import DiceTrayPanel from '$lib/ui/dice/DiceTrayPanel.svelte';
	import { focusTrap } from '$lib/ui/a11y/focus-trap.js';

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
		aria-label="Dice tray"
		use:focusTrap
		onclick={handleBackdrop}
		onkeydown={handleKeydown}
		tabindex="-1"
	>
		<section
			class="w-full max-w-xl h-[82vh] rounded-xl border border-border bg-surface/98 shadow-2xl flex flex-col overflow-hidden"
		>
			<header class="px-4 py-3 border-b border-border flex items-center gap-2">
				<div class="flex-1 min-w-0">
					<h2 class="text-sm font-semibold text-ink truncate">Dice Tray</h2>
					<p class="text-[11px] text-ink-muted">Ctrl+D toggles this panel from any route.</p>
				</div>
				<button
					type="button"
					class="px-2.5 py-1 rounded border border-border text-xs hover:bg-surface-alt transition-colors"
					onclick={onclose}
				>
					Close
				</button>
			</header>
			<div class="flex-1 min-h-0 overflow-hidden">
				<DiceTrayPanel />
			</div>
		</section>
	</div>
{/if}
