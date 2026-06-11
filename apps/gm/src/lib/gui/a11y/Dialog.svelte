<script lang="ts" module>
	let dialogSeq = 0;
	function nextDialogId(): string {
		dialogSeq += 1;
		return `dlg-${dialogSeq}`;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { createFocusTrap, type FocusTrap } from './focus-trap';

	/**
	 * Modal dialog primitive (UX-A11Y-012 dialog pattern, UX-A11Y-009 focus trap/restoration).
	 *
	 * Implements the WAI-ARIA APG dialog once: `role=dialog`/`alertdialog`, `aria-modal=true`,
	 * `aria-labelledby` → the title, focus trapped inside (Tab cycles, never escapes), Escape closes,
	 * and focus restored to the trigger on close (via {@link createFocusTrap}). Appended at the end of
	 * the shell so z-index and the trap are not fought by surrounding content (§6.4). Backdrop close is
	 * configurable so destructive-confirm dialogs can disable it.
	 */
	interface Props {
		open: boolean;
		title: string;
		role?: 'dialog' | 'alertdialog';
		closeOnBackdrop?: boolean;
		describedBy?: string;
		testid?: string;
		onclose?: () => void;
		children: Snippet;
		footer?: Snippet;
	}

	let {
		open = $bindable(),
		title,
		role = 'dialog',
		closeOnBackdrop = true,
		describedBy,
		testid = 'dialog',
		onclose,
		children,
		footer,
	}: Props = $props();

	const titleId = nextDialogId();
	let dialogEl = $state<HTMLElement | null>(null);
	let trap: FocusTrap | null = null;

	function close() {
		open = false;
		onclose?.();
	}

	// Activate the focus trap while the dialog is open; deactivate (and restore focus to the trigger)
	// when it closes or unmounts. The trap owns Escape so the dialog is always escapable (AP-3).
	$effect(() => {
		if (!open || !dialogEl) return undefined;
		const instance = createFocusTrap(dialogEl, { onEscape: close });
		instance.activate();
		trap = instance;
		return () => {
			instance.deactivate();
			if (trap === instance) trap = null;
		};
	});

	function onBackdropClick() {
		if (closeOnBackdrop) close();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="dialog-backdrop"
		data-testid={`${testid}-backdrop`}
		onclick={onBackdropClick}
	>
		<div
			bind:this={dialogEl}
			class="dialog"
			{role}
			aria-modal="true"
			aria-labelledby={titleId}
			aria-describedby={describedBy}
			tabindex="-1"
			data-testid={testid}
			onclick={(event) => event.stopPropagation()}
		>
			<div class="dialog-head">
				<h2 id={titleId} class="dialog-title">{title}</h2>
				<button
					type="button"
					class="dialog-close"
					aria-label="Close dialog"
					data-testid={`${testid}-close`}
					onclick={close}
				>
					✕
				</button>
			</div>
			<div class="dialog-body">
				{@render children()}
			</div>
			{#if footer}
				<div class="dialog-foot">
					{@render footer()}
				</div>
			{/if}
		</div>
	</div>
{/if}
