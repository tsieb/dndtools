<script lang="ts">
	import { untrack } from 'svelte';
	import {
		effectiveCapabilitySetsForActorOnEntity,
		getTimerCountdown,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { SessionClock } from '$lib/platform/clock.svelte';
	import { useLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';
	import SessionStateGate from '$lib/gui/ux-ses/SessionStateGate.svelte';

	// SES-005 / UX-SES-012: the TIMER widget surface. A participant with at least an `operator`
	// capability-set grant OPERATES the timer (start, pause, resume, skip, reset) WITHOUT configuring
	// it; "Set duration" requires `manager`. The GUI renders affordances from the effective sets
	// (operator never even SEES the configure control — UX-SES-012 AC2) and the Processing Core
	// re-enforces the same boundary fail-closed on dispatch.
	//
	// UX-SES-012 countdown: the durable timer document lives in core session state; the platform-layer
	// SessionClock ticks the current instant and the PURE core `getTimerCountdown` derives remaining
	// time, the arm's-length display, the depleting bar fraction, and the urgency band (red numerals +
	// red bar in the final 10 s; "Time's up!" + `role="alert"` at zero). No GUI-owned countdown state.
	const runtime = useRuntime();
	const announcer = useLiveAnnouncer();
	const clock = new SessionClock();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const sessionActive = $derived(runtime.state.session.workflow === 'active');
	const activeSceneId = $derived(runtime.state.session.activeSceneId);

	// The timer widget on the active Scene (the Command Center seeds one).
	const scene = $derived(activeSceneId ? runtime.state.scenes.scenes[activeSceneId] : undefined);
	const timerWidget = $derived(scene?.widgets.find((w) => w.type === 'timer') ?? null);
	const timer = $derived(timerWidget ? runtime.state.session.timers[timerWidget.id] : undefined);

	// The manager-configured default duration (timer.set-duration writes the widget configuration).
	const configuredDuration = $derived.by(() => {
		const raw = timerWidget?.configuration?.durationSeconds;
		const value = typeof raw === 'number' ? Math.trunc(raw) : 0;
		return value > 0 ? value : 60;
	});

	const countdown = $derived(getTimerCountdown(timer, clock.nowIso, configuredDuration));

	// Tick the platform clock only while the core timer is actually running and not yet expired.
	$effect(() => {
		const ticking = timer?.status === 'running' && countdown.status !== 'expired';
		if (ticking) {
			clock.start();
			return () => clock.stop();
		}
		clock.stop();
		return undefined;
	});

	// UX-SES-012 — announce the urgency transition once per run ("10 seconds remaining", assertive)
	// and the expiry. announce() inside $effect is wrapped in untrack (no effect loops).
	let announcedDanger = $state(false);
	$effect(() => {
		const urgency = countdown.urgency;
		const status = countdown.status;
		untrack(() => {
			if (status === 'running' && urgency === 'danger') {
				if (!announcedDanger) {
					announcedDanger = true;
					announcer?.announce('10 seconds remaining', 'assertive');
				}
			} else if (status !== 'expired' && announcedDanger) {
				announcedDanger = false;
			}
		});
	});

	const players = $derived(runtime.actors.filter((a) => a.role === 'player'));

	// The active actor's effective widget capability sets on the timer (drives rendered affordances).
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
	// UX-SES-012 — `operator`+ may operate; only `manager` (or the DM) may configure. The core
	// re-enforces both fail-closed; the GUI additionally hides what the actor may not use (AC2).
	const canOperate = $derived(
		isDm || effectiveSets.includes('operator') || effectiveSets.includes('manager'),
	);
	const canManage = $derived(isDm || effectiveSets.includes('manager'));

	let error = $state<string | null>(null);
	let grantPlayer = $state('');
	let grantSet = $state<'operator' | 'manager'>('operator');
	let durationDraft = $state(60);

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

	async function setDuration(): Promise<void> {
		const seconds = Math.trunc(Number(durationDraft) || 0);
		if (seconds <= 0) {
			error = 'Enter a duration of at least 1 second.';
			return;
		}
		await operate('timer.set-duration', { durationSeconds: seconds });
	}
</script>

<section data-testid="live-tools" aria-label="Live tools">
	<h2>Live tools</h2>

	{#if error}
		<p class="error" role="alert" data-testid="live-tools-error">{error}</p>
	{/if}

	{#if !sessionActive}
		<!-- UX-SES-001 — session-state-gated tool: inline message + direct Command Center link. -->
		<SessionStateGate workflow={runtime.state.session.workflow} testid="live-tools-needs-active-session" />
	{:else if !timerWidget}
		<p class="meta" data-testid="live-tools-no-timer">No timer widget on the active Scene.</p>
	{:else}
		<!-- UX-SES-012 — the arm's-length countdown: large numerals, depleting bar, status label. -->
		<div class="timer" data-testid="session-timer" data-urgency={countdown.urgency}>
			<div
				class="numerals"
				role="timer"
				aria-label={`Time remaining: ${countdown.display}`}
				data-testid="timer-display"
			>
				{countdown.display}
			</div>
			<div class="bar-track" aria-hidden="true">
				<div
					class="bar-fill"
					data-testid="timer-bar"
					style:width={`${Math.round(countdown.fractionRemaining * 100)}%`}
				></div>
			</div>
			<p class="meta status-label" data-testid="timer-status">{countdown.statusLabel}</p>
			{#if countdown.status === 'expired'}
				<!-- AC3 — the expiry banner is a role="alert" live region (fires on insertion). -->
				<p class="expired" role="alert" data-testid="timer-expired">Time's up!</p>
			{/if}
		</div>

		<div class="effective" data-testid="timer-effective-sets">
			Effective: {effectiveSets.length > 0 ? effectiveSets.join(', ') : isDm ? 'dm (all)' : 'none'}
		</div>

		{#if canOperate}
			<!-- UX-SES-012 — operator controls: contextual Start/Pause/Resume + Skip/Reset. -->
			<div class="operate" data-testid="timer-operate-controls">
				{#if countdown.status === 'running'}
					<button type="button" data-testid="timer-pause" onclick={() => void operate('timer.pause')}>
						⏸ Pause
					</button>
				{:else if countdown.status === 'paused'}
					<button type="button" data-testid="timer-resume" onclick={() => void operate('timer.resume')}>
						▶ Resume
					</button>
				{:else}
					<button
						type="button"
						data-testid="timer-start"
						onclick={() => void operate('timer.start', { durationSeconds: configuredDuration })}
					>
						▶ Start
					</button>
				{/if}
				<button
					type="button"
					data-testid="timer-advance"
					aria-label="Skip forward 30 seconds"
					onclick={() => void operate('timer.advance', { deltaSeconds: 30 })}
				>
					Skip +30s
				</button>
				<button type="button" data-testid="timer-reset" onclick={() => void operate('timer.reset')}>
					⟲ Reset
				</button>
			</div>
		{/if}

		{#if canManage}
			<!-- UX-SES-012 — "Set duration" is manager-only (an operator never sees it, AC2). -->
			<form
				class="configure"
				data-testid="timer-configure-form"
				onsubmit={(event) => {
					event.preventDefault();
					void setDuration();
				}}
			>
				<label for="timer-duration">Set duration (seconds)</label>
				<input
					id="timer-duration"
					type="number"
					min="1"
					data-testid="timer-duration-input"
					aria-label="Set timer duration (manager only)"
					bind:value={durationDraft}
				/>
				<button type="submit" data-testid="timer-configure">Set duration</button>
			</form>
		{/if}

		{#if isDm}
			<!-- SES-005 — DM-only grant + project section, separate from operator controls. -->
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
				<select data-testid="grant-set-select" aria-label="Capability set" bind:value={grantSet}>
					<option value="operator">Operator (operate only)</option>
					<option value="manager">Manager (operate + configure)</option>
				</select>
				<button type="submit" data-testid="grant-timer">Grant</button>
				<button type="button" data-testid="project-timer" onclick={() => void project()}>
					Project to player
				</button>
			</form>
		{/if}
	{/if}
</section>

<style>
	.error {
		color: var(--color-status-error);
	}
	.meta {
		color: var(--color-text-secondary);
	}
	.timer {
		max-width: 22rem;
		margin-bottom: var(--space-2);
	}
	/* UX-SES-012 — countdown numerals readable at arm's length (>= 24 px on every profile). */
	.numerals {
		font-size: var(--text-3xl, 2rem);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
		transition: color var(--duration-fast) var(--easing-standard, ease-out);
	}
	/* Urgency: red numerals in the final 10 s. Bold weight is the non-color reinforcement, so the
	   reduced-motion fallback (durations collapse to 0) still reads (UX-SES-012 spec). */
	.timer[data-urgency='danger'] .numerals {
		color: var(--color-status-error);
		font-weight: 700;
	}
	.bar-track {
		height: 4px;
		background: var(--color-surface-sunken);
		border-radius: var(--radius-sm);
		overflow: hidden;
		margin-top: var(--space-1);
	}
	.bar-fill {
		height: 100%;
		background: var(--color-status-success);
		transition: width var(--duration-fast) linear;
	}
	.timer[data-urgency='warning'] .bar-fill {
		background: var(--color-status-warning);
	}
	.timer[data-urgency='danger'] .bar-fill {
		background: var(--color-status-error);
	}
	.status-label {
		margin: var(--space-1) 0 0;
	}
	.expired {
		color: var(--color-status-error);
		font-weight: 700;
		margin: var(--space-1) 0 0;
	}
	.grant-form,
	.operate,
	.configure {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
		margin-bottom: var(--space-2);
	}
	.effective {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--space-1);
	}
</style>
