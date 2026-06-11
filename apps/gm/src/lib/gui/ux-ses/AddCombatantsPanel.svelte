<script lang="ts">
	import { listCharactersForActor } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';
	import { useSessionToasts } from '$lib/gui/ux-ses/session-toasts.svelte';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';

	/**
	 * UX-SES-008 — the ADD COMBATANT surface for RUNNING combat (DM-only; the caller gates render).
	 * Opened from the tracker header "Add +" button as a modal dialog (the a11y Dialog primitive:
	 * `role="dialog"`, `aria-modal`, focus-trapped, Escape closes — the drawer/bottom-sheet of the
	 * spec realized with the shared primitive on every profile).
	 *
	 * Two paths, both dispatching the same `combat.add-combatants` core command:
	 *   - VAULT CHARACTER: pick a character → added as a `character` combatant (the core seeds its
	 *     HP/AC from the live sheet; initiative auto-rolls when blank).
	 *   - QUICK-ADD: minimal stat block (Name, Initiative — blank auto-rolls — HP, AC) with a
	 *     QUANTITY stepper (1–20) for MASS combatants ("Goblin 1" … "Goblin N") and a HIDDEN toggle
	 *     (UX-SES-008 AC2 — hidden rows fail closed to a placeholder on the player tracker).
	 */
	interface Props {
		open: boolean;
	}

	let { open = $bindable() }: Props = $props();

	const runtime = useRuntime();
	const announcer = useLiveAnnouncer();
	const toasts = useSessionToasts();

	const characters = $derived(
		listCharactersForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId),
	);

	let error = $state<string | null>(null);
	let characterId = $state('');
	let name = $state('');
	let initiative = $state('');
	let maxHp = $state('7');
	let ac = $state('13');
	let quantity = $state(1);
	let hidden = $state(false);

	function reset(): void {
		error = null;
		characterId = '';
		name = '';
		initiative = '';
		maxHp = '7';
		ac = '13';
		quantity = 1;
		hidden = false;
	}

	async function addRows(
		rows: Array<Record<string, unknown>>,
		announceText: string,
	): Promise<void> {
		error = null;
		const result = await runtime.dispatch({
			type: 'combat.add-combatants',
			actorId: runtime.activeActorId,
			payload: { combatants: rows },
		});
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return;
		}
		// UX-SES-017 — milestone confirmation; polite announcement for AT parity.
		toasts?.push('milestone', announceText);
		announcer?.announce(announceText, 'polite');
		reset();
		open = false;
	}

	async function addCharacter(): Promise<void> {
		const selected = characters.find((character) => character.id === characterId);
		if (!selected) {
			error = 'Select a character to add.';
			return;
		}
		await addRows(
			[
				{
					kind: 'character',
					name: selected.name,
					characterId: selected.id,
					// The core seeds HP/AC from the character's live combat block; initiative auto-rolls.
					initiative: null,
					hidden,
				},
			],
			`${selected.name} added to combat.`,
		);
	}

	async function quickAdd(): Promise<void> {
		const trimmed = name.trim();
		if (!trimmed) {
			error = 'Enter a combatant name.';
			return;
		}
		const qty = Math.min(20, Math.max(1, Math.trunc(Number(quantity) || 1)));
		const initiativeValue = initiative.trim() === '' ? null : Math.trunc(Number(initiative));
		await addRows(
			[
				{
					kind: 'monster',
					name: trimmed,
					initiative: initiativeValue,
					maxHp: Math.max(0, Math.trunc(Number(maxHp) || 0)),
					ac: Math.max(0, Math.trunc(Number(ac) || 10)),
					quantity: qty,
					hidden,
				},
			],
			qty > 1 ? `${qty} combatants added to combat.` : `${trimmed} added to combat.`,
		);
	}
</script>

<Dialog bind:open title="Add combatant" testid="add-combatant-dialog" onclose={() => reset()}>
	{#if error}
		<p class="error" role="alert" data-testid="add-combatant-error">{error}</p>
	{/if}

	<!-- Vault character path (UX-SES-008 §spec add drawer: character search → tap to add). -->
	<div class="field-row">
		<label for="add-character-select">Vault character</label>
		<select id="add-character-select" data-testid="add-character-select" bind:value={characterId}>
			<option value="">Select a character…</option>
			{#each characters as character (character.id)}
				<option value={character.id}>{character.name}</option>
			{/each}
		</select>
		<button type="button" data-testid="add-character" onclick={() => void addCharacter()}>
			Add character
		</button>
	</div>

	<!-- Quick-add path: minimal stat block + quantity (mass) + hidden (secret). -->
	<form
		class="quick-add"
		data-testid="quick-add-form"
		onsubmit={(event) => {
			event.preventDefault();
			void quickAdd();
		}}
	>
		<div class="field-row">
			<label for="add-name">Name</label>
			<input id="add-name" data-testid="add-name" bind:value={name} />
		</div>
		<div class="field-row">
			<label for="add-initiative">Initiative</label>
			<input
				id="add-initiative"
				type="number"
				data-testid="add-initiative"
				placeholder="auto-roll"
				bind:value={initiative}
			/>
		</div>
		<div class="field-row">
			<label for="add-hp">HP (max)</label>
			<input id="add-hp" type="number" min="0" data-testid="add-hp" bind:value={maxHp} />
		</div>
		<div class="field-row">
			<label for="add-ac">AC</label>
			<input id="add-ac" type="number" min="0" data-testid="add-ac" bind:value={ac} />
		</div>
		<div class="field-row">
			<label for="add-qty">Quantity</label>
			<input
				id="add-qty"
				type="number"
				min="1"
				max="20"
				data-testid="add-qty"
				aria-valuemin="1"
				aria-valuemax="20"
				bind:value={quantity}
			/>
		</div>
		<div class="field-row">
			<!-- UX-SES-008 — hidden combatants render as a placeholder on the player tracker. -->
			<label for="add-hidden">
				<input id="add-hidden" type="checkbox" data-testid="add-hidden" bind:checked={hidden} />
				Hidden from players
			</label>
		</div>
		<button type="submit" class="button add-submit" data-testid="add-to-combat">Add</button>
	</form>
</Dialog>

<style>
	.error {
		color: var(--color-danger, #b00020);
	}

	.field-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	.field-row input[type='number'] {
		width: 6rem;
	}

	/* "Add" is the primary, full-width CTA of the drawer (UX-SES-008 §spec). */
	.add-submit {
		width: 100%;
		min-height: 44px;
		font-weight: 700;
	}
</style>
