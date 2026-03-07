<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		text: string;
		/** Trigger element slot. The tooltip is linked to the trigger via aria-describedby. */
		children: Snippet;
		/** Placement relative to trigger. Default: 'bottom'. */
		placement?: 'top' | 'bottom' | 'left' | 'right';
		disabled?: boolean;
	}

	let { text, children, placement = 'bottom', disabled = false }: Props = $props();

	let visible = $state(false);
	const id = `tooltip-${Math.random().toString(36).slice(2, 9)}`;

	const placementClass: Record<string, string> = {
		top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
		bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
		left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
		right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
	};
</script>

<span
	class="relative inline-flex"
	onmouseenter={() => {
		if (!disabled) visible = true;
	}}
	onmouseleave={() => {
		visible = false;
	}}
	onfocusin={() => {
		if (!disabled) visible = true;
	}}
	onfocusout={() => {
		visible = false;
	}}
	role="none"
>
	<!-- Trigger slot: must accept aria-describedby from parent -->
	{@render children()}

	{#if visible && text}
		<span
			{id}
			role="tooltip"
			class="pointer-events-none absolute z-[70] max-w-xs rounded-md bg-ink px-2 py-1 text-xs text-surface whitespace-nowrap shadow-md {placementClass[
				placement
			]}"
		>
			{text}
		</span>
	{/if}
</span>
