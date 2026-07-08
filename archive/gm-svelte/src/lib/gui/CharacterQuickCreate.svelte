<script lang="ts">
	import { useRuntime } from '$lib/state/runtime-context';
	import Disclosure from '$lib/gui/a11y/Disclosure.svelte';

	// UX-CHAR-001 — the DM quick-create surface: the fewest fields that produce a runnable stat block
	// (Kind, Name, HP, AC, Visibility) with one optional Attack row + DM-only notes behind a
	// disclosure, submitting via keyboard or button with inline success feedback. Visibility DEFAULTS
	// to dm-only (fail closed) so a player never sees a fresh NPC. Every mutation dispatches the durable
	// `character.quick-create` command; the GUI never writes character state directly (Contract 1).
	interface Props {
		/** Called with the new character id when the success toast's "Open sheet" is pressed. */
		onopen?: (characterId: string) => void;
	}
	const { onopen }: Props = $props();

	const runtime = useRuntime();

	const dmActorId = $derived(
		Object.values(runtime.state.permissions.actors).find((actor) => actor.role === 'dm')?.id ?? '',
	);

	let kind = $state<'npc' | 'monster' | 'sidekick'>('npc');
	let name = $state('');
	let hp = $state(10);
	let ac = $state(12);
	let visibility = $state<'dm-only' | 'player-visible' | 'shared'>('dm-only');
	let attackName = $state('');
	let attackDetail = $state('');
	/** DM-only notes field: when non-empty, added to `data.dmNotes` and marked dm-only (CHAR-014). */
	let dmNotes = $state('');
	// Optional details default OPEN so the dm-only notes field stays reachable on every profile
	// (the CHAR-014 non-leak flow fills it directly); the DM can collapse it to compress the form.
	let detailsOpen = $state(true);
	let error = $state<string | null>(null);
	let submitting = $state(false);
	let lastCreated = $state<{ id: string; name: string; kind: string } | null>(null);

	let nameEl = $state<HTMLInputElement | null>(null);

	// AC1: Name is focused when the form loads. preventScroll keeps the panel from yanking the page.
	let focusedOnce = false;
	$effect(() => {
		if (focusedOnce || !nameEl) return;
		focusedOnce = true;
		nameEl.focus({ preventScroll: true });
	});

	const KIND_LABEL: Record<typeof kind, string> = {
		npc: 'NPC',
		monster: 'Monster',
		sidekick: 'Sidekick',
	};
	const kindLabel = $derived(KIND_LABEL[kind]);

	async function create(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		if (!name.trim()) {
			// AC3: empty Name → inline error and focus returns to Name.
			error = 'Enter a character name.';
			nameEl?.focus();
			return;
		}
		const attacks = attackName.trim() ? [{ name: attackName.trim(), detail: attackDetail.trim() }] : [];
		// DM notes stored in `data.dmNotes` and declared dm-only so the core's actor-filtered view
		// never leaks it to a non-DM actor (CHAR-014 AC2). Only the DM ever sees it.
		const data: Record<string, unknown> = dmNotes.trim() ? { dmNotes: dmNotes.trim() } : {};
		const dmOnlyFields: string[] = dmNotes.trim() ? ['data.dmNotes'] : [];
		const submittedName = name.trim();
		const submittedKind = kind;
		submitting = true;
		const result = await runtime.dispatch({
			type: 'character.quick-create',
			actorId: dmActorId,
			payload: {
				kind,
				name: submittedName,
				visibility,
				combat: { hp, maxHp: hp, ac },
				attacks,
				data,
				dmOnlyFields,
			},
		});
		submitting = false;
		if (result.status === 'rejected') {
			error = result.rejection.message;
			nameEl?.focus();
			return;
		}
		const created = result.events.find((event) => event.kind === 'character.created');
		lastCreated = {
			id: created?.kind === 'character.created' ? created.characterId : '',
			name: submittedName,
			kind: submittedKind,
		};
		// Reset to the speed defaults so the next create is immediate (AC2 path).
		name = '';
		hp = 10;
		ac = 12;
		attackName = '';
		attackDetail = '';
		dmNotes = '';
		visibility = 'dm-only';
		nameEl?.focus({ preventScroll: true });
	}
</script>

