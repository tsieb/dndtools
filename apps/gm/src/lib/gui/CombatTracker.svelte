<script lang="ts" module>
	let trackerSeq = 0;
	function nextTrackerId(): string {
		trackerSeq += 1;
		return `combat-tracker-${trackerSeq}`;
	}

	/** UX-SES-007 — the 5e standard condition list offered by the add-condition datalist. */
	const STANDARD_CONDITIONS = [
		'Blinded',
		'Charmed',
		'Deafened',
		'Frightened',
		'Grappled',
		'Incapacitated',
		'Invisible',
		'Paralyzed',
		'Petrified',
		'Poisoned',
		'Prone',
		'Restrained',
		'Stunned',
		'Unconscious',
	] as const;
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
	import HpStepper from '$lib/gui/ux-ses/HpStepper.svelte';
	import AddCombatantsPanel from '$lib/gui/ux-ses/AddCombatantsPanel.svelte';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';

	// SES-002 / COLLAB-006: run combat. The DM rolls initiative, advances turns (wrapping to the next
	// round), applies per-combatant HP / conditions / death saves / concentration, and ends combat
	// (persisting the encounter log). Participants see the SHARED combat view ACCORDING TO ROLE AND GRANTS
	// (COLLAB-006): a hidden combatant's identity + stat data never reach them (the core decides visibility
	// before render), and the PERMITTED CONTROLS are role/grant-gated, fail closed (`controls`). Every
	// change dispatches a durable command; the GUI renders the computed model and never writes state
	// directly (Contract 1). The core re-enforces session-active gating + DM/combat-participant authority.
	//
	// UX-SES-003/004/006 — the HOT-PATH COMBAT SHELL on top of that read model: a sticky header strip
	// (Prev / Round / Next / Add / Pause), scoreboard row anatomy (initiative · name · HP · AC · condition
	// chips), an unmistakable current-turn treatment (≥3 visual dimensions + aria-current), defeated
	// rows sorted below the living, and 1-keypress turn advance (Space / Shift+Space; N / P globally).
	//
	// UX-SES-005 — tap-to-edit HP: the HP number opens an INLINE STEPPER (≤2 actions, no context menu);
	// the typed value is the absolute target, clamped into [0, max]; at 0 the "Mark as defeated?"
	// confirmation offers "Yes — defeated" / "No — keep at 0" (dying → death saves, UX-SES-007 AC3).
	// UX-SES-007 — text-label condition chips (tap to remove when authorized), the Concentrating chip,
	// the concentration-check toast (DC = max(10, ⌊damage/2⌋)) on damage, and the death-save track.
	// UX-SES-008 — mid-combat add (mass + secret via the Add panel), explicit reorder (buttons +
	// Ctrl+Up/Ctrl+Down), hide/unhide toggle, and remove behind a confirmation dialog.
	// UX-SES-016 — the SAME component renders the player tracker: actor-filtered rows, no DM controls,
	// HP editing only for `combat-participant` rows, and placeholder-only hidden combatants.
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
	let conditionName = $state<Record<string, string>>({});
	let concentrationName = $state<Record<string, string>>({});
	// UX-SES-006 — pending state for the hot-path buttons (≤100 ms spinner per UX-SES-017).
	let advancing = $state(false);
	// UX-SES-003 — per-combatant "+N more" condition-chip expansion (max 3 chips inline).
	const expandedConditions = new SvelteSet<string>();
	// UX-SES-005 — which combatant's inline HP stepper is open (one at a time; tap HP to open).
	let hpEditorFor = $state<string | null>(null);
	// UX-SES-005 — the at-0-HP "Mark as defeated?" inline confirmation (focus lands on the safer "No").
	let defeatConfirmFor = $state<{ id: string; name: string } | null>(null);
	let defeatNoButton = $state<HTMLButtonElement | null>(null);
	// UX-SES-008 — the remove-combatant confirmation dialog (focus lands on Cancel).
	let removeConfirm = $state<{ id: string; name: string } | null>(null);
	let removeDialogOpen = $state(false);
	// UX-SES-008 — the Add-combatant panel.
	let addOpen = $state(false);

	let sectionEl = $state<HTMLElement | null>(null);
	const shortcutsHintId = nextTrackerId();
	const conditionListId = nextTrackerId();

	// UX-SES-005 §a11y — the defeated confirmation focuses "No — keep at 0" as the safer default.
	$effect(() => {
		if (defeatConfirmFor) defeatNoButton?.focus();
	});

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

	// UX-SES-005 — confirm the inline HP stepper. The typed value is the ABSOLUTE target HP, clamped
	// into [0, max] (clamping to max raises the "Healed to maximum" toast). The dispatched command is
	// the hp DELTA so the core's temp-HP-first damage rule applies unchanged.
	// UX-SES-017 AC1/AC2 — every HP change raises an 8-second undo toast ("[Name] HP: 30 → 18.
	// Undo?") dispatching the core's INVERSE command. Names/values come from the actor-filtered view.
	// UX-SES-007 AC2 — damaging a CONCENTRATING combatant raises the "Concentration check!" toast
	// with the DC prominent (DC = max(10, ⌊damage/2⌋)).
	async function confirmHp(combatantId: string, target: number): Promise<void> {
		hpEditorFor = null;
		const row = view.combatants.find((candidate) => candidate.id === combatantId);
		if (!row?.resources) return;
		const maxHp = row.resources.maxHp;
		const requested = Math.trunc(target);
		if (!Number.isFinite(requested)) {
			error = 'Invalid HP value.';
			return;
		}
		const clamped = Math.min(maxHp, Math.max(0, requested));
		const overheal = requested > maxHp;
		const oldHp = row.resources.hp;
		const delta = clamped - oldHp;
		if (delta === 0) {
			if (overheal) toasts?.push('milestone', 'Healed to maximum');
			return;
		}
		const name = row.name;
		const wasConcentrating = row.isConcentrating;
		const ok = await dispatch({
			type: 'combat.apply-resource',
			actorId: runtime.activeActorId,
			payload: { combatantId, kind: 'hp', delta },
		});
		if (!ok) return;
		if (overheal) toasts?.push('milestone', 'Healed to maximum');
		const after = view.combatants.find((candidate) => candidate.id === combatantId);
		const newHp = after?.resources?.hp ?? null;
		if (newHp === null || newHp === oldHp) return;
		announcer?.announce(`${name} HP updated to ${newHp}.`, 'polite');
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
		if (wasConcentrating && delta < 0) {
			const dc = Math.max(10, Math.floor(Math.abs(delta) / 2));
			toasts?.push('warning', `Concentration check! DC ${dc} for ${name}.`);
		}
		// UX-SES-005 §spec — at 0 the defeated confirmation appears ("No" is the focused default).
		if (newHp === 0) defeatConfirmFor = { id: combatantId, name };
	}

	// UX-SES-005 AC3 — resolve the defeated confirmation through the core's `defeated` resource kind:
	// "Yes" applies the defeated treatment (and the row sinks below the living); "No" keeps the
	// combatant dying at 0 with the death-save track active (UX-SES-007 AC3).
	async function resolveDefeat(combatantId: string, value: boolean): Promise<void> {
		const name =
			view.combatants.find((row) => row.id === combatantId)?.name ??
			defeatConfirmFor?.name ??
			'Combatant';
		defeatConfirmFor = null;
		const ok = await dispatch({
			type: 'combat.apply-resource',
			actorId: runtime.activeActorId,
			payload: { combatantId, kind: 'defeated', value },
		});
		if (ok) {
			announcer?.announce(
				value ? `${name} marked defeated.` : `${name} kept at 0 HP — death saves active.`,
				'polite',
			);
		}
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

	// UX-SES-007 — tap a condition chip to remove it (authorized rows only).
	async function removeCondition(combatantId: string, condition: string): Promise<void> {
		const name = view.combatants.find((row) => row.id === combatantId)?.name ?? 'Combatant';
		const ok = await dispatch({
			type: 'combat.apply-resource',
			actorId: runtime.activeActorId,
			payload: { combatantId, kind: 'condition', condition, present: false },
		});
		if (ok) announcer?.announce(`${condition} removed from ${name}.`, 'polite');
	}

	// UX-SES-007 — set / drop concentration. The Concentrating chip renders first in the chip list;
	// damage while concentrating raises the DC toast (see confirmHp).
	async function setConcentration(combatantId: string): Promise<void> {
		const effect = (concentrationName[combatantId] ?? '').trim();
		if (!effect) {
			error = 'Enter the spell or effect being concentrated on.';
			return;
		}
		const ok = await dispatch({
			type: 'combat.apply-resource',
			actorId: runtime.activeActorId,
			payload: { combatantId, kind: 'concentration', effect },
		});
		if (ok) concentrationName = { ...concentrationName, [combatantId]: '' };
	}

	async function dropConcentration(combatantId: string): Promise<void> {
		await dispatch({
			type: 'combat.apply-resource',
			actorId: runtime.activeActorId,
			payload: { combatantId, kind: 'concentration', effect: null },
		});
	}

	async function deathSave(combatantId: string, outcome: 'success' | 'failure'): Promise<void> {
		await dispatch({
			type: 'combat.apply-resource',
			actorId: runtime.activeActorId,
			payload: { combatantId, kind: 'death-save', outcome },
		});
	}

	// UX-SES-008 — explicit reorder (the keyboard/touch-accessible alternative to drag): move one
	// position earlier/later; the move is announced with the combatant's NEW position.
	async function moveCombatant(combatantId: string, direction: 'earlier' | 'later'): Promise<void> {
		const name = view.combatants.find((row) => row.id === combatantId)?.name ?? 'Combatant';
		const ok = await dispatch({
			type: 'combat.reorder-combatant',
			actorId: runtime.activeActorId,
			payload: { combatantId, direction },
		});
		if (!ok) return;
		const position = view.combatants.findIndex((row) => row.id === combatantId) + 1;
		announcer?.announce(`${name} moved to position ${position}.`, 'polite');
	}

	// UX-SES-008 — hide/unhide mid-combat. Hiding fails closed to the "Unknown creature" placeholder
	// in the core, so the player tracker IMMEDIATELY shows a placeholder row, never the identity.
	async function toggleHidden(combatantId: string): Promise<void> {
		const row = view.combatants.find((candidate) => candidate.id === combatantId);
		if (!row) return;
		const hidden = !row.hidden;
		const ok = await dispatch({
			type: 'combat.set-combatant-visibility',
			actorId: runtime.activeActorId,
			payload: { combatantId, hidden },
		});
		if (ok) {
			announcer?.announce(
				`${row.name} is now ${hidden ? 'hidden from players' : 'visible to players'}.`,
				'polite',
			);
		}
	}

	// UX-SES-008 AC3 — removing a combatant requires ONE confirmation (the dialog below).
	function requestRemove(combatantId: string, name: string): void {
		removeConfirm = { id: combatantId, name };
		removeDialogOpen = true;
	}

	async function confirmRemove(): Promise<void> {
		if (!removeConfirm) return;
		const { id, name } = removeConfirm;
		removeDialogOpen = false;
		removeConfirm = null;
		const ok = await dispatch({
			type: 'combat.remove-combatant',
			actorId: runtime.activeActorId,
			payload: { combatantId: id },
		});
		if (ok) {
			toasts?.push('milestone', `${name} removed from combat.`);
			announcer?.announce(`${name} removed from combat.`, 'polite');
		}
	}

	// UX-SES-004 AC2 / UX-SES-006 AC1+AC4 — react to turn/round changes from the actor-filtered view
	// (regardless of which client dispatched): announce the new active combatant via the shared live
	// region (a redacted active combatant announces its placeholder name — UX-SES-004 AC3 /
	// UX-SES-016 AC3), toast "Round N begins" when the round wraps forward, and scroll the new
	// current-turn row into view (reduced motion ⇒ instant). All side effects run untracked so the
	// effect cannot loop (effect_update_depth_exceeded).
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

	// UX-SES-005 — `H` with focus inside a row opens that row's HP editor (keyboard parity with the
	// HP tap). UX-SES-008 — Ctrl+Up / Ctrl+Down moves the combatant one position (keyboard reorder).
	function onRowKeydown(event: KeyboardEvent, combatantId: string): void {
		if (isFromTextEntry(event.target)) return;
		if ((event.key === 'h' || event.key === 'H') && !event.ctrlKey && !event.metaKey && !event.altKey) {
			if (!editableCombatantIds.has(combatantId)) return;
			event.preventDefault();
			hpEditorFor = combatantId;
			return;
		}
		if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && event.ctrlKey && !event.metaKey && !event.altKey) {
			if (!controls.canEditAnyCombatant) return;
			event.preventDefault();
			void moveCombatant(combatantId, event.key === 'ArrowUp' ? 'earlier' : 'later');
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
		returns from anywhere. With focus inside a combatant row, H edits its HP and Control plus the
		up or down arrow moves it in the initiative order.
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

	<!-- UX-SES-006 — the spatially stable tracker header strip: Prev | Round | Next (+ Add / Pause /
	     End). Sticky at the top of the tracker, always visible without scrolling. Players see only the
	     round counter (the advance/management controls are absent — UX-SES-016 / COLLAB-006). -->
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
			{#if controls.canEditAnyCombatant && view.status === 'running'}
				<!-- UX-SES-008 — "Add +" lives in the tracker header (DM-only; players never see it). -->
				<button
					type="button"
					data-testid="add-combatant-open"
					aria-label="Add combatant"
					onclick={() => (addOpen = true)}
				>
					Add +
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
		     background, bold name + larger HP) plus the "▶ Active" chip and aria-current.
		     UX-SES-016 — the player view renders the SAME anatomy from the actor-filtered model, with
		     a distinct accessible label and read-only cells everywhere the viewer lacks authority. -->
		<ol
			class="initiative-order"
			data-testid="initiative-order"
			aria-label={isDm ? 'Initiative order' : 'Initiative order (player view)'}
		>
			{#each orderedRows as combatant, rowIndex (combatant.id)}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<li
					data-testid="combatant-{combatant.id}"
					data-combatant-id={combatant.id}
					class:active={combatant.isActive}
					class:defeated={combatant.isDefeated}
					class:redacted={combatant.redacted}
					aria-current={combatant.isActive ? 'true' : undefined}
					aria-label={combatant.redacted
						? `${combatant.name}, turn position ${rowIndex + 1}`
						: undefined}
					onkeydown={(event) => onRowKeydown(event, combatant.id)}
				>
					<span class="initiative" data-testid="combatant-initiative">
						{combatant.statBlock.initiative ?? '—'}
					</span>
					<span class="name" data-testid="combatant-name">{combatant.name}</span>
					{#if combatant.isActive}<span class="badge" data-testid="active-badge">▶ Active</span>{/if}
					{#if combatant.isBloodied}<span class="badge bloodied" data-testid="bloodied-badge">Bloodied</span>{/if}
					{#if combatant.isConcentrating}<span class="badge concentrating" data-testid="concentrating-badge">Concentrating</span>{/if}
					{#if combatant.isDefeated}<span class="badge defeated" data-testid="defeated-badge">Defeated</span>{/if}
					{#if isDm && combatant.hidden}
						<!-- UX-SES-003 §states — the DM-view marker for a combatant hidden from players. -->
						<span class="badge hidden-marker" data-testid="hidden-badge-{combatant.id}">
							Hidden from players
						</span>
					{/if}
					{#if combatant.resources}
						{@const resources = combatant.resources}
						{#if hpEditorFor === combatant.id}
							<!-- UX-SES-005 — the inline HP stepper, opened in-place (no navigation). -->
							<HpStepper
								combatantId={combatant.id}
								name={combatant.name}
								hp={resources.hp}
								maxHp={resources.maxHp}
								onconfirm={(target) => void confirmHp(combatant.id, target)}
								oncancel={() => (hpEditorFor = null)}
							/>
						{:else if editableCombatantIds.has(combatant.id)}
							<!-- UX-SES-005 AC1 / UX-SES-016 AC1 — the HP number itself is the tap target;
							     it renders ONLY for rows this viewer may edit (DM: every visible row;
							     player: their combat-participant character). -->
							<button
								type="button"
								class="hp-tap"
								data-testid="hp-edit-{combatant.id}"
								aria-label={isDm
									? `Edit HP for ${combatant.name}`
									: `Your HP for ${combatant.name} — tap to edit`}
								onclick={() => (hpEditorFor = combatant.id)}
							>
								<span class="hp" data-testid="combatant-hp">
									HP <span class="hp-current">{resources.hp}</span><span class="hp-max">/{resources.maxHp}</span>
									{#if resources.tempHp > 0}(+{resources.tempHp}){/if}
								</span>
							</button>
						{:else}
							<!-- Read-only HP cell: not interactive at all for unauthorized viewers. -->
							<span class="hp" data-testid="combatant-hp">
								HP <span class="hp-current">{resources.hp}</span><span class="hp-max">/{resources.maxHp}</span>
								{#if resources.tempHp > 0}(+{resources.tempHp}){/if}
							</span>
						{/if}
						{#if combatant.statBlock.ac !== null}
							<span class="ac">AC {combatant.statBlock.ac}</span>
						{/if}
						{#if resources.conditions.length > 0}
							{@const conditions = resources.conditions}
							{@const expanded = expandedConditions.has(combatant.id)}
							{@const shown = expanded ? conditions : conditions.slice(0, MAX_INLINE_CONDITIONS)}
							<span
								class="conditions"
								data-testid="combatant-conditions"
								role="list"
								aria-label="Conditions for {combatant.name}"
							>
								{#each shown as condition (condition)}
									{#if editableCombatantIds.has(combatant.id)}
										<!-- UX-SES-007 — tap a chip to remove the condition (authorized only). -->
										<span role="listitem">
											<button
												type="button"
												class="chip chip-remove"
												data-testid="remove-condition-{combatant.id}-{condition}"
												aria-label="{condition} — press to remove"
												onclick={() => void removeCondition(combatant.id, condition)}
											>
												{condition} ✕
											</button>
										</span>
									{:else}
										<span class="chip" role="listitem">{condition}</span>
									{/if}
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

						{#if defeatConfirmFor?.id === combatant.id}
							<!-- UX-SES-005 §spec — the at-0 confirmation; focus starts on the safer "No". -->
							<div
								class="defeat-confirm"
								role="alertdialog"
								aria-label="Mark {combatant.name} as defeated?"
								data-testid="defeat-confirm-{combatant.id}"
							>
								<span>Mark {combatant.name} as defeated?</span>
								<button
									type="button"
									data-testid="defeat-yes-{combatant.id}"
									onclick={() => void resolveDefeat(combatant.id, true)}
								>
									Yes — defeated
								</button>
								<button
									type="button"
									bind:this={defeatNoButton}
									data-testid="defeat-no-{combatant.id}"
									onclick={() => void resolveDefeat(combatant.id, false)}
								>
									No — keep at 0
								</button>
							</div>
						{/if}

						{#if combatant.isDying}
							<!-- UX-SES-007 AC3 — death saves render ONLY at 0 HP with "not defeated"
							     chosen: three failure and three success checkboxes, tappable in order. -->
							<div
								class="death-saves"
								data-testid="death-saves-{combatant.id}"
								role="group"
								aria-label="Death saves for {combatant.name}"
							>
								<span class="ds-label">Death saves</span>
								<span class="ds-set">
									{#each [1, 2, 3] as slot (slot)}
										{@const checked = resources.deathSaves.failures >= slot}
										<button
											type="button"
											class="ds-box failure"
											role="checkbox"
											aria-checked={checked}
											aria-label="Death save failure {slot} for {combatant.name}"
											data-testid="death-save-failure-box-{combatant.id}-{slot}"
											disabled={checked || !editableCombatantIds.has(combatant.id)}
											onclick={() => void deathSave(combatant.id, 'failure')}
										>
											{checked ? '☑' : '☐'}
										</button>
									{/each}
									<span class="ds-set-label">failures</span>
								</span>
								<span class="ds-set">
									{#each [1, 2, 3] as slot (slot)}
										{@const checked = resources.deathSaves.successes >= slot}
										<button
											type="button"
											class="ds-box success"
											role="checkbox"
											aria-checked={checked}
											aria-label="Death save success {slot} for {combatant.name}"
											data-testid="death-save-success-box-{combatant.id}-{slot}"
											disabled={checked || !editableCombatantIds.has(combatant.id)}
											onclick={() => void deathSave(combatant.id, 'success')}
										>
											{checked ? '☑' : '☐'}
										</button>
									{/each}
									<span class="ds-set-label">successes</span>
								</span>
								{#if editableCombatantIds.has(combatant.id)}
									<!-- UX-SES-005/007 — resolve the dying state explicitly (e.g. after the
									     third failed save): applies the defeated treatment via the same
									     `defeated` resource command as the at-0 confirmation. -->
									<button
										type="button"
										data-testid="mark-defeated-{combatant.id}"
										onclick={() => void resolveDefeat(combatant.id, true)}
									>
										Mark defeated
									</button>
								{/if}
							</div>
						{/if}

						{#if editableCombatantIds.has(combatant.id)}
							<div class="combatant-controls">
								<input
									type="text"
									list={conditionListId}
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
								<input
									type="text"
									aria-label="Concentration effect for {combatant.name}"
									placeholder="concentrating on…"
									data-testid="concentration-input-{combatant.id}"
									bind:value={concentrationName[combatant.id]}
								/>
								{#if combatant.isConcentrating}
									<button
										type="button"
										data-testid="drop-concentration-{combatant.id}"
										onclick={() => void dropConcentration(combatant.id)}
									>
										Drop concentration
									</button>
								{:else}
									<button
										type="button"
										data-testid="set-concentration-{combatant.id}"
										onclick={() => void setConcentration(combatant.id)}
									>
										Concentrate
									</button>
								{/if}
							</div>
						{/if}
					{:else}
						<!-- A redacted placeholder row: identity withheld by the core; stat cells show
						     em-dashes so the row keeps its anatomy without leaking (UX-SES-003 /
						     UX-SES-016 — fully read-only, no menu, no edit affordance). -->
						<span class="hp" data-testid="combatant-hidden">HP — / —</span>
						<span class="ac">AC —</span>
					{/if}

					{#if controls.canEditAnyCombatant}
						<!-- UX-SES-008 — DM-only row management: explicit reorder, hide/unhide, remove
						     (confirmed). Never rendered for players/observers (UX-SES-016). -->
						<div class="row-manage">
							<button
								type="button"
								data-testid="move-earlier-{combatant.id}"
								aria-label="Move {combatant.name} earlier in initiative (Ctrl+Up)"
								onclick={() => void moveCombatant(combatant.id, 'earlier')}
							>
								▲
							</button>
							<button
								type="button"
								data-testid="move-later-{combatant.id}"
								aria-label="Move {combatant.name} later in initiative (Ctrl+Down)"
								onclick={() => void moveCombatant(combatant.id, 'later')}
							>
								▼
							</button>
							<button
								type="button"
								data-testid="toggle-hidden-{combatant.id}"
								aria-label="{combatant.hidden ? 'Reveal' : 'Hide'} {combatant.name}"
								onclick={() => void toggleHidden(combatant.id)}
							>
								{combatant.hidden ? 'Unhide' : 'Hide'}
							</button>
							<button
								type="button"
								data-testid="remove-from-combat-{combatant.id}"
								aria-label="Remove {combatant.name} from combat"
								onclick={() => requestRemove(combatant.id, combatant.name)}
							>
								Remove
							</button>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
		<!-- UX-SES-007 — the 5e standard conditions offered while typing (custom names still allowed). -->
		<datalist id={conditionListId}>
			{#each STANDARD_CONDITIONS as condition (condition)}
				<option value={condition}></option>
			{/each}
		</datalist>

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

{#if controls.canEditAnyCombatant}
	<!-- UX-SES-008 — the Add-combatant dialog (vault character + quick-add mass/secret). DM-only. -->
	<AddCombatantsPanel bind:open={addOpen} />
{/if}

<!-- UX-SES-008 AC3 — the remove confirmation: one explicit step, focus starts on Cancel. -->
<Dialog
	bind:open={removeDialogOpen}
	title="Remove combatant"
	role="alertdialog"
	closeOnBackdrop={false}
	testid="remove-combatant-confirm"
	onclose={() => (removeConfirm = null)}
>
	<p data-testid="remove-combatant-message">
		Remove {removeConfirm?.name} from this combat? They can be re-added.
	</p>
	<div class="confirm-actions">
		<button
			type="button"
			data-testid="remove-combatant-cancel"
			onclick={() => {
				removeDialogOpen = false;
				removeConfirm = null;
			}}
		>
			Cancel
		</button>
		<button
			type="button"
			class="button"
			data-testid="remove-combatant-accept"
			onclick={() => void confirmRemove()}
		>
			Remove
		</button>
	</div>
</Dialog>

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

	/* UX-SES-005 — the HP number IS the tap target (≥44 px); visually it reads as the HP cell with
	   an affordance underline, not a heavy button. */
	.hp-tap {
		background: none;
		border: none;
		padding: var(--space-1) var(--space-2);
		min-height: 44px;
		cursor: pointer;
		border-radius: var(--radius-1, 0.25rem);
	}
	.hp-tap .hp {
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}
	.hp-tap:hover,
	.hp-tap:focus-visible {
		background: var(--color-surface-raised);
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
	/* UX-SES-003 §states — the DM-only "Hidden from players" marker uses the DM-only token set. */
	.badge.hidden-marker {
		background: var(--color-dm-only-subtle);
		color: var(--color-dm-only-badge);
		border: 1px solid var(--color-dm-only-badge);
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
	.chip-more,
	.chip-remove {
		cursor: pointer;
	}

	/* UX-SES-005 §spec — the inline defeated confirmation below the row content. */
	.defeat-confirm {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2);
		border: 1px solid var(--color-status-warning);
		border-radius: var(--radius-md);
		background: var(--color-status-warning-subtle);
	}

	/* UX-SES-007 AC3 — the death-save track: 3 failures (red) + 3 successes (green), non-color
	   reinforced by the ☐/☑ glyphs + the set labels. */
	.death-saves {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
	}
	.ds-label,
	.ds-set-label {
		font-size: var(--text-xs, 0.75rem);
		color: var(--color-text-muted);
	}
	.ds-set {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.ds-box {
		min-width: 44px;
		min-height: 44px;
	}
	.ds-box.failure {
		color: var(--color-danger, #b00020);
	}
	.ds-box.success {
		color: var(--color-status-success);
	}

	.combatant-controls,
	.row-manage {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1, 0.25rem);
		width: 100%;
	}

	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
</style>
