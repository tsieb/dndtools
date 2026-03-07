<script lang="ts">
	import type { Snippet } from 'svelte';
	import { focusTrap } from '$lib/ui/a11y/focus-trap.js';
	import Button from './Button.svelte';

	interface Props {
		open: boolean;
		title?: string;
		onclose: () => void;
		children: Snippet;
	}

	let { open, title, onclose, children }: Props = $props();

	const titleId = $derived(
		title ? `sheet-title-${title.toLowerCase().replace(/\s+/g, '-')}` : undefined,
	);

	let sheetEl = $state<HTMLElement | null>(null);
	let startY = $state(0);
	let currentY = $state(0);
	let dragging = $state(false);

	const DISMISS_THRESHOLD = 80;

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') onclose();
	}

	function handleBackdropClick(event: MouseEvent): void {
		if (event.target === event.currentTarget) onclose();
	}

	function handleDragStart(event: TouchEvent): void {
		const touch = event.changedTouches[0];
		if (!touch) return;
		startY = touch.clientY;
		currentY = 0;
		dragging = true;
	}

	function handleDragMove(event: TouchEvent): void {
		if (!dragging) return;
		const touch = event.changedTouches[0];
		if (!touch) return;
		currentY = Math.max(0, touch.clientY - startY);
		if (sheetEl) {
			sheetEl.style.transform = `translateY(${currentY}px)`;
		}
	}

	function handleDragEnd(): void {
		if (!dragging) return;
		dragging = false;
		if (sheetEl) sheetEl.style.transform = '';
		if (currentY >= DISMISS_THRESHOLD) {
			onclose();
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-end bg-black/50"
		role="dialog"
		aria-modal="true"
		aria-labelledby={titleId}
		aria-label={!titleId ? 'Sheet dialog' : undefined}
		tabindex="-1"
		use:focusTrap
		onkeydown={handleKeydown}
		onclick={handleBackdropClick}
	>
		<div
			bind:this={sheetEl}
			class="w-full max-h-[70vh] flex flex-col rounded-t-2xl border-t border-border bg-surface-elevated shadow-lg transition-transform duration-medium"
			onclick={(e) => e.stopPropagation()}
			role="none"
		>
			<!-- Drag handle -->
			<div
				class="flex touch-none select-none flex-col items-center pt-3 pb-2"
				ontouchstart={handleDragStart}
				ontouchmove={handleDragMove}
				ontouchend={handleDragEnd}
				ontouchcancel={handleDragEnd}
				role="none"
			>
				<div class="h-1 w-10 rounded-full bg-border-strong"></div>
			</div>
			{#if title}
				<div class="flex items-center justify-between border-b border-border px-4 py-3">
					<h2 id={titleId} class="text-base font-semibold text-ink">{title}</h2>
					<Button variant="ghost" size="sm" onclick={onclose} ariaLabel="Close sheet" icon="x" />
				</div>
			{/if}
			<div class="overflow-y-auto px-4 py-3">
				{@render children()}
			</div>
		</div>
	</div>
{/if}
