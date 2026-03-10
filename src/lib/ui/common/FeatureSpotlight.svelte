<script lang="ts">
	import { focusTrap } from '$lib/ui/a11y/focus-trap.js';
	import type { ActiveFeatureSpotlight } from '$lib/state/feature-spotlights.svelte.js';

	interface Props {
		spotlight: ActiveFeatureSpotlight | null;
		ondismiss: () => void;
	}

	let { spotlight, ondismiss }: Props = $props();
	let targetRect = $state<DOMRect | null>(null);

	function updateTargetRect(): void {
		if (!spotlight || typeof document === 'undefined') {
			targetRect = null;
			return;
		}
		const target = document.querySelector<HTMLElement>(spotlight.selector);
		targetRect = target ? target.getBoundingClientRect() : null;
	}

	const highlightStyle = $derived.by(() => {
		if (!targetRect) return '';
		const padding = 8;
		return [
			`left:${Math.max(0, targetRect.left - padding)}px`,
			`top:${Math.max(0, targetRect.top - padding)}px`,
			`width:${Math.max(0, targetRect.width + padding * 2)}px`,
			`height:${Math.max(0, targetRect.height + padding * 2)}px`,
		].join(';');
	});

	const cardStyle = $derived.by(() => {
		if (typeof window === 'undefined') return '';
		const width = 320;
		const margin = 12;
		if (!targetRect) {
			return `left:50%;top:50%;transform:translate(-50%,-50%);width:min(${width}px,calc(100vw - 1.5rem));`;
		}
		let left = targetRect.right + 16;
		if (left + width + margin > window.innerWidth) {
			left = Math.max(margin, targetRect.left - width - 16);
		}
		const minTop = margin;
		const maxTop = window.innerHeight - 220;
		const top = Math.min(Math.max(minTop, targetRect.top), maxTop);
		return `left:${Math.round(left)}px;top:${Math.round(top)}px;width:min(${width}px,calc(100vw - 1.5rem));`;
	});

	$effect(() => {
		if (!spotlight || typeof window === 'undefined') {
			targetRect = null;
			return;
		}
		updateTargetRect();
		const handleFrameUpdate = (): void => {
			updateTargetRect();
		};
		window.addEventListener('resize', handleFrameUpdate);
		window.addEventListener('scroll', handleFrameUpdate, true);
		return () => {
			window.removeEventListener('resize', handleFrameUpdate);
			window.removeEventListener('scroll', handleFrameUpdate, true);
		};
	});

	function handleBackdropClick(event: MouseEvent): void {
		if (event.target !== event.currentTarget) return;
		ondismiss();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		ondismiss();
	}
</script>

{#if spotlight}
	<div
		class="fixed inset-0 z-[85] bg-black/50"
		role="presentation"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		{#if targetRect}
			<div
				class="pointer-events-none fixed z-[86] rounded-lg border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
				style={highlightStyle}
				aria-hidden="true"
			></div>
		{/if}
		<div
			class="fixed z-[87] rounded-lg border border-border bg-surface-elevated p-4 shadow-xl"
			style={cardStyle}
			role="dialog"
			aria-modal="true"
			aria-label={spotlight.title}
			tabindex="-1"
			use:focusTrap={{ initialFocus: 'container' }}
			onkeydown={handleKeydown}
		>
			<p class="text-sm font-semibold text-ink">{spotlight.title}</p>
			<p class="mt-2 text-xs leading-relaxed text-ink-muted">{spotlight.description}</p>
			<div class="mt-4 flex justify-end">
				<button
					type="button"
					class="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-accent-hover"
					onclick={ondismiss}
				>
					Got it
				</button>
			</div>
		</div>
	</div>
{/if}
