<script lang="ts">
	/**
	 * Active-session Command Center widget: the glanceable status strip, the phase-controls popover,
	 * and the session-workflow transition strip. Self-contained — reads the DM home view + session
	 * mode from the Processing Core and dispatches `session.set-workflow` / `session.recover` itself.
	 */
	import {
		SESSION_WORKFLOW_STATES,
		getSessionParticipantStatus,
		getSessionWidgetMode,
		isTransitionAllowed,
		resolveCommandCenterHome,
		type SessionWorkflowState,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import SessionStatusStrip from '$lib/gui/ux-cmd/SessionStatusStrip.svelte';
	import SessionPhaseControls from '$lib/gui/ux-cmd/SessionPhaseControls.svelte';

	const runtime = useRuntime();

	const homeView = $derived(
		resolveCommandCenterHome(runtime.state, runtime.defaultActorId, {
			widgetPackages: runtime.state.widgets,
		}),
	);
	const statusStrip = $derived(homeView.kind === 'dm' ? homeView.statusStrip : null);
	const sessionMode = $derived(getSessionWidgetMode(runtime.state.session));
	const playerSessionStatus = $derived(
		getSessionParticipantStatus(runtime.state.session, runtime.state.permissions, 'actor-player'),
	);
	const homeSceneId = $derived(runtime.state.commandCenter.homeSceneId);

	async function setWorkflow(workflow: SessionWorkflowState) {
		const payload: { workflow: SessionWorkflowState; activeSceneId?: string | null } = { workflow };
		if (
			workflow === 'active' ||
			workflow === 'prep' ||
			workflow === 'paused' ||
			workflow === 'ending'
		) {
			payload.activeSceneId = runtime.state.session.activeSceneId ?? homeSceneId;
		}
		await runtime.dispatch({ type: 'session.set-workflow', actorId: runtime.defaultActorId, payload });
	}

	async function recoverSession() {
		await runtime.dispatch({ type: 'session.recover', actorId: runtime.defaultActorId, payload: {} });
	}
</script>

{#if statusStrip}
	<SessionStatusStrip strip={statusStrip} />
{/if}
<SessionPhaseControls />

<section aria-label="Session workflow" data-testid="session-workflow">
	<h3>Session workflow</h3>
	<div class="workflow-strip" role="toolbar" aria-label="Session workflow states">
		{#each SESSION_WORKFLOW_STATES as workflow (workflow)}
			{@const allowed = isTransitionAllowed(runtime.state.session.workflow, workflow)}
			<button
				type="button"
				data-testid={`session-workflow-${workflow}`}
				aria-pressed={runtime.state.session.workflow === workflow}
				class:selected={runtime.state.session.workflow === workflow}
				disabled={!allowed}
				title={allowed
					? `Move session to ${workflow}`
					: `Cannot move from ${runtime.state.session.workflow} to ${workflow}`}
				onclick={() => setWorkflow(workflow)}
			>
				{workflow}
			</button>
		{/each}
	</div>
	<p class="meta" data-testid="session-workflow-status">
		{runtime.state.session.workflow} • {sessionMode.mode} • {sessionMode.status}
		{#if runtime.state.session.activeSceneId}
			• Scene {runtime.state.session.activeSceneId}
		{/if}
	</p>
	<p class="meta" data-testid="session-player-status">
		Demo Player: {playerSessionStatus.connection}
	</p>
	{#if sessionMode.recapArchiveId}
		<p class="meta" data-testid="session-recap-archive">
			Archive {sessionMode.recapArchiveId} •
			{runtime.state.session.archives[sessionMode.recapArchiveId]?.diceHistory.length ?? 0}
			rolls
		</p>
		<button
			type="button"
			class="secondary"
			data-testid="session-recover"
			disabled={!isTransitionAllowed(runtime.state.session.workflow, 'recap')}
			onclick={() => recoverSession()}
		>
			Recover archived session
		</button>
	{/if}
</section>
