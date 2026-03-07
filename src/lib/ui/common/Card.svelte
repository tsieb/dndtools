<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** When true, the card is an interactive surface (adds hover/active styles). */
		interactive?: boolean;
		/** Inner padding size. */
		padding?: 'none' | 'sm' | 'md' | 'lg';
		/** Elevation level — controls shadow. */
		elevation?: 'flat' | 'sm' | 'md';
		/** Extra CSS classes. */
		class?: string;
		/** Card content. */
		children: Snippet;
		/** Optional header slot. */
		header?: Snippet;
		/** Optional footer slot. */
		footer?: Snippet;
		onclick?: () => void;
	}

	let {
		interactive = false,
		padding = 'md',
		elevation = 'flat',
		class: extraClass,
		children,
		header,
		footer,
		onclick,
	}: Props = $props();

	const paddingClass: Record<string, string> = {
		none: '',
		sm: 'p-3',
		md: 'p-4',
		lg: 'p-6',
	};

	const elevationClass: Record<string, string> = {
		flat: 'border border-border',
		sm: 'border border-border shadow-sm',
		md: 'border border-border shadow-md',
	};

	const interactiveClass = $derived(
		interactive
			? 'cursor-pointer transition-[border,box-shadow] hover:border-accent/40 hover:shadow-sm active:scale-[0.99]'
			: '',
	);
</script>

{#if interactive}
	<div
		role="button"
		tabindex="0"
		class="rounded-lg bg-surface {elevationClass[elevation]} {interactiveClass} {extraClass ?? ''}"
		{onclick}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				onclick?.();
			}
		}}
	>
		{#if header}
			<div class="border-b border-border px-4 py-3">
				{@render header()}
			</div>
		{/if}
		<div class={paddingClass[padding]}>
			{@render children()}
		</div>
		{#if footer}
			<div class="border-t border-border px-4 py-3">
				{@render footer()}
			</div>
		{/if}
	</div>
{:else}
	<div class="rounded-lg bg-surface {elevationClass[elevation]} {extraClass ?? ''}">
		{#if header}
			<div class="border-b border-border px-4 py-3">
				{@render header()}
			</div>
		{/if}
		<div class={paddingClass[padding]}>
			{@render children()}
		</div>
		{#if footer}
			<div class="border-t border-border px-4 py-3">
				{@render footer()}
			</div>
		{/if}
	</div>
{/if}
