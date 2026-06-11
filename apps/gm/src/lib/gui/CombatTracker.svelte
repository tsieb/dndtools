<script lang="ts" module>
	let trackerSeq = 0;
	function nextTrackerId(): string {
		trackerSeq += 1;
		return `combat-tracker-${trackerSeq}`;
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { getSharedCombatView, listEncountersForActor } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';
	import { isFromTextEntry } from '$lib/gui/a11y/keyboard';
	import { useMotion } from '$lib/platform/motion.svelte';
	import { useSessionToasts } from '$lib/gui/ux-ses/session-toasts.svelte';
	import SessionStateGate from '$lib/gui/ux-ses/SessionStateGate.svelte';

	// SES-002 / COLLAB-006: run combat. The DM rolls initiative, advances turns (wrapping to the next
	// round), applies per-combatant HP / conditions / death saves / concentration, and ends combat
	// (persisting the encounter log). Participants see the SHARED combat view ACCORDING TO ROLE AND GRANTS
	// (COLLAB-006): a hidden combatant's identity + stat data never reach them (the core decides visibility
	// before render), and the PERMITTED CONTROLS are role/grant-gated, fail closed (`controls`). Every
	// change dispatches a durable command; the GUI renders the computed model and never writes state
	// directly (Contract 1). The core re-enforces session-active gating + DM/combat-participant authority.
	//
	// UX-SES-003/004/006 — the HOT-PATH COMBAT SHELL on top of that read model: a sticky header strip
	// (Prev / Round / Next / Pause), scoreboard row anatomy (initiative · name · HP · AC · condition
	// chips), an unmistakable current-turn treatment (≥3 visual dimensions + aria-current), defeated
	// rows sorted below the living, and 1-keypress turn advance (Space / Shift+Space; N / P globally).
	// UX-SES-017 — HP changes raise an 8-second undo toast dispatching the core's inverse command.
	const runtime = useRuntime();
	const announcer = useLiveAnnouncer();
	const motion = useMotion();
	const toasts = useSessionToasts();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const sessionActive = $derived(runtime.state.session.workflow === 'active');

	// COLLAB-006 — the shared combat view (tracker + role/grant-gated permitted controls + liveness). The
	// view is `live` here (this client is connected to its own authoritative state); the `controls` model
	// drives which actions render, so the GUI never offers an action the core would reject.
	const shared = $derived(
		getSharedCombatView(runtime.state.session.combat, runtime.state.permissions, runtime.activeActorId),
	);
	const view = $derived(shared.tracker);
	const controls = $derived(shared.controls);
	const editableCombatantIds = $derived(new Set(controls.editableCombatantIds));

	// UX-SES-003 AC3 — defeated combatants render BELOW all non-defeated combatants (display order
	// only; the core's initiative order — and turn math — is untouched).
	const orderedRows = $derived.by(() => {
		const standing = view.combatants.filter((row) => !row.isDefeated);
		const defeated = view.combatants.filter((row) => row.isDefeated);
		return [...standing, ...defeated];
	});

	// UX-SES-006 — Prev has nothing to return to at the very first turn of round 1.
	const canGoPrevious = $derived(
		controls.canAdvanceTurn && view.status === 'running' && !(view.round <= 1 && view.turn <= 0),
	);

	// The DM's encounters (to start combat from one by reference). Empty for non-DM.
	const encounters = $derived(
		listEncountersForActor(runtime.state.encounters, runtime.state.permissions, runtime.activeActorId),
	);

	let error = $state<string | null>(null);
	let startEncounterId = $state<string>('');
	let hpDelta = $state<Record<string, string>>({});
	let conditionName = $state<Record<string, string>>({});
	// UX-SES-006 — pending state for the hot-path buttons (≤100 ms spinner per UX-SES-017).
	let advancing = $state(false);
	// UX-SES-003 — per-combatant "+N more" condition-chip expansion (max 3 chips inline).
	const expandedConditions = new SvelteSet<string>();

	let sectionEl = $state<HTMLElement | null>(null);
	const shortcutsHintId = nextTrackerId();

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		error = null;
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return false;
		}
		return true;
	}

	async function startFromEncounter(): Promise<void> {
		if (!startEncounterId) {
			error = 'Select an encounter to run.';
			return;
		}
		await dispatch({
			type: 'combat.start',
			actorId: runtime.activeActorId,
			payload: { encounterId: startEncounterId },
		});
	}

	async function advanceTurn(): Promise<void> {
		if (advancing) return;
		advancing = true;
		try {
			await dispatch({ type: 'combat.advance-turn', actorId: runtime.activeActorId, payload: {} });
		} finally {
			advancing = false;
		}
	}

	// UX-SES-006 AC3 — Prev is the undo for an accidental advance.
	async function previousTurn(): Promise<void> {
		if (advancing) return;
		advancing = true;
		try {
			await dispatch({ type: 'combat.previous-turn', actorId: runtime.activeActorId, payload: {} });
		} finally {
			advancing = false;
		}
	}

	async function endCombat(): Promise<void> {
		await dispatch({ type: 'combat.end', actorId: runtime.activeActorId, payload: {} });
	}

	// UX-SES-001 AC1 — "Pause session" lives in the tracker header while the session is active.
	// Dispatches the SAME `session.set-workflow` command (and payload shape) as the Command Center
	// phase controls (UX-CMD-010 parity); pause is immediate, no confirmation under table pressure.
	async function pauseSession(): Promise<void> {
		const ok = await dispatch({
			type: 'session.set-workflow',
			actorId: runtime.activeActorId,
			payload: {
				workflow: 'paused',
				activeSceneId:
					runtime.state.session.activeSceneId ?? runtime.state.commandCenter.homeSceneId,
			},
		});
		if (ok) announcer?.announce('Session paused. Players see the paused screen.', 'assertive');
	}

	// UX-SES-017 AC1/AC2 — an HP change raises an undo toast ("[Name] HP: 30 → 18. Undo?") within
	// the optimistic update; Undo dispatches the core's INVERSE command and confirms via toast +
	// polite live region. Names/values come from the actor-filtered view, never the raw model.
	async function applyHp(combatantId: string): Promise<void> {
		const delta = Math.trunc(Number(hpDelta[combatantId] ?? 0));
		if (!Number.isFinite(delta) || delta === 0) {
			error = 'Enter a non-zero HP change.';
			return;
		}
		const before = view.combatants.find((row) => row.id === combatantId);
		const oldHp = before?.resources?.hp ?? null;
		const name = before?.name ?? 'Combatant';
		const ok = await dispatch({
			type: 'combat.apply-resource',
			actorId: runtime.activeActorId,
			payload: { combatantId, kind: 'hp', delta },
		});
		if (!ok) return;
		hpDelta = { ...hpDelta, [combatantId]: '' };
		const after = view.combatants.find((row) => row.id === combatantId);
		const newHp = after?.resources?.hp ?? null;
		if (oldHp === null || newHp === null || oldHp === newHp) return;
		toasts?.push('undo', `${name} HP: ${oldHp} → ${newHp}. Undo?`, {
			label: 'Undo',
			run: async () => {
				const undone = await dispatch({
					type: 'combat.apply-resource',
					actorId: runtime.activeActorId,
					payload: { combatantId, kind: 'hp', delta: oldHp - newHp },
				});
				if (undone) {
					toasts?.push('milestone', 'HP change undone.');
					announcer?.announce('HP change undone.', 'polite');
				}
			},
		});
	}

	async function addCondition(combatantId: string): Promise<void> {
		const condition = (conditionName[combatantId] ?? '').trim();
		if (!condition) {
			error = 'Enter a condition name.';
			return;
		}
		const ok = await dispatch({
			type: 'combat.apply-resource',
			actorId: runtime.activeActorId,
			payload: { combatantId, kind: 'condition', condition, present: true },
		});
		if (ok) conditionName = { ...conditionName, [combatantId]: '' };
	}

	async function deathSave(combatantId: string, outcome: 'success' | 'failure'): Promise<void> {
		await dispatch({
			type: 'combat.apply-resource',
			actorId: runtime.activeActorId,
			payload: { combatantId, kind: 'death-save', outcome },
		});
	}

	// UX-SES-004 AC2 / UX-SES-006 AC1+AC4 — react to turn/round changes from the actor-filtered view
	// (regardless of which client dispatched): announce the new active combatant via the shared live
	// region (a redacted active combatant announces its placeholder name — UX-SES-004 AC3), toast
	// "Round N begins" when the round wraps forward, and scroll the new current-turn row into view
	// (reduced motion ⇒ instant). All side effects run untracked so the effect cannot loop
	// (effect_update_depth_exceeded).
	let prevActiveId: string | null = null;
	let prevRound: number | null = null;
	let prevStatus: string | null = null;
	$effect(() => {
		const status = view.status;
		const activeId = view.activeCombatantId;
		const round = view.round;
		const activeName = view.combatants.find((row) => row.isActive)?.name ?? null;
		const section = sectionEl;
		const reduced = motion.resolvedMotion === 'reduced';
		untrack(() => {
			const wasRunning = prevStatus === 'running';
			if (status === 'running' && wasRunning && activeId !== prevActiveId && activeName) {
				announcer?.announce(`It is now ${activeName}'s turn, round ${round}.`, 'assertive');
			}
			if (status === 'running' && wasRunning && prevRound !== null && round > prevRound) {
				toasts?.push('milestone', `Round ${round} begins`);
			}
			if (status === 'running' && activeId && activeId !== prevActiveId && section) {
				const row = section.querySelector(`[data-combatant-id="${activeId}"]`);
				row?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
			}
			prevActiveId = activeId;
			prevRound = round;
			prevStatus = status;
		});
	});

	/** True when the keystroke originated on an interactive element (let it act natively). */
	function fromInteractive(target: EventTarget | null): boolean {
		if (isFromTextEntry(target)) return true;
		return target instanceof Element ? target.closest('button, a, select, [role="menu"]') !== null : false;
	}

	// UX-SES-006 — Space/Enter advance, Shift+Space/Shift+Enter revert when the tracker is focused.
	function onTrackerKeydown(event: KeyboardEvent): void {
		if (!controls.canAdvanceTurn || view.status !== 'running') return;
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (fromInteractive(event.target)) return;
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			if (event.shiftKey) {
				if (canGoPrevious) void previousTurn();
			} else {
				void advanceTurn();
			}
		}
	}

	// UX-SES-006 — global N (next) / P (previous) during an active session, so the DM can drive the
	// turn order without focus gymnastics. Never steals keys from text entry or modified chords.
	function onGlobalKeydown(event: KeyboardEvent): void {
		if (!controls.canAdvanceTurn || view.status !== 'running' || !sessionActive) return;
		if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
		if (isFromTextEntry(event.target)) return;
		const key = event.key.toLowerCase();
		if (key === 'n') {
			event.preventDefault();
			void advanceTurn();
		} else if (key === 'p' && canGoPrevious) {
			event.preventDefault();
			void previousTurn();
		}
	}

	function toggleConditions(id: string): void {
		if (expandedConditions.has(id)) expandedConditions.delete(id);
		else expandedConditions.add(id);
	}

	const MAX_INLINE_CONDITIONS = 3;
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<!-- The tracker section is intentionally focusable so the Space/Enter hot keys work without
     focusing a specific control (UX-SES-006); the shortcut contract is described to AT via
     aria-describedby. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
	bind:this={sectionEl}
	data-testid="combat-tracker"
	aria-label="Combat tracker"
	aria-describedby={shortcutsHintId}
	tabindex="0"
	onkeydown={onTrackerKeydown}
