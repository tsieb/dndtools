<script lang="ts">
	import {
		getContentItemsForActor,
		getDiceHistoryForActor,
		VAULT_OBJECT_SUBTYPE_KEY,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// SES-003 / SES-008: the Session section's DICE + TABLES surface. A participant rolls dice
	// expressions / macros / inline rolls through the shared `dice.roll` command; the DM draws rollable
	// `dice-table` Vault Objects and may append a recorded result to a note. The random OUTCOME is
	// computed ONCE in the Processing Core from a recorded seed (reproducible; never re-rolled per device
	// or render — Contract 2), so the rendered history is the same for every participant who may see it.
	// Visibility composes with PERM: a secret/DM-only roll is filtered out of a player's history by the
	// core read model (Contract 3). The GUI only dispatches command intents and renders computed models.
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const sessionActive = $derived(runtime.state.session.workflow === 'active');

	const history = $derived(
		getDiceHistoryForActor(runtime.state.session, runtime.state.permissions, runtime.activeActorId),
	);

	// The actor-visible content items, split into rollable tables and append-target notes.
	const items = $derived(
		getContentItemsForActor(runtime.state.content, runtime.state.permissions, runtime.activeActorId),
	);
	const tables = $derived(
		items.filter((item) => item.fields[VAULT_OBJECT_SUBTYPE_KEY] === 'dice-table'),
	);
	const notes = $derived(items.filter((item) => item.kind === 'note'));

	let error = $state<string | null>(null);
	let expression = $state('1d20');
	let visibility = $state<'session-visible' | 'dm-only' | 'shared'>('session-visible');
	let label = $state('');
	let tableId = $state('');
	let appendRollId = $state('');
	let appendNoteId = $state('');

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
		await dispatch({
			type: 'dice.roll',
			actorId: runtime.activeActorId,
			payload: {
				expression: trimmed,
				visibility,
				...(label.trim() ? { label: label.trim() } : {}),
			},
		});
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

<section data-testid="dice-tools" aria-label="Dice and tables">
	<h2>Dice and tables</h2>

	{#if error}
		<p class="error" role="alert" data-testid="dice-error">{error}</p>
	{/if}

	{#if !sessionActive}
		<p class="meta" data-testid="dice-needs-active-session">
			Dice and tables are available while the session is active. Start the session from the Command
			Center first.
		</p>
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
			placeholder="e.g. 2d20kh1+5"
			bind:value={expression}
		/>
		<label for="dice-label">Label</label>
		<input id="dice-label" data-testid="dice-label" placeholder="optional reason" bind:value={label} />
		<label for="dice-visibility">Visibility</label>
		<select id="dice-visibility" data-testid="dice-visibility" bind:value={visibility}>
			<option value="session-visible">Session visible</option>
			{#if isDm}
				<option value="dm-only">DM only (secret)</option>
			{/if}
			<option value="shared">Shared</option>
		</select>
		<button type="submit" data-testid="roll-dice" disabled={!sessionActive}>Roll</button>
	</form>

	{#if isDm}
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
			<button type="submit" data-testid="draw-table" disabled={!sessionActive || tables.length === 0}>
				Draw table
			</button>
		</form>

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
			<button type="submit" data-testid="append-roll" disabled={notes.length === 0}>
				Append to note
			</button>
		</form>
	{/if}

	<section class="roll-history" data-testid="roll-history" aria-label="Roll history">
		<h3>Roll history</h3>
		{#if isDm && history.hiddenCount > 0}
			<p class="meta" data-testid="dice-hidden-count">{history.hiddenCount} hidden</p>
		{/if}
		{#if history.rolls.length === 0}
			<p class="meta" data-testid="dice-history-empty">No rolls yet.</p>
		{:else}
			<ol>
				{#each history.rolls as r (r.id)}
					<li data-testid="roll-entry-{r.id}" class="roll-entry">
						{#if r.label}<span class="label" data-testid="roll-label">{r.label}: </span>{/if}
						<span class="expr" data-testid="roll-expression">{r.expression}</span>
						<span class="arrow">→</span>
						<span class="total" data-testid="roll-total">{r.total}</span>
						{#if r.sourceKind === 'table' && r.tableRowText}
							<span class="row" data-testid="roll-row">({r.tableRowText})</span>
						{:else if r.dice.length > 0}
							<span class="dice" data-testid="roll-dice">[{r.dice.join(', ')}]</span>
						{/if}
						{#if r.visibility !== 'session-visible'}
							<span class="badge" data-testid="roll-visibility">{r.visibility}</span>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</section>
</section>

<style>
	.error {
		color: var(--color-danger, #b00020);
	}
	.meta {
		color: var(--color-text-muted, #666);
	}
	.roll-form,
	.table-form,
	.append-form {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		align-items: center;
		margin-bottom: var(--space-2, 0.5rem);
	}
	.roll-history ol {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
	}
	.roll-entry {
		border: 1px solid var(--color-border, #ddd);
		border-radius: var(--radius-1, 0.25rem);
		padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1, 0.25rem);
		align-items: baseline;
	}
	.total {
		font-weight: 600;
	}
	.badge {
		font-size: 0.75rem;
		background: var(--color-accent, #3b82f6);
		color: #fff;
		border-radius: var(--radius-1, 0.25rem);
		padding: 0 var(--space-1, 0.25rem);
	}
</style>
