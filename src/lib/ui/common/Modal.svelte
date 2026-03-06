<script lang="ts">
	import type { Snippet } from 'svelte';
	import { focusTrap } from '$lib/ui/a11y/focus-trap.js';

	interface Props {
		open: boolean;
		title?: string;
		onclose: () => void;
		children: Snippet;
	}

	let { open, title, onclose, children }: Props = $props();

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			onclose();
		}
	}

	function handleBackdropClick(event: MouseEvent): void {
		if (event.target === event.currentTarget) {
			onclose();
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50"
		role="dialog"
		aria-modal="true"
		aria-label={title ?? 'Dialog'}
		tabindex="-1"
		use:focusTrap
		onkeydown={handleKeydown}
		onclick={handleBackdropClick}
	>
		<div
			class="bg-surface rounded-lg shadow-xl border border-border w-full max-w-lg mx-4 max-h-[70vh] flex flex-col"
		>
			{#if title}
				<div class="flex items-center justify-between px-4 py-3 border-b border-border">
					<h2 class="text-lg font-semibold text-ink">{title}</h2>
					<button class="text-ink-muted hover:text-ink p-1" onclick={onclose} aria-label="Close">
						✕
					</button>
				</div>
			{/if}
			<div class="px-4 py-3 overflow-y-auto">
				{@render children()}
			</div>
		</div>
	</div>
{/if}
