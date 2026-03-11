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
	let containerEl = $state<HTMLSpanElement | null>(null);
	const id = `tooltip-${Math.random().toString(36).slice(2, 9)}`;
	let longPressTimeout: ReturnType<typeof setTimeout> | null = null;

	const placementClass: Record<string, string> = {
		top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
		bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
		left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
		right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
	};

	const focusableSelector =
		'button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"], [role="tab"]';

	function clearLongPressTimer() {
		if (longPressTimeout) {
			clearTimeout(longPressTimeout);
			longPressTimeout = null;
		}
	}

	function handlePointerDown(event: PointerEvent) {
		if (disabled || event.pointerType !== 'touch') return;
		clearLongPressTimer();
		longPressTimeout = setTimeout(() => {
			visible = true;
			longPressTimeout = null;
		}, 300);
	}

	function handlePointerEnd() {
		clearLongPressTimer();
		visible = false;
	}

	$effect(() => {
		const container = containerEl;
		if (!container || !text || disabled) return;
		const trigger = container.querySelector<HTMLElement>(focusableSelector);
		if (!trigger) return;

		const existing = trigger.getAttribute('aria-describedby');
		const describedBy = existing ? `${existing} ${id}` : id;
		trigger.setAttribute('aria-describedby', describedBy);

		return () => {
			const current = trigger.getAttribute('aria-describedby');
			if (!current) return;
			const next = current
				.split(/\s+/)
				.filter((token) => token && token !== id)
				.join(' ');
			if (next) {
				trigger.setAttribute('aria-describedby', next);
			} else {
				trigger.removeAttribute('aria-describedby');
			}
		};
	});
</script>

<span
	bind:this={containerEl}
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
	onpointerdown={handlePointerDown}
	onpointerup={handlePointerEnd}
	onpointercancel={handlePointerEnd}
	onpointerleave={handlePointerEnd}
	role="none"
>
	<!-- Trigger slot: must accept aria-describedby from parent -->
	{@render children()}

	{#if text}
		<span
			{id}
			role="tooltip"
			class="pointer-events-none absolute z-[70] max-w-xs rounded-md bg-ink px-2 py-1 text-xs text-surface whitespace-nowrap shadow-md {visible
				? placementClass[placement]
				: 'sr-only'}"
		>
			{text}
		</span>
	{/if}
</span>
