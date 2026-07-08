<script lang="ts">
	import type { SessionWorkflowState } from '@dndtools/core';

	/**
	 * UX-SES-001 — the per-tool session-state gate message. Session-gated tools (dice, combat, live
	 * timers) render this INLINE message (never a dismissible modal) whenever the session is not
	 * `active`: it names the current state and links directly to the Command Center, where the
	 * session is started (UX-SES-001 AC2). Rendered in a `role="status"` region per the spec's
	 * accessibility contract.
	 */
	interface Props {
		workflow: SessionWorkflowState;
		testid?: string;
	}

	let { workflow, testid = 'session-state-gate' }: Props = $props();
</script>

<p class="state-gate" role="status" data-testid={testid} data-workflow={workflow}>
	Available when the session is active (current state: {workflow}).
	<a href="/" data-testid={`${testid}-link`}>Start the session from the Command Center</a>.
</p>

<style>
	.state-gate {
		display: block;
		padding: var(--space-1) var(--space-2);
		border-left: 3px solid var(--color-status-info);
		color: var(--color-text-muted);
		background: var(--color-status-info-subtle);
		border-radius: var(--radius-sm);
	}
</style>
