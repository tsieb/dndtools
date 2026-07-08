<script lang="ts">
	import {
		listSessionPhaseActions,
		type SessionPhaseAction,
		type SessionWorkflowState,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';

	/**
	 * UX-CMD-010 — session phase transition controls. The Phase badge is a button; clicking it opens a
	 * compact popover listing ONLY the valid next-phase transitions from the current workflow (invalid
	 * transitions are absent, never disabled-with-a-hint). The transition/confirmation policy is the
	 * Processing Core's ({@link listSessionPhaseActions}, DM-gated fail-closed): pause/resume dispatch
	 * immediately with no dialog (AC1); start/archive take one confirmation; "End session" is a hard
	 * TWO-step — dialog 1 confirms the wind-down (→ ending), dialog 2 opens the recap (AC2). Every
	 * action dispatches the same `session.set-workflow` command the workflow toolbar issues
	 * (UX-CMD-011 parity), and the result is announced via the shared live announcer.
	 */

	const runtime = useRuntime();
	const announcer = useLiveAnnouncer();

	let menuOpen = $state(false);
	let confirming = $state<SessionPhaseAction | null>(null);
	let confirmOpen = $state(false);
	// UX-CMD-010 AC2 — the second dialog of the End-session two-step (set after `ending` lands).
	let followUp = $state<SessionPhaseAction | null>(null);
	let followUpOpen = $state(false);

	const workflow = $derived(runtime.state.session.workflow);
	const actions = $derived(listSessionPhaseActions(runtime.state, runtime.activeActorId));

	async function dispatchPhase(target: SessionWorkflowState): Promise<boolean> {
		const payload: { workflow: SessionWorkflowState; activeSceneId?: string | null } = {
			workflow: target,
		};
		// Mirror the session-workflow toolbar's payload exactly (one command, one shape).
		if (target === 'active' || target === 'prep' || target === 'paused' || target === 'ending') {
			payload.activeSceneId =
				runtime.state.session.activeSceneId ?? runtime.state.commandCenter.homeSceneId;
		}
		const result = await runtime.dispatch({
			type: 'session.set-workflow',
			actorId: runtime.activeActorId,
			payload,
		});
		return result.status === 'accepted';
	}

	async function run(action: SessionPhaseAction): Promise<void> {
		menuOpen = false;
		if (action.confirmation === 'none') {
			// AC1: pause/resume are immediate — no confirmation dialog under table pressure.
			if (await dispatchPhase(action.targetWorkflow)) {
				announcer?.announce(action.announcement, 'assertive');
			}
			return;
		}
		confirming = action;
		confirmOpen = true;
	}

	function cancelConfirm(): void {
		confirmOpen = false;
		confirming = null;
	}

	async function confirmAccepted(): Promise<void> {
		const action = confirming;
		cancelConfirm();
		if (!action) return;
		if (!(await dispatchPhase(action.targetWorkflow))) return;
		announcer?.announce(action.announcement, 'assertive');
		// AC2: "End session" requires a SECOND confirmation before the session reaches recap.
		if (action.confirmation === 'double-confirm' && action.followUpWorkflow) {
			followUp = action;
			followUpOpen = true;
		}
	}

	function cancelFollowUp(): void {
		followUpOpen = false;
		followUp = null;
	}

	async function followUpAccepted(): Promise<void> {
		const action = followUp;
		cancelFollowUp();
		if (!action?.followUpWorkflow) return;
		if (await dispatchPhase(action.followUpWorkflow)) {
			announcer?.announce('Session recap is open.', 'assertive');
		}
	}
</script>

<div class="phase-controls" data-testid="cc-phase-controls">
	<button
		type="button"
		class="phase-badge"
		data-testid="cc-phase-badge"
		data-phase={workflow}
		aria-haspopup="menu"
		aria-expanded={menuOpen}
		disabled={actions.length === 0}
		onclick={() => (menuOpen = !menuOpen)}
	>
		<span class="phase-key">Phase</span>
		<span class="phase-value">{workflow}</span>
	</button>

	{#if menuOpen}
		<div class="phase-menu" role="menu" aria-label="Session phase transitions" data-testid="cc-phase-menu">
			{#each actions as action (action.id)}
				<button
					type="button"
					role="menuitem"
					data-testid={`cc-phase-action-${action.targetWorkflow}`}
					onclick={() => run(action)}
				>
					{action.label}
				</button>
			{/each}
		</div>
	{/if}
</div>

<!-- Single confirmation (start / archive) and step 1 of the End-session two-step. Backdrop close is
     disabled so the gate is an explicit Cancel/Confirm choice; Cancel holds initial focus (safer
     default), and Escape always cancels via the dialog's focus trap. -->
<Dialog
	bind:open={confirmOpen}
	title={confirming?.confirmTitle ?? 'Confirm'}
	role="alertdialog"
	closeOnBackdrop={false}
	testid="cc-phase-confirm"
	onclose={() => (confirming = null)}
>
	<p>{confirming?.confirmBody}</p>
	<div class="phase-confirm-actions">
		<button type="button" data-testid="cc-phase-confirm-cancel" onclick={cancelConfirm}>
			Cancel
		</button>
		<button
			type="button"
			class="button"
			data-testid="cc-phase-confirm-accept"
			onclick={confirmAccepted}
		>
			{confirming?.confirmation === 'double-confirm' ? 'Proceed to recap' : confirming?.label}
		</button>
	</div>
</Dialog>

<!-- Step 2 of the End-session two-step (UX-CMD-010 AC2): opening the recap. -->
<Dialog
	bind:open={followUpOpen}
	title="Open the session recap?"
	role="alertdialog"
	closeOnBackdrop={false}
	testid="cc-phase-end-recap"
	onclose={() => (followUp = null)}
>
	<p>The session is winding down. Open the recap to review and archive it.</p>
	<div class="phase-confirm-actions">
		<button type="button" data-testid="cc-phase-end-recap-cancel" onclick={cancelFollowUp}>
			Not yet
		</button>
		<button
			type="button"
			class="button"
			data-testid="cc-phase-end-recap-accept"
			onclick={followUpAccepted}
		>
			Open recap
		</button>
	</div>
</Dialog>

<style>
	.phase-controls {
		position: relative;
		display: inline-flex;
	}

	.phase-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		border-radius: var(--radius-full, 999px);
		padding: var(--space-1) var(--space-3);
	}

	.phase-key {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.phase-value {
		font-weight: 600;
		text-transform: capitalize;
	}

	.phase-menu {
		position: absolute;
		top: calc(100% + var(--space-1));
		left: 0;
		z-index: 30;
		display: flex;
		flex-direction: column;
		min-width: 240px;
		padding: var(--space-1);
		background: var(--color-surface-overlay);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
	}

	.phase-menu button {
		justify-content: flex-start;
		text-align: left;
	}

	.phase-confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}
</style>
