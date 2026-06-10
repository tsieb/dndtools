<script lang="ts">
	import { useRuntime } from '$lib/state/runtime-context';

	// CHAR-001: the DM quick-create surface for an NPC/monster/sidekick with SIMPLIFIED stat +
	// combat fields. Visibility DEFAULTS to dm-only (fail closed) — the select defaults to it and
	// the player never sees a dm-only NPC. All mutations dispatch the durable
	// `character.quick-create` command; the GUI never writes character state directly (Contract 1).
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
	let error = $state<string | null>(null);
	let lastCreatedName = $state<string | null>(null);

	async function create(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		if (!name.trim()) {
			error = 'Enter a character name.';
			return;
		}
		const attacks = attackName.trim()
			? [{ name: attackName.trim(), detail: attackDetail.trim() }]
			: [];
		// When the DM enters dm-only notes, store them in `data.dmNotes` and declare the field
		// dm-only so the Processing Core's actor-filtered view never leaks it to a non-DM actor
		// (CHAR-014 AC2 — non-leak guarantee). The character's single canonical value is still
		// `data.dmNotes`; only the DM sees it.
		const data: Record<string, unknown> = dmNotes.trim() ? { dmNotes: dmNotes.trim() } : {};
		const dmOnlyFields: string[] = dmNotes.trim() ? ['data.dmNotes'] : [];
		const result = await runtime.dispatch({
			type: 'character.quick-create',
			actorId: dmActorId,
			payload: {
				kind,
				name: name.trim(),
				visibility,
				combat: { hp, maxHp: hp, ac },
				attacks,
				data,
				dmOnlyFields,
			},
		});
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return;
		}
		lastCreatedName = name.trim();
		name = '';
		attackName = '';
		attackDetail = '';
		dmNotes = '';
		visibility = 'dm-only';
	}
</script>

<section data-testid="character-quick-create" aria-label="Quick-create a character">
	<h2>Quick-create a character</h2>
	<p class="meta">
		Create an NPC, monster, or sidekick with simplified stats. New characters default to DM-only;
		share them explicitly to make them player-visible.
	</p>
	<form class="form" onsubmit={create}>
		<label>
			<span>Kind</span>
			<select data-testid="qc-kind" bind:value={kind}>
				<option value="npc">NPC</option>
				<option value="monster">Monster</option>
				<option value="sidekick">Sidekick</option>
			</select>
		</label>
		<label>
			<span>Name</span>
			<input data-testid="qc-name" bind:value={name} autocomplete="off" required />
		</label>
		<label>
			<span>HP</span>
			<input data-testid="qc-hp" type="number" bind:value={hp} />
		</label>
		<label>
			<span>AC</span>
			<input data-testid="qc-ac" type="number" bind:value={ac} />
		</label>
		<label>
			<span>Visibility</span>
			<select data-testid="qc-visibility" bind:value={visibility}>
				<option value="dm-only">DM only</option>
				<option value="shared">Shared</option>
				<option value="player-visible">Player visible</option>
			</select>
		</label>
		<label>
			<span>Attack name (optional)</span>
			<input data-testid="qc-attack-name" bind:value={attackName} autocomplete="off" />
		</label>
		<label>
			<span>Attack detail (optional)</span>
			<input data-testid="qc-attack-detail" bind:value={attackDetail} autocomplete="off" />
		</label>
		<label>
			<span>DM notes — dm-only (optional)</span>
			<textarea
				data-testid="qc-dm-notes"
				bind:value={dmNotes}
				autocomplete="off"
				rows="2"
				placeholder="Visible only to the DM — never shown to players (CHAR-014)."
			></textarea>
		</label>
		<button class="button" type="submit" data-testid="qc-submit">Create character</button>
	</form>
	{#if lastCreatedName}
		<p class="meta" data-testid="qc-created" role="status">Created: {lastCreatedName}</p>
	{/if}
	{#if error}
		<p class="meta" role="alert" data-testid="qc-error">{error}</p>
	{/if}
</section>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 28rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-weight: 600;
	}
</style>
