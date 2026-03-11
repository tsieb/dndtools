<script lang="ts">
	import { focusTrap } from '$lib/actions/focus-trap.js';

	interface Props {
		headline: string;
		body: string;
		learnMoreHref?: string;
		learnMoreLabel?: string;
		ariaLabel?: string;
		class?: string;
	}

	let {
		headline,
		body,
		learnMoreHref,
		learnMoreLabel = 'Learn more',
		ariaLabel = 'Help',
		class: className,
	}: Props = $props();

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let positionStyle = $state('');

	const popoverId = $derived.by(() => `help-tip-${headline.toLowerCase().replace(/\s+/g, '-')}`);

	function updatePositionStyle(): void {
		if (!open || !triggerEl || typeof window === 'undefined') {
			positionStyle = '';
			return;
		}
		const rect = triggerEl.getBoundingClientRect();
		const maxWidth = 320;
		const margin = 12;
		const preferredLeft = rect.right + 8;
		let left = preferredLeft;
		if (preferredLeft + maxWidth + margin > window.innerWidth) {
			left = Math.max(margin, rect.left - maxWidth - 8);
		}
		const maxTop = Math.max(margin, window.innerHeight - 240);
		const top = Math.min(Math.max(margin, rect.top - 4), maxTop);
		positionStyle = `top:${Math.round(top)}px;left:${Math.round(left)}px;`;
	}

	$effect(() => {
		if (!open || typeof window === 'undefined') {
			positionStyle = '';
			return;
		}
		updatePositionStyle();
		const handleResize = (): void => {
			updatePositionStyle();
		};
		window.addEventListener('resize', handleResize);
		window.addEventListener('scroll', handleResize, true);
		return () => {
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('scroll', handleResize, true);
		};
	});

	function toggle(): void {
		open = !open;
	}

	function close(): void {
		open = false;
	}

	function handleBackdropClick(event: MouseEvent): void {
		if (event.target !== event.currentTarget) return;
		close();
	}

	function handleDialogKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		close();
	}
</script>

<span class={`inline-flex ${className ?? ''}`}>
	<button
		bind:this={triggerEl}
		type="button"
		class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-surface-alt text-2xs font-semibold leading-none text-ink-muted transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-border"
		aria-label={ariaLabel}
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-controls={popoverId}
		onclick={toggle}
	>
		?
	</button>
</span>

{#if open}
	<div
		class="fixed inset-0 z-[80] bg-transparent"
		role="presentation"
		onclick={handleBackdropClick}
		onkeydown={handleDialogKeydown}
	>
		<div
			id={popoverId}
			role="dialog"
			aria-modal="true"
			aria-label={headline}
			class="fixed z-[81] w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-border bg-surface-elevated p-3 shadow-lg"
			style={positionStyle}
			tabindex="-1"
			use:focusTrap={{ initialFocus: 'container' }}
			onkeydown={handleDialogKeydown}
		>
			<div class="flex items-start justify-between gap-2">
				<h3 class="text-sm font-semibold text-ink">{headline}</h3>
				<button
					type="button"
					class="rounded px-1.5 py-0.5 text-xs text-ink-muted transition-colors hover:bg-surface-alt"
					aria-label="Close help"
					onclick={close}
				>
					Close
				</button>
			</div>
			<p class="mt-2 text-xs leading-relaxed text-ink-muted">{body}</p>
			{#if learnMoreHref}
				<a
					class="mt-2 inline-flex text-xs font-medium text-accent hover:text-accent-hover hover:underline"
					href={learnMoreHref}
					target="_blank"
					rel="noreferrer noopener"
				>
					{learnMoreLabel}
				</a>
			{/if}
		</div>
	</div>
{/if}
