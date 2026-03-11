<script lang="ts">
	import type { Snippet } from 'svelte';
	import { focusTrap } from '$lib/actions/focus-trap.js';
	import Button from './Button.svelte';

	interface Props {
		open: boolean;
		title?: string;
		/** ID of the element that labels the dialog (for aria-labelledby). Falls back to title. */
		labelledById?: string;
		onclose: () => void;
		children: Snippet;
		/** Max width of the dialog panel. Default: 'lg' (32rem). */
		maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
	}

	let { open, title, labelledById, onclose, children, maxWidth = 'lg' }: Props = $props();

	const titleId = $derived(
		labelledById ??
			(title ? `dialog-title-${title.toLowerCase().replace(/\s+/g, '-')}` : undefined),
	);

	const maxWidthClass: Record<string, string> = {
		sm: 'max-w-sm',
		md: 'max-w-md',
		lg: 'max-w-lg',
		xl: 'max-w-xl',
	};

	function handleBackdropClick(event: MouseEvent): void {
		if (event.target === event.currentTarget) {
			onclose();
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
		role="dialog"
		aria-modal="true"
		aria-labelledby={titleId}
		aria-label={!titleId ? 'Dialog' : undefined}
		tabindex="-1"
		use:focusTrap={{ onEscape: onclose }}
		onclick={handleBackdropClick}
	>
		<div
			class="mx-4 flex w-full {maxWidthClass[
				maxWidth
			]} max-h-[70vh] flex-col rounded-lg border border-border bg-surface-elevated shadow-lg"
		>
			{#if title}
				<div class="flex items-center justify-between border-b border-border px-4 py-3">
					<h2 id={titleId} class="text-base font-semibold text-ink">{title}</h2>
					<Button variant="ghost" size="sm" onclick={onclose} ariaLabel="Close dialog" icon="x" />
				</div>
			{/if}
			<div class="overflow-y-auto px-4 py-3">
				{@render children()}
			</div>
		</div>
	</div>
{/if}
