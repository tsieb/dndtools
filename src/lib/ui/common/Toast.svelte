<script lang="ts">
	import { toastState } from '$lib/state/toast.svelte.js';
	import { layoutState } from '$lib/state/layout.svelte.js';
	import Icon from '$lib/ui/common/Icon.svelte';
	import type { IconName } from '$lib/ui/common/Icon.svelte';

	const TOAST_ICON: Record<string, IconName> = {
		success: 'check-circle',
		error: 'alert-circle',
		warning: 'triangle-alert',
		info: 'info',
	};

	let visibleToasts = $derived(toastState.toasts.slice(-4));
	let hiddenToastCount = $derived(Math.max(0, toastState.toasts.length - visibleToasts.length));
</script>

{#if visibleToasts.length > 0}
	<div
		class="pointer-events-none fixed right-4 z-[100] flex flex-col gap-2 {layoutState.isCompact
			? 'bottom-[calc(1rem+var(--layout-bottomnav-height)+env(safe-area-inset-bottom))]'
			: 'bottom-4'}"
		aria-live="polite"
	>
		{#if hiddenToastCount > 0}
			<div
				class="pointer-events-auto rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-md"
			>
				+{hiddenToastCount} more
			</div>
		{/if}
		{#each visibleToasts as toast (toast.id)}
			<div
				class="pointer-events-auto relative flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm font-medium shadow-md backdrop-blur-sm animate-slide-in
					{toast.type === 'success'
					? 'bg-surface border-success/60 text-success'
					: toast.type === 'error'
						? 'bg-surface border-error/60 text-error'
						: toast.type === 'warning'
							? 'bg-surface border-warning/60 text-warning'
							: 'bg-surface border-accent/60 text-accent'}"
				role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
				onmouseenter={() => toastState.pause(toast.id)}
				onmouseleave={() => toastState.resume(toast.id)}
				onfocusin={() => toastState.pause(toast.id)}
				onfocusout={() => toastState.resume(toast.id)}
			>
				<span class="shrink-0" aria-hidden="true">
					<Icon name={TOAST_ICON[toast.type] ?? 'info'} size="sm" />
				</span>
				<span class="flex-1">{toast.message}</span>
				<button
					class="ml-1 flex shrink-0 items-center rounded p-0.5 opacity-70 transition-[transform,opacity] hover:opacity-100 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current"
					onclick={() => toastState.remove(toast.id)}
					aria-label="Dismiss notification"
				>
					<Icon name="x" size="xs" />
				</button>
			</div>
		{/each}
	</div>
{/if}
