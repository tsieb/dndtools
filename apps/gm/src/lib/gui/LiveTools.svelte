<script lang="ts">
	import { effectiveCapabilitySetsForActorOnEntity } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// SES-005: a participant with a timer/tool widget `operator` grant may OPERATE the tool (start, pause,
	// resume, reset, advance) WITHOUT configuring it. Configuring (set-duration) requires `manager`. This
	// surface lets the DM grant operator/manager on the active Scene's timer widget and project it to a
	// player, then OPERATE or CONFIGURE as the active actor. The Processing Core decides authority
	// fail-closed (operate-allowed / configure-denied); the GUI only dispatches intents and renders state.
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const sessionActive = $derived(runtime.state.session.workflow === 'active');
	const activeSceneId = $derived(runtime.state.session.activeSceneId);

	// The timer widget on the active Scene (the Command Center seeds one).
	const scene = $derived(activeSceneId ? runtime.state.scenes.scenes[activeSceneId] : undefined);
	const timerWidget = $derived(scene?.widgets.find((w) => w.type === 'timer') ?? null);
	const timer = $derived(timerWidget ? runtime.state.session.timers[timerWidget.id] : undefined);

	const players = $derived(runtime.actors.filter((a) => a.role === 'player'));

	// The active actor's effective widget capability sets on the timer (drives the rendered affordances).
	const effectiveSets = $derived(
		timerWidget
			? effectiveCapabilitySetsForActorOnEntity(
					runtime.state.permissions,
					runtime.activeActorId,
					'widget',
					timerWidget.id,
				)
			: [],
	);

	let error = $state<string | null>(null);
	let grantPlayer = $state('');
	let grantSet = $state<'operator' | 'manager'>('operator');

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		error = null;
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return false;
		}
		return true;
	}

	async function grant(): Promise<void> {
		if (!timerWidget || !grantPlayer) {
			error = 'Select a player to grant.';
			return;
		}
		await dispatch({
			type: 'permission.grant-capability-set',
			actorId: runtime.activeActorId,
			payload: {
				entityType: 'widget',
				entityId: timerWidget.id,
				playerActorId: grantPlayer,
				capabilitySet: grantSet,
			},
		});
	}

	async function project(): Promise<void> {
		if (!timerWidget || !activeSceneId || !grantPlayer) {
			error = 'Select a player to project the timer to.';
			return;
		}
		await dispatch({
			type: 'session.project-player-view',
			actorId: runtime.activeActorId,
			payload: {
				playerActorIds: [grantPlayer],
				target: { kind: 'widget-subset', sceneId: activeSceneId, widgetInstanceIds: [timerWidget.id] },
			},
		});
	}

	async function operate(commandType: string, payload: Record<string, unknown> = {}): Promise<void> {
		if (!timerWidget || !activeSceneId || !scene) return;
		await dispatch({
			type: 'widget.dispatch-command',
			actorId: runtime.activeActorId,
			idempotencyKey: `${commandType}-${timerWidget.id}-${runtime.newId()}`,
			payload: {
				sceneId: activeSceneId,
				widgetInstanceId: timerWidget.id,
				commandType,
				payload,
				expectedRevision: scene.ownership.revision,
			},
		});
	}
</script>

<section data-testid="live-tools" aria-label="Live tools">
	<h2>Live tools</h2>

	{#if error}
		<p class="error" role="alert" data-testid="live-tools-error">{error}</p>
	{/if}

	{#if !sessionActive}
		<p class="meta" data-testid="live-tools-needs-active-session">
			Live tools are available while the session is active. Start the session from the Command Center
			first.
		</p>
	{:else if !timerWidget}
		<p class="meta" data-testid="live-tools-no-timer">No timer widget on the active Scene.</p>
	{:else}
		<p class="meta" data-testid="timer-status">
			Timer: {timer ? `${timer.status} (${timer.durationSeconds}s)` : 'not started'}
		</p>

		{#if isDm}
			<form
				class="grant-form"
				data-testid="timer-grant-form"
				onsubmit={(event) => {
					event.preventDefault();
					void grant();
				}}
			>
				<label for="grant-player">Grant timer access to</label>
				<select id="grant-player" data-testid="grant-player-select" bind:value={grantPlayer}>
					<option value="">Select a player…</option>
					{#each players as player (player.id)}
						<option value={player.id}>{player.displayName}</option>
					{/each}
				</select>
				<select data-testid="grant-set-select" bind:value={grantSet}>
					<option value="operator">Operator (operate only)</option>
					<option value="manager">Manager (operate + configure)</option>
				</select>
				<button type="submit" data-testid="grant-timer">Grant</button>
				<button type="button" data-testid="project-timer" onclick={() => void project()}>
					Project to player
				</button>
			</form>
		{/if}

		<div class="effective" data-testid="timer-effective-sets">
			Effective: {effectiveSets.length > 0 ? effectiveSets.join(', ') : isDm ? 'dm (all)' : 'none'}
		</div>

		<div class="operate" data-testid="timer-operate-controls">
			<button type="button" data-testid="timer-start" onclick={() => void operate('timer.start', { durationSeconds: 60 })}>
				Start
			</button>
			<button type="button" data-testid="timer-pause" onclick={() => void operate('timer.pause')}>Pause</button>
			<button type="button" data-testid="timer-resume" onclick={() => void operate('timer.resume')}>Resume</button>
			<button type="button" data-testid="timer-advance" onclick={() => void operate('timer.advance', { deltaSeconds: 30 })}>
				Advance 30s
			</button>
			<button type="button" data-testid="timer-reset" onclick={() => void operate('timer.reset')}>Reset</button>
			<button
				type="button"
				data-testid="timer-configure"
				onclick={() => void operate('timer.set-duration', { durationSeconds: 300 })}
			>
				Configure duration (300s)
			</button>
		</div>
	{/if}
</section>

<style>
	.error {
		color: var(--color-danger, #b00020);
	}
	.meta {
		color: var(--color-text-muted, #666);
	}
	.grant-form,
	.operate {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		align-items: center;
		margin-bottom: var(--space-2, 0.5rem);
	}
	.effective {
		font-size: 0.85rem;
		color: var(--color-text-muted, #666);
		margin-bottom: var(--space-1, 0.25rem);
	}
</style>
