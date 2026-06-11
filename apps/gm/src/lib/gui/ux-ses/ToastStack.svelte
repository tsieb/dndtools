<script lang="ts">
	import { useProfile } from '$lib/platform/platform-profile.svelte';
	import type { SessionToastStore } from './session-toasts.svelte';

	/**
	 * UX-SES-017 — the session toast stack renderer. Desktop/Tablet: bottom-right corner, max 3
	 * stacked, newest on top. Mobile (compact): full-width bottom banners, max 2 stacked. Success
	 * toasts are `role="status"` (polite); error/undo toasts are `role="alert"` so they interrupt.
	 * Action buttons (Undo / Retry / Dismiss) are real focusable buttons; Escape dismisses a focused
	 * toast. Auto-dismiss is owned by the store ({@link SessionToastStore}).
	 */
	interface Props {
		store: SessionToastStore;
	}

	let { store }: Props = $props();
	const profile = useProfile();

	// UX-SES-017 §platform profiles: 3 visible on Desktop/Tablet, 2 on Mobile.
	const maxVisible = $derived(profile.viewportClass === 'compact' ? 2 : 3);
	const visible = $derived(store.toasts.slice(0, maxVisible));

	function onToastKeydown(event: KeyboardEvent, id: number): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			store.dismiss(id);
		}
	}
</script>

{#if visible.length > 0}
	<div class="toast-stack" data-testid="ses-toast-stack">
		{#each visible as toast (toast.id)}
			<div
				class="toast"
				data-kind={toast.kind}
				data-testid="ses-toast"
				role={toast.kind === 'milestone' ? 'status' : 'alert'}
				tabindex="-1"
				onkeydown={(event) => onToastKeydown(event, toast.id)}
			>
				<span class="toast-message" data-testid="ses-toast-message">{toast.message}</span>
				<span class="toast-actions">
					{#if toast.actionLabel}
						<button
							type="button"
							class="toast-action"
							data-testid="ses-toast-action"
							onclick={() => void store.runAction(toast.id)}
						>
							{toast.actionLabel}
						</button>
					{/if}
					<button
						type="button"
						class="toast-dismiss"
						aria-label="Dismiss notification"
						data-testid="ses-toast-dismiss"
						onclick={() => store.dismiss(toast.id)}
					>
						✕
					</button>
				</span>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-stack {
		position: fixed;
		right: var(--space-4);
		bottom: var(--space-4);
		z-index: 40;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		width: 320px;
		max-width: calc(100vw - var(--space-8));
	}

	/* Mobile: full-width bottom banners (UX-SES-017 §platform profiles). */
	:global(.app-shell[data-viewport='compact']) .toast-stack {
		left: var(--space-2);
		right: var(--space-2);
		bottom: var(--space-2);
		width: auto;
	}

	.toast {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-height: 44px;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border-strong);
		background: var(--color-surface-overlay);
		color: var(--color-text-primary);
		box-shadow: var(--shadow-lg);
	}

	/* Non-color state (WCAG 1.4.1): the border tone is reinforced by the action label text. */
	.toast[data-kind='error'] {
		border-color: var(--color-status-error);
		background: var(--color-status-error-subtle);
	}

	.toast[data-kind='undo'] {
		border-color: var(--color-status-info);
	}

	.toast-message {
		font-size: var(--text-sm);
		min-width: 0;
	}

	.toast-actions {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		flex-shrink: 0;
	}

	.toast-action {
		font-weight: 600;
	}
</style>
