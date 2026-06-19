<script lang="ts">
	import { getSessionRecoveryPrompt } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';
	import Disclosure from '$lib/gui/a11y/Disclosure.svelte';
	import { recoveryLaunch } from './recovery-launch.svelte';

	/**
	 * UX-SES-002 — session state persistence and the recovery prompt.
	 *
	 * On launch (vault open) during an `active`/`paused` session, the Processing Core's
	 * {@link getSessionRecoveryPrompt} decides deterministically between:
	 *
	 *   - FULL restore (AC1): a non-blocking `role="status"` confirmation strip — "Session restored —
	 *     Round N / [Name]'s turn" with a "Continue" dismiss and a "View details" disclosure listing
	 *     the restored state summary. Session tools stay interactive (the restore succeeded).
	 *   - PARTIAL restore (AC2/AC3): a MODAL `role="alertdialog"` recovery banner naming the specific
	 *     item(s) that could not be restored. The a11y Dialog's focus trap + backdrop lock every
	 *     session tool out of interaction until the DM explicitly chooses "Continue with partial
	 *     state" (the dice tool is not clickable through the backdrop — AC2).
	 *
	 * DM-gated fail closed in the core query (a player/observer gets `kind: 'none'`), and shown once
	 * per LAUNCH ({@link recoveryLaunch}) so SPA navigation never re-prompts.
	 */
	const runtime = useRuntime();

	const prompt = $derived(getSessionRecoveryPrompt(runtime.state, runtime.activeActorId));
	const showRestored = $derived(
		runtime.loaded && !recoveryLaunch.acknowledged && prompt.kind === 'restored',
	);
	// The Dialog's `open` is bindable (it closes itself on Escape), so use a WRITABLE derived: it
	// tracks the per-launch gate and still accepts the Dialog's close write-back.
	let partialOpen = $derived(
		runtime.loaded && !recoveryLaunch.acknowledged && prompt.kind === 'partial',
	);

	const summary = $derived.by(() => {
		const phase = prompt.workflow === 'paused' ? 'Paused session' : 'Session';
		if (prompt.round !== null && prompt.activeCombatantName !== null) {
			return `${phase} restored — Round ${prompt.round} / ${prompt.activeCombatantName}'s turn`;
		}
		if (prompt.round !== null) return `${phase} restored — Round ${prompt.round}`;
		return `${phase} restored`;
	});

	function acknowledge(): void {
		recoveryLaunch.acknowledge();
	}
</script>

{#if showRestored}
	<!-- UX-SES-002 AC1 (full-restore arm): everything restored — confirm without blocking the tools. -->
	<section class="recovery-restored" role="status" data-testid="ses-recovery-restored">
		<p class="recovery-summary" data-testid="ses-recovery-summary">{summary}</p>
		<Disclosure summary="View details" testid="ses-recovery-details">
			<ul class="recovery-items" data-testid="ses-recovery-restored-items">
				{#each prompt.restoredItems as item (item)}
					<li>{item}</li>
				{/each}
				{#if prompt.restoredItems.length === 0}
					<li class="meta">No live state beyond the session phase.</li>
				{/if}
			</ul>
		</Disclosure>
		<button
			type="button"
			class="button"
			data-testid="ses-recovery-continue"
			onclick={acknowledge}
		>
			Continue
		</button>
	</section>
{/if}

<!-- UX-SES-002 AC2/AC3 (partial-restore arm): a modal lock — the focus trap + backdrop make every
     session tool non-interactive until the DM decides. Backdrop close is disabled; the choice is
     explicit. -->
{#if partialOpen}
	<Dialog
		bind:open={partialOpen}
		title="Some session state could not be restored"
		role="alertdialog"
		closeOnBackdrop={false}
		testid="ses-recovery-partial"
		onclose={acknowledge}
	>
		<p data-testid="ses-recovery-partial-summary">
			The {prompt.workflow === 'paused' ? 'paused' : 'active'} session was recovered with gaps.
			Continue with partial state, or review the session from the Command Center.
		</p>
		<p class="missing-heading">Could not be restored:</p>
		<ul class="recovery-items missing" data-testid="ses-recovery-missing-items">
			{#each prompt.missingItems as item (item)}
				<li data-testid="ses-recovery-missing-item">{item}</li>
			{/each}
		</ul>
		{#if prompt.restoredItems.length > 0}
			<Disclosure summary="View restored state" testid="ses-recovery-partial-details">
				<ul class="recovery-items" data-testid="ses-recovery-partial-restored-items">
					{#each prompt.restoredItems as item (item)}
						<li>{item}</li>
					{/each}
				</ul>
			</Disclosure>
		{/if}
		<div class="recovery-actions">
			<a href="/" data-testid="ses-recovery-command-center">Open Command Center</a>
			<button
				type="button"
				class="button"
				data-testid="ses-recovery-continue-partial"
				onclick={acknowledge}
			>
				Continue with partial state
			</button>
		</div>
	</Dialog>
{/if}

<style>
	.recovery-restored {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-2) var(--space-3);
		margin-bottom: var(--space-3);
		border: 1px solid var(--color-status-success);
		border-radius: var(--radius-md);
		background: var(--color-status-success-subtle);
		box-shadow: var(--shadow-sm);
	}

	.recovery-summary {
		margin: 0;
		font-weight: 600;
	}

	.recovery-items {
		list-style: none;
		padding: 0;
		margin: var(--space-1) 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
	}

	.recovery-items.missing li {
		color: var(--color-status-error-text);
		font-weight: 600;
	}

	.missing-heading {
		margin-bottom: 0;
		font-weight: 600;
	}

	.meta {
		color: var(--color-text-secondary);
	}

	.recovery-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-3);
		margin-top: var(--space-4);
	}
</style>
