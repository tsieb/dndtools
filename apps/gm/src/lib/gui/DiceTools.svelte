<script lang="ts">
	import {
		applyAdvantageToExpression,
		getContentItemsForActor,
		getDiceHistoryForActor,
		VAULT_OBJECT_SUBTYPE_KEY,
		type DiceAdvantageMode,
		type DiceRollView,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';
	import { useSessionToasts } from '$lib/gui/ux-ses/session-toasts.svelte';
	import Disclosure from '$lib/gui/a11y/Disclosure.svelte';
	import SessionStateGate from '$lib/gui/ux-ses/SessionStateGate.svelte';

	// SES-003 / SES-008: the Session section's DICE + TABLES surface. A participant rolls dice
	// expressions / macros / inline rolls through the shared `dice.roll` command; the DM draws rollable
	// `dice-table` Vault Objects and may append a recorded result to a note. The random OUTCOME is
	// computed ONCE in the Processing Core from a recorded seed (reproducible; never re-rolled per device
	// or render — Contract 2), so the rendered history is the same for every participant who may see it.
	// Visibility composes with PERM: a secret/DM-only roll is filtered out of a player's history by the
	// core read model (Contract 3). The GUI only dispatches command intents and renders computed models.
	//
	// UX-SES-010 — expression input is the panel's first tabbable control; advantage/disadvantage is a
	// 3-state radiogroup that rewrites a d20-only expression to 2d20kh1/2d20kl1 semantics via the pure
	// core transform (other expressions roll unchanged with an inline clarification); the tables section
	// is a DM-only collapsed disclosure; the history renders newest-first, capped at 100 visible entries.
	// UX-SES-011 — each history entry shows actor · expression → total · dice values · label · the
	// "DM only" / "Shared" visibility badge; a table draw shows the table name + drawn row text inline.
	// The player-side no-leak guarantee is the core read model's (a dm-only roll is OMITTED entirely).
	//
	// UX-SES-001 — the panel is session-state gated: when the session is not active, an inline
	// `role="status"` message names the state and links to the Command Center (never a modal).
	// UX-SES-017 AC3 — a FAILED roll raises an actionable error toast whose Retry re-dispatches the
	// SAME command.
	const runtime = useRuntime();
	const announcer = useLiveAnnouncer();
	const toasts = useSessionToasts();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const sessionActive = $derived(runtime.state.session.workflow === 'active');

	const history = $derived(
		getDiceHistoryForActor(runtime.state.session, runtime.state.permissions, runtime.activeActorId),
	);
	// UX-SES-010 AC4 — newest-first, max 100 visible entries (older entries stay in the durable
	// history; the visible window scrolls).
	const visibleRolls = $derived(history.rolls.slice(-100).reverse());
	// UX-SES-011 — the DM-only hidden-count line: how many of the session's rolls are private
	// (dm-only). Derived from the DM's OWN filtered view; players never receive this surface.
	const dmHiddenRollCount = $derived(
		history.rolls.filter((roll) => roll.visibility === 'dm-only').length,
	);

	// The actor-visible content items, split into rollable tables and append-target notes.
	const items = $derived(
		getContentItemsForActor(runtime.state.content, runtime.state.permissions, runtime.activeActorId),
	);
	const tables = $derived(
		items.filter((item) => item.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'dice-table'),
	);
	const notes = $derived(items.filter((item) => item.kind === 'note'));

	function actorName(actorId: string): string {
		return runtime.state.permissions.actors[actorId]?.displayName ?? actorId;
	}

	/** Resolve a table draw's table title through the actor-filtered items (no leak: an invisible
	 * table simply resolves to null and the entry shows only the drawn row text). */
	function tableTitle(tableItemId: string | null): string | null {
		if (!tableItemId) return null;
		return items.find((item) => item.id === tableItemId)?.title ?? null;
	}

	/** UX-SES-011 — every rolled die value for the entry, in roll order, with DROPPED dice (a keep
	 * policy, e.g. advantage) wrapped in parentheses: `2d20kh1` → "18, (9)". Falls back to the
	 * recorded kept-dice list for legacy records without evaluated terms. */
	function diceValuesText(roll: DiceRollView): string {
		const values: string[] = [];
		for (const term of roll.terms) {
			if (term.kind !== 'dice') continue;
			for (const die of term.dice) values.push(die.kept ? String(die.value) : `(${die.value})`);
		}
		if (values.length === 0 && roll.dice.length > 0) return roll.dice.join(', ');
		return values.join(', ');
	}

	/** UX-SES-011 — the entry's accessible name: actor, expression, total, label, privacy. */
	function entryAriaLabel(roll: DiceRollView): string {
		const label = roll.label ? `, ${roll.label}` : '';
		const privacy =
			roll.visibility === 'dm-only'
				? ' (private, DM only)'
				: roll.visibility === 'shared'
					? ' (shared)'
					: '';
		return `${actorName(roll.actorId)}: ${roll.expression} → ${roll.total}${label}${privacy}`;
	}

	let error = $state<string | null>(null);
	let expression = $state('1d20');
	let advMode = $state<DiceAdvantageMode>('normal');
	let visibility = $state<'session-visible' | 'dm-only' | 'shared'>('session-visible');
	let label = $state('');
	let tableId = $state('');
	let appendRollId = $state('');
	let appendNoteId = $state('');
	let tablesOpen = $state(false);

	// UX-SES-010 — the live advantage transform of the CURRENT draft (drives the inline hint).
	const advPreview = $derived(applyAdvantageToExpression(expression.trim(), advMode));
	const advHintVisible = $derived(
		advMode !== 'normal' && expression.trim() !== '' && !advPreview.applied,
	);

	const ADV_OPTIONS: ReadonlyArray<{ mode: DiceAdvantageMode; label: string; glyph: string }> = [
		{ mode: 'disadvantage', label: 'Disadvantage', glyph: '↓' },
		{ mode: 'normal', label: 'Normal', glyph: '—' },
		{ mode: 'advantage', label: 'Advantage', glyph: '↑' },
	];

	// Roving radiogroup keyboard support: Left/Right (and Up/Down) move the checked option.
	function onAdvKeydown(event: KeyboardEvent): void {
		const index = ADV_OPTIONS.findIndex((option) => option.mode === advMode);
		let next: number;
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
			next = (index + 1) % ADV_OPTIONS.length;
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
			next = (index + ADV_OPTIONS.length - 1) % ADV_OPTIONS.length;
		} else {
			return;
		}
		event.preventDefault();
		const option = ADV_OPTIONS[next];
		if (!option) return;
		advMode = option.mode;
		const target = event.currentTarget as HTMLElement | null;
		target
			?.closest('[role="radiogroup"]')
			?.querySelector<HTMLElement>(`[data-adv-mode="${option.mode}"]`)
			?.focus();
	}

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		error = null;
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return false;
		}
		return true;
	}

	async function roll(): Promise<void> {
		const trimmed = expression.trim();
		if (!trimmed) {
			error = 'Enter a dice expression.';
			return;
		}
		// UX-SES-010 AC2 — the advantage selector rewrites a d20-only expression (d20+5 → 2d20kh1+5)
		// through the pure core transform; anything else rolls unchanged (the hint clarifies).
		const command = {
			type: 'dice.roll' as const,
			actorId: runtime.activeActorId,
			payload: {
				expression: advPreview.expression,
				visibility,
				...(label.trim() ? { label: label.trim() } : {}),
			},
		};
		await dispatchRoll(command);
	}

	// UX-SES-017 AC3 — failure raises an error toast with a Retry that re-dispatches the SAME
	// command (the identical payload, never a reconstructed one).
	async function dispatchRoll(command: Parameters<typeof runtime.dispatch>[0]): Promise<void> {
		const ok = await dispatch(command);
		if (!ok) {
			toasts?.push('error', `Roll failed. ${error ?? 'Unknown error.'}`, {
				label: 'Retry',
				run: () => dispatchRoll(command),
			});
			return;
		}
		// UX-SES-010 — announce the recorded result politely ("[Label: ]expression → total"). The
		// announcement derives from the roller's OWN actor-filtered view, so it can never leak.
		const latest = history.rolls[history.rolls.length - 1];
		if (latest) {
			announcer?.announce(
				`${latest.label ? `${latest.label}: ` : ''}${latest.expression} → ${latest.total}`,
				'polite',
			);
		}
	}

	async function drawTable(): Promise<void> {
		if (!tableId) {
			error = 'Select a table to draw.';
			return;
		}
		await dispatch({
			type: 'dice.roll-table',
			actorId: runtime.activeActorId,
			payload: { tableItemId: tableId, visibility },
		});
	}

	async function appendToNote(): Promise<void> {
		if (!appendRollId || !appendNoteId) {
			error = 'Select a roll and a note.';
			return;
		}
		const ok = await dispatch({
			type: 'dice.append-to-note',
			actorId: runtime.activeActorId,
			payload: { rollId: appendRollId, itemId: appendNoteId },
		});
		if (ok) {
			appendRollId = '';
			appendNoteId = '';
		}
	}