>
	<h2>Combat</h2>
	<p id={shortcutsHintId} class="visually-hidden">
		Keyboard shortcuts while the tracker is focused: Space or Enter advances to the next turn;
		Shift plus Space returns to the previous turn. During an active session, N advances and P
		returns from anywhere.
	</p>

	{#if error}
		<p class="error" role="alert" data-testid="combat-error">{error}</p>
	{/if}

	{#if !sessionActive}
		<!-- UX-SES-001 — session-state-gated tool: inline message + direct Command Center link. -->
		<SessionStateGate workflow={runtime.state.session.workflow} testid="combat-needs-active-session" />
	{/if}

	{#if isDm && view.status !== 'running'}
		<form
			class="start-combat"
			data-testid="start-combat-form"
			onsubmit={(event) => {
				event.preventDefault();
				void startFromEncounter();
			}}
		>
			<label for="start-encounter">Run encounter</label>
			<select id="start-encounter" data-testid="start-encounter-select" bind:value={startEncounterId}>
				<option value="">Select an encounter…</option>
				{#each encounters as encounter (encounter.id)}
					<option value={encounter.id}>{encounter.title} ({encounter.challenge.difficulty})</option>
				{/each}
			</select>
			<button type="submit" data-testid="start-combat" disabled={!sessionActive}>Roll initiative</button>
		</form>
	{/if}

	<!-- UX-SES-006 — the spatially stable tracker header strip: Prev | Round | Next (+ Pause / End).
	     Sticky at the top of the tracker, always visible without scrolling. Players see only the
	     round counter (the advance controls are absent for them — UX-SES-016 / COLLAB-006). -->
	{#if view.status === 'running' || (isDm && sessionActive)}
		<div class="tracker-header" data-testid="combat-header">
			{#if controls.canAdvanceTurn}
				<button
					type="button"
					class="prev-turn"
					data-testid="previous-turn"
					aria-label="Return to previous turn (Shift+Space)"
					aria-keyshortcuts="Shift+Space"
					disabled={!canGoPrevious}
					onclick={() => void previousTurn()}
				>
					◀ Prev
				</button>
			{/if}

			<span class="round-counter" role="status">
				{#if view.status === 'running'}
					<span data-testid="combat-round">Round {view.round}</span>
				{:else if view.status === 'ended'}
					<span data-testid="combat-header-state">Combat ended</span>
				{:else}
					<span data-testid="combat-header-state">No combat</span>
				{/if}
				{#if isDm && view.hiddenCount > 0}
					<span class="meta" data-testid="combat-hidden-count">{view.hiddenCount} hidden</span>
				{/if}
			</span>

			{#if controls.canAdvanceTurn}
				<button
					type="button"
					class="button next-turn"
					data-testid="advance-turn"
					aria-label="Advance to next turn (Space)"
					aria-keyshortcuts="Space"
					aria-busy={advancing}
					disabled={view.status !== 'running'}
					onclick={() => void advanceTurn()}
				>
					▶ Next turn
				</button>
			{/if}
			{#if controls.canEndCombat && view.status === 'running'}
				<button type="button" data-testid="end-combat" onclick={() => void endCombat()}>
					End combat
				</button>
			{/if}
			{#if isDm && sessionActive}
				<!-- UX-SES-001 AC1 — Pause session, visible in the tracker header without scrolling. -->
				<button
					type="button"
					data-testid="combat-pause-session"
					aria-label="Pause session"
					onclick={() => void pauseSession()}
				>
					Pause session
				</button>
			{/if}
		</div>
	{/if}

	{#if view.status === 'running'}
		<!-- UX-SES-003 — scoreboard row anatomy: initiative · name · HP · AC · condition chips.
		     UX-SES-004 — the current-turn row carries ≥3 visual dimensions (left border, elevated
		     background, bold name + larger HP) plus the "▶ Active" chip and aria-current. -->
		<ol class="initiative-order" data-testid="initiative-order" aria-label="Initiative order">
			{#each orderedRows as combatant (combatant.id)}
				<li
					data-testid="combatant-{combatant.id}"
					data-combatant-id={combatant.id}
					class:active={combatant.isActive}
					class:defeated={combatant.isDefeated}
					class:redacted={combatant.redacted}
					aria-current={combatant.isActive ? 'true' : undefined}
				>
					<span class="initiative" data-testid="combatant-initiative">
						{combatant.statBlock.initiative ?? '—'}
					</span>
					<span class="name" data-testid="combatant-name">{combatant.name}</span>
					{#if combatant.isActive}<span class="badge" data-testid="active-badge">▶ Active</span>{/if}
					{#if combatant.isBloodied}<span class="badge bloodied" data-testid="bloodied-badge">Bloodied</span>{/if}
					{#if combatant.isConcentrating}<span class="badge concentrating" data-testid="concentrating-badge">Concentrating</span>{/if}
					{#if combatant.isDefeated}<span class="badge defeated" data-testid="defeated-badge">Defeated</span>{/if}
					{#if combatant.resources}
						<span class="hp" data-testid="combatant-hp">
							HP <span class="hp-current">{combatant.resources.hp}</span><span class="hp-max">/{combatant.resources.maxHp}</span>
							{#if combatant.resources.tempHp > 0}(+{combatant.resources.tempHp}){/if}
						</span>
						{#if combatant.statBlock.ac !== null}
							<span class="ac">AC {combatant.statBlock.ac}</span>
						{/if}
						{#if combatant.resources.conditions.length > 0}
							{@const conditions = combatant.resources.conditions}
							{@const expanded = expandedConditions.has(combatant.id)}
							{@const shown = expanded ? conditions : conditions.slice(0, MAX_INLINE_CONDITIONS)}
							<span
								class="conditions"
								data-testid="combatant-conditions"
								role="list"
								aria-label="Conditions for {combatant.name}"
							>
								{#each shown as condition (condition)}
									<span class="chip" role="listitem">{condition}</span>
								{/each}
								{#if conditions.length > MAX_INLINE_CONDITIONS}
									<button
										type="button"
										class="chip chip-more"
										data-testid="conditions-more-{combatant.id}"
										aria-expanded={expanded}
										onclick={() => toggleConditions(combatant.id)}
									>
										{expanded ? 'Show fewer' : `+${conditions.length - MAX_INLINE_CONDITIONS} more`}
									</button>
								{/if}
							</span>
						{/if}

						{#if editableCombatantIds.has(combatant.id)}
							<div class="combatant-controls">
								<input
									type="number"
									aria-label="HP change for {combatant.name}"
									data-testid="hp-input-{combatant.id}"
									bind:value={hpDelta[combatant.id]}
								/>
								<button
									type="button"
									data-testid="apply-hp-{combatant.id}"
									onclick={() => void applyHp(combatant.id)}
								>
									Apply HP
								</button>
								<input
									type="text"
									aria-label="Condition for {combatant.name}"
									placeholder="condition"
									data-testid="condition-input-{combatant.id}"
									bind:value={conditionName[combatant.id]}
								/>
								<button
									type="button"
									data-testid="add-condition-{combatant.id}"
									onclick={() => void addCondition(combatant.id)}
								>
									Add condition
								</button>
								<button
									type="button"
									data-testid="death-save-success-{combatant.id}"
									onclick={() => void deathSave(combatant.id, 'success')}
								>
									Save ✓
								</button>
								<button
									type="button"
									data-testid="death-save-failure-{combatant.id}"
									onclick={() => void deathSave(combatant.id, 'failure')}
								>
									Save ✗
								</button>
							</div>
						{/if}
					{:else}
						<!-- A redacted placeholder row: identity withheld by the core; stat cells show
						     em-dashes so the row keeps its anatomy without leaking (UX-SES-003). -->
						<span class="hp" data-testid="combatant-hidden">HP — / —</span>
						<span class="ac">AC —</span>
					{/if}
				</li>
			{/each}
		</ol>

		<section class="encounter-log" data-testid="encounter-log" aria-label="Encounter log">
			<h3>Encounter log</h3>
			<ol>
				{#each view.log as entry (entry.id)}
					<li data-testid="log-entry">
						<span class="round">R{entry.round}</span> {entry.label}
					</li>
				{/each}
			</ol>
		</section>
	{:else if view.status === 'ended'}
		<p class="meta" data-testid="combat-ended">Combat has ended. The encounter log is preserved.</p>
		<section class="encounter-log" data-testid="encounter-log" aria-label="Encounter log">
			<h3>Encounter log</h3>
			<ol>
				{#each view.log as entry (entry.id)}
					<li data-testid="log-entry"><span class="round">R{entry.round}</span> {entry.label}</li>
				{/each}
			</ol>
		</section>
	{:else if !isDm}
		<p class="meta" data-testid="combat-idle">No combat is running.</p>
	{/if}
</section>

<style>
	.error {
		color: var(--color-danger, #b00020);
	}
	.meta {
		color: var(--color-text-muted, #666);
	}

	/* UX-SES-006 — the spatially stable header strip: sticky, never scrolls out of view. */
	.tracker-header {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		min-height: 56px;
		padding: var(--space-2);
		margin-bottom: var(--space-2);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.round-counter {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-2);
		font-size: var(--text-lg, 1.125rem);
		font-weight: 700;
		margin-right: auto;
	}

	/* UX-SES-006 — Next turn is the primary hot-path CTA: ≥44 px tall, ≥80 px wide on touch. */
	.next-turn {
		min-height: 44px;
		min-width: 120px;
		font-weight: 700;
	}

	.prev-turn {
		min-height: 44px;
		min-width: 80px;
	}

	:global(.app-shell[data-viewport='medium']) .tracker-header {
		min-height: 60px;
	}
	:global(.app-shell[data-viewport='compact']) .tracker-header {
		min-height: 64px;
	}
	:global(.app-shell[data-viewport='medium']) .next-turn {
		min-width: 80px;
	}
	:global(.app-shell[data-viewport='compact']) .next-turn {
		flex: 1 1 auto;
	}

	.initiative-order {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
	}

	/* UX-SES-003 — scoreboard rows: ≥52 px Desktop, 60 px Tablet, 64 px Mobile. */
	.initiative-order li {
		border: 1px solid var(--color-border, #ddd);
		border-left: 4px solid transparent;
		border-radius: var(--radius-2, 0.5rem);
		padding: var(--space-2, 0.5rem);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		align-items: center;
		min-height: 52px;
	}
	:global(.app-shell[data-viewport='medium']) .initiative-order li {
		min-height: 60px;
	}
	:global(.app-shell[data-viewport='compact']) .initiative-order li {
		min-height: 64px;
	}

	.initiative {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.5rem;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		color: var(--color-text-secondary, #888);
	}

	.name {
		font-size: var(--text-md, 1rem);
	}

	.hp {
		font-variant-numeric: tabular-nums;
	}
	.hp-current {
		font-size: var(--text-lg, 1.125rem);
		font-weight: 700;
	}
	.hp-max {
		color: var(--color-text-muted, #666);
	}

	/* UX-SES-004 — current-turn emphasis: ≥3 simultaneous dimensions (4 px live left border,
	   elevated background, bold name + larger HP) + the "▶ Active" chip + aria-current. */
	.initiative-order li.active {
		border-color: var(--color-accent, #3b82f6);
		border-left: 4px solid var(--color-status-success);
		background: var(--color-surface-raised, #f5f8ff);
	}
	.initiative-order li.active .name {
		font-weight: 700;
	}
	.initiative-order li.active .hp-current {
		font-size: var(--text-xl, 1.25rem);
	}
	:global(.app-shell[data-viewport='compact']) .initiative-order li.active {
		border-left-width: 3px;
	}

	/* UX-SES-003 AC3 — defeated treatment: strikethrough + 50% opacity (and the row is sorted below
	   all non-defeated rows in the markup). */
	.initiative-order li.defeated {
		opacity: 0.5;
	}
	.initiative-order li.defeated .name {
		text-decoration: line-through;
	}

	.badge {
		font-size: 0.75rem;
		background: var(--color-accent, #3b82f6);
		color: #fff;
		border-radius: var(--radius-1, 0.25rem);
		padding: 0 var(--space-1, 0.25rem);
	}
	/* A11Y-007 AC2: bloodied badge has a distinct shape+text so the state is never color-only. */
	.badge.bloodied {
		background: var(--color-danger, #b00020);
	}
	/* A11Y-011 AC2: concentrating and defeated badges convey state by distinct text labels +
	   shape, so the states are never communicated by color alone. */
	.badge.concentrating {
		background: var(--accent, #2f6f73);
	}
	.badge.defeated {
		background: var(--muted, #5f6670);
	}
	/* A11Y-011 AC1: preserve badge borders + contrast in forced-colors / Windows High Contrast.
	   forced-color-adjust:none keeps our background/foreground pair; the explicit border ensures
	   the badge shape is still visible when the UA overrides arbitrary backgrounds. */
	@media (forced-colors: active) {
		.badge {
			forced-color-adjust: none;
			border: 1px solid ButtonText;
		}
		.badge.bloodied {
			background: Mark;
			color: MarkText;
		}
		.badge.concentrating {
			background: Highlight;
			color: HighlightText;
		}
		.badge.defeated {
			background: ButtonText;
			color: ButtonFace;
		}
		.initiative-order li.active {
			outline: 2px solid Highlight;
		}
	}

	/* UX-SES-003 / UX-SES-007 — text-label condition chips (never icon-only). */
	.conditions {
		display: inline-flex;
		flex-wrap: wrap;
		gap: var(--space-1, 0.25rem);
	}
	.chip {
		font-size: 0.75rem;
		padding: 0 var(--space-1, 0.25rem);
		border: 1px solid var(--color-status-warning);
		border-radius: var(--radius-full, 999px);
		background: var(--color-status-warning-subtle);
		color: var(--color-status-warning-text);
	}
	.chip-more {
		cursor: pointer;
	}

	.combatant-controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1, 0.25rem);
		width: 100%;
	}
	.combatant-controls input[type='number'] {
		width: 4rem;
	}
</style>