<section class="qc" data-testid="character-quick-create" aria-labelledby="qc-heading">
	<header class="qc__head">
		<h2 id="qc-heading">Quick-create</h2>
		<p class="qc__sub">
			An NPC, monster, or sidekick with just enough stats to run. New creations stay DM-only until
			you share them.
		</p>
	</header>

	<!-- novalidate: keep `required` for assistive tech, but drive the inline error UX from JS (AC3). -->
	<form class="qc__form" onsubmit={create} aria-busy={submitting} novalidate>
		<label class="field">
			<span class="field__label">Kind</span>
			<select data-testid="qc-kind" bind:value={kind}>
				<option value="npc">NPC</option>
				<option value="monster">Monster</option>
				<option value="sidekick">Sidekick</option>
			</select>
		</label>

		<label class="field">
			<span class="field__label">Name</span>
			<input
				data-testid="qc-name"
				bind:this={nameEl}
				bind:value={name}
				autocomplete="off"
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? 'qc-error-msg' : undefined}
				required
			/>
			{#if error}
				<p class="field__error" id="qc-error-msg" role="alert" data-testid="qc-error">{error}</p>
			{/if}
		</label>

		<div class="field-row">
			<label class="field">
				<span class="field__label">HP</span>
				<input
					class="num"
					data-testid="qc-hp"
					type="number"
					inputmode="numeric"
					min="0"
					max="9999"
					bind:value={hp}
				/>
			</label>
			<label class="field">
				<span class="field__label">AC</span>
				<input
					class="num"
					data-testid="qc-ac"
					type="number"
					inputmode="numeric"
					min="0"
					max="30"
					bind:value={ac}
				/>
			</label>
		</div>

		<label class="field">
			<span class="field__label">Visibility</span>
			<select data-testid="qc-visibility" bind:value={visibility}>
				<option value="dm-only">DM only</option>
				<option value="shared">Shared</option>
				<option value="player-visible">Player visible</option>
			</select>
		</label>

		<Disclosure bind:open={detailsOpen} summary="Optional details" testid="qc-details">
			<div class="qc__details">
				<label class="field">
					<span class="field__label">Attack name</span>
					<input data-testid="qc-attack-name" bind:value={attackName} autocomplete="off" />
				</label>
				<label class="field">
					<span class="field__label">Attack detail</span>
					<input data-testid="qc-attack-detail" bind:value={attackDetail} autocomplete="off" />
				</label>
				<label class="field">
					<span class="field__label">
						DM notes <span class="field__tag">DM only</span>
					</span>
					<textarea
						data-testid="qc-dm-notes"
						bind:value={dmNotes}
						autocomplete="off"
						rows="2"
						placeholder="Visible only to you — never shown to players (CHAR-014)."
					></textarea>
				</label>
			</div>
		</Disclosure>

		<button class="button qc__submit" type="submit" data-testid="qc-submit" aria-busy={submitting} disabled={submitting}>
			{submitting ? 'Creating…' : `Create ${kindLabel}`}
		</button>
	</form>

	{#if lastCreated}
		<div class="qc__toast" role="status" data-testid="qc-created">
			<span><strong>{lastCreated.name}</strong> created as {KIND_LABEL[lastCreated.kind as typeof kind]}.</span>
			{#if lastCreated.id && onopen}
				<button
					type="button"
					class="qc__open"
					data-testid="qc-open-sheet"
					onclick={() => onopen?.(lastCreated!.id)}
				>
					Open sheet
				</button>
			{/if}
		</div>
	{/if}
</section>

<style>
	.qc {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.qc__head h2 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--font-weight-bold);
		font-size: var(--text-lg);
		color: var(--color-text-primary);
		letter-spacing: var(--tracking-tight);
	}
	.qc__sub {
		margin: var(--space-1) 0 0;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		line-height: var(--leading-snug);
	}
	.qc__form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		max-width: 480px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.field__label {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.field__tag {
		font-size: var(--text-2xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-dm-only-badge);
		background: var(--color-dm-only-subtle);
		border: 1px solid var(--color-dm-only-badge);
		border-radius: var(--radius-full);
		padding: 0 var(--space-1-5);
	}
	.field :global(input),
	.field :global(textarea),
	.field :global(select) {
		min-height: var(--touch-target-min);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font: inherit;
	}
	.field :global(textarea) {
		min-height: calc(var(--touch-target-min) * 1.4);
		resize: vertical;
	}
	.field-row {
		display: flex;
		gap: var(--space-3);
	}
	.field-row .field {
		flex: 1 1 0;
		min-width: 0;
	}
	/* Hide the native number steppers (UX-CHAR-001 §spec): plain numeric entry, arrow keys still step. */
	.num {
		appearance: textfield;
		-moz-appearance: textfield;
	}
	.num::-webkit-outer-spin-button,
	.num::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.field__error {
		margin: 0;
		color: var(--color-status-error-text);
		font-size: var(--text-sm);
	}
	.qc__details {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-top: var(--space-2);
	}
	.qc__submit {
		align-self: flex-start;
		min-height: var(--touch-target-min);
		font-weight: var(--font-weight-semibold);
	}
	.qc__toast {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		background: var(--color-status-success-subtle);
		border: 1px solid var(--color-status-success);
		border-radius: var(--radius-md);
		color: var(--color-text-primary);
		font-size: var(--text-sm);
	}
	.qc__open {
		cursor: pointer;
		background: transparent;
		border: 1px solid var(--color-status-success);
		color: var(--color-status-success-text);
		border-radius: var(--radius-sm);
		padding: var(--space-1) var(--space-3);
		min-height: var(--touch-target-floor);
		font-weight: var(--font-weight-semibold);
	}
</style>