</script>

<!-- UX-SES-010 AC1 — the section is a programmatic focus target whose FIRST tabbable control is the
     expression input (Tab once from the panel lands on it). -->
<section data-testid="dice-tools" aria-label="Dice and tables" tabindex="-1">
	<h2>Dice and tables</h2>

	{#if error}
		<p class="error" role="alert" data-testid="dice-error">{error}</p>
	{/if}

	{#if !sessionActive}
		<!-- UX-SES-001 AC2 — inline state-gate message with a direct link to start the session. -->
		<SessionStateGate workflow={runtime.state.session.workflow} testid="dice-needs-active-session" />
	{/if}

	<form
		class="roll-form"
		data-testid="roll-form"
		onsubmit={(event) => {
			event.preventDefault();
			void roll();
		}}
	>
		<label for="dice-expression">Expression</label>
		<input
			id="dice-expression"
			data-testid="dice-expression"
			placeholder="e.g. d20, 2d6+3, 4d8"
			aria-label="Dice expression"
			aria-describedby="dice-grammar-hint"
			bind:value={expression}
		/>
		<span id="dice-grammar-hint" class="visually-hidden">
			Dice notation: NdM with optional keep-highest or keep-lowest, plus flat modifiers — for
			example 2d6+3 or 2d20kh1+5.
		</span>

		<!-- UX-SES-010 — 3-state advantage selector (radiogroup; Left/Right arrows change selection). -->
		<div
			class="adv-group"
			role="radiogroup"
			aria-label="Advantage or disadvantage"
			data-testid="dice-adv-group"
		>
			{#each ADV_OPTIONS as option (option.mode)}
				<button
					type="button"
					class="adv-option"
					class:selected={advMode === option.mode}
					role="radio"
					aria-checked={advMode === option.mode}
					tabindex={advMode === option.mode ? 0 : -1}
					data-adv-mode={option.mode}
					data-testid={`dice-adv-${option.mode}`}
					onclick={() => (advMode = option.mode)}
					onkeydown={onAdvKeydown}
				>
					<span aria-hidden="true">{option.glyph}</span>
					{option.label}
				</button>
			{/each}
		</div>
		{#if advHintVisible}
			<p class="meta adv-hint" data-testid="dice-adv-hint">
				Advantage applies to d20 rolls — use kh1 notation for other dice.
			</p>
		{/if}

		<label for="dice-label">Label</label>
		<input
			id="dice-label"
			data-testid="dice-label"
			placeholder="optional — e.g. Stealth check"
			bind:value={label}
		/>
		<label for="dice-visibility">Visibility</label>
		<select id="dice-visibility" data-testid="dice-visibility" bind:value={visibility}>
			<option value="session-visible">Session visible</option>
			{#if isDm}
				<option value="dm-only">DM only (secret)</option>
			{/if}
			<option value="shared">Shared</option>
		</select>
		<button
			type="submit"
			class="button"
			data-testid="roll-dice"
			aria-keyshortcuts="Enter"
			disabled={!sessionActive || expression.trim() === ''}
		>
			Roll
		</button>
	</form>

	{#if isDm}
		<!-- UX-SES-010 — DM-only rollable tables behind a collapsed-by-default disclosure. -->
		<Disclosure summary="Tables" bind:open={tablesOpen} testid="dice-tables-disclosure">
			<form
				class="table-form"
				data-testid="table-form"
				onsubmit={(event) => {
					event.preventDefault();
					void drawTable();
				}}
			>
				<label for="dice-table-select">Rollable table</label>
				<select id="dice-table-select" data-testid="dice-table-select" bind:value={tableId}>
					<option value="">Select a table…</option>
					{#each tables as table (table.id)}
						<option value={table.id}>{table.title}</option>
					{/each}
				</select>
				<button type="submit" class="button secondary" data-testid="draw-table" disabled={!sessionActive || tables.length === 0}>
					Draw table
				</button>
			</form>
		</Disclosure>

		<form
			class="append-form"
			data-testid="append-form"
			onsubmit={(event) => {
				event.preventDefault();
				void appendToNote();
			}}
		>
			<label for="append-roll-select">Append roll</label>
			<select id="append-roll-select" data-testid="append-roll-select" bind:value={appendRollId}>
				<option value="">Select a roll…</option>
				{#each history.rolls as r (r.id)}
					<option value={r.id}>{r.expression} → {r.total}</option>
				{/each}
			</select>
			<label for="append-note-select">to note</label>
			<select id="append-note-select" data-testid="append-note-select" bind:value={appendNoteId}>
				<option value="">Select a note…</option>
				{#each notes as note (note.id)}
					<option value={note.id}>{note.title}</option>
				{/each}
			</select>
			<button type="submit" class="button secondary" data-testid="append-roll" disabled={notes.length === 0}>
				Append to note
			</button>
		</form>
	{/if}

	<section class="roll-history" data-testid="roll-history" aria-label="Roll history">
		<h3>Roll history</h3>
		{#if isDm && dmHiddenRollCount > 0}
			<!-- UX-SES-011 — DM-only hidden-roll count; informational, never surfaced to players. -->
			<p class="meta" data-testid="dice-hidden-count" aria-live="off">
				{dmHiddenRollCount} hidden roll{dmHiddenRollCount === 1 ? '' : 's'} in this session
			</p>
		{/if}
		{#if visibleRolls.length === 0}
			<p class="meta" data-testid="dice-history-empty">No rolls yet.</p>
		{:else}
			<ol class="entries" aria-label="Roll history">
				{#each visibleRolls as r (r.id)}
					<li
						data-testid="roll-entry-{r.id}"
						class="roll-entry"
						class:dm-only={r.visibility === 'dm-only'}
						aria-label={entryAriaLabel(r)}
					>
						<span class="actor" data-testid="roll-actor">{actorName(r.actorId)}</span>
						<span class="sep" aria-hidden="true">·</span>
						{#if r.label}<span class="label" data-testid="roll-label">{r.label}: </span>{/if}
						<span class="expr" data-testid="roll-expression">{r.expression}</span>
						<span class="arrow" aria-hidden="true">→</span>
						<span class="total" data-testid="roll-total">{r.total}</span>
						{#if diceValuesText(r) !== ''}
							<span class="dice" data-testid="roll-dice-values">[{diceValuesText(r)}]</span>
						{/if}
						{#if r.visibility === 'dm-only'}
							<span class="badge secret" data-testid="roll-visibility">DM only</span>
						{:else if r.visibility === 'shared'}
							<span class="badge shared" data-testid="roll-visibility">Shared</span>
						{/if}
						{#if r.sourceKind === 'table' && r.tableRowText}
							<!-- UX-SES-011 AC3 — the drawn row text is visible inline, no hover needed. -->
							<span class="row" data-testid="roll-row">
								({#if tableTitle(r.tableItemId)}[Table: {tableTitle(r.tableItemId)}] {/if}“{r.tableRowText}”)
							</span>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</section>
</section>

<style>
	/* Secondary "tool" card (package Panel anatomy): calm surface-raised fill, display-serif title. */
	[data-testid='dice-tools'] {
		display: block;
		padding: var(--space-5);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	[data-testid='dice-tools'] > h2 {
		margin: 0 0 var(--space-4);
		font-family: var(--font-display);
		font-size: var(--text-md);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-primary);
	}
	.roll-history h3 {
		margin: var(--space-5) 0 var(--space-2);
		font-family: var(--font-display);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
	}

	.error {
		color: var(--color-status-error);
	}
	.meta {
		color: var(--color-text-secondary);
	}
	.roll-form,
	.table-form,
	.append-form {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
		margin-bottom: var(--space-2);
	}
	.adv-group {
		display: inline-flex;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}
	.adv-option {
		border: 0;
		border-radius: 0;
		background: var(--color-surface);
		color: var(--color-text-primary);
	}
	.adv-option + .adv-option {
		border-left: 1px solid var(--color-border);
	}
	.adv-option.selected {
		background: var(--color-accent);
		color: var(--color-accent-foreground);
	}
	.adv-hint {
		flex-basis: 100%;
		margin: 0;
	}
	/* UX-SES-010 AC4 — the history scrolls; older entries stay reachable. */
	.roll-history .entries {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		max-height: 24rem;
		overflow-y: auto;
	}
	.roll-entry {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--space-1) var(--space-2);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		align-items: baseline;
	}
	/* UX-SES-011 — a private entry carries the DM-only marker treatment (token group, not ad hoc). */
	.roll-entry.dm-only {
		border-left: 3px solid var(--color-dm-only-badge);
		background: var(--color-dm-only-subtle);
	}
	.actor {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.sep {
		color: var(--color-text-tertiary);
	}
	.label {
		font-style: italic;
	}
	.dice {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	/* The roll total is the result — set it in the mono face, bold, in primary ink so it reads first. */
	.total {
		font-family: var(--font-mono);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-primary);
	}
	.row {
		font-style: italic;
	}
	.badge {
		font-size: var(--text-xs);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-1);
	}
	.badge.secret {
		background: var(--color-dm-only-badge);
		color: var(--color-text-inverse);
	}
	.badge.shared {
		background: var(--color-status-success-subtle);
		color: var(--color-status-success-text);
	}
</style>
