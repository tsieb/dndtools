<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		onclose: () => void;
		/** Anchor element for positioning. When provided, popover appears below/beside it. */
		anchor?: HTMLElement | null;
		children: Snippet;
		class?: string;
	}

	let { open, onclose, anchor, children, class: extraClass }: Props = $props();

	let popoverEl = $state<HTMLElement | null>(null);

	const positionStyle = $derived.by(() => {
		if (!anchor || typeof window === 'undefined') return '';
		const rect = anchor.getBoundingClientRect();
		return `position: fixed; top: ${rect.bottom + 4}px; left: ${rect.left}px;`;
	});

	$effect(() => {
		if (!open || typeof window === 'undefined') return;
		function handlePointerDown(event: PointerEvent): void {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (popoverEl?.contains(target)) return;
			if (anchor?.contains(target)) return;
			onclose();
		}
		function handleKeydown(event: KeyboardEvent): void {
			if (event.key === 'Escape') onclose();
		}
		window.addEventListener('pointerdown', handlePointerDown);
		window.addEventListener('keydown', handleKeydown);
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown);
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

{#if open}
	<div
		bind:this={popoverEl}
		class="z-[60] min-w-36 rounded-md border border-border bg-surface-elevated p-1 shadow-md {extraClass ??
			''}"
		style={positionStyle}
		role="dialog"
		aria-modal="false"
	>
		{@render children()}
	</div>
{/if}
