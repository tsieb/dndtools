<script lang="ts">
	import { listDraftsForActor } from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';
	import CharacterQuickCreate from '$lib/gui/CharacterQuickCreate.svelte';
	import CharacterDraftManager from '$lib/gui/CharacterDraftManager.svelte';
	import CharacterDraftFlow from '$lib/gui/CharacterDraftFlow.svelte';
	import CharacterRoster from '$lib/gui/CharacterRoster.svelte';

	// CHAR-001 / CHAR-002 / CHAR-013: the Characters section. Which surfaces appear is an ergonomic
	// role hint (the DM authoring tools for the DM; the guided creation flow for a player who owns a
	// draft) — the AUTHORITATIVE permission and visibility enforcement is in the Processing Core, so a
	// player rendering this page can still only see/edit what the core permits.
	const runtime = useRuntime();

	const activeRole = $derived(
		runtime.state.permissions.actors[runtime.activeActorId]?.role ?? null,
	);

	// The draft(s) the active actor owns (for a player, their in-progress PC creation). A player with
	// no draft sees the "ask your DM" empty state; with a draft, the guided resumable flow.
	const myDrafts = $derived(
		listDraftsForActor(
			runtime.state.characters,
			runtime.state.permissions,
			runtime.activeActorId,
		).filter((draft) => draft.ownerActorId === runtime.activeActorId && !draft.finalized),
	);
</script>

<section data-testid="characters-view" aria-label="Characters">
	<p class="meta">
		The party roster and character creation. The DM quick-creates NPCs and assigns PC drafts;
		players build their PC through a guided flow.
	</p>

	<CharacterRoster />

	{#if activeRole === 'dm'}
		<CharacterQuickCreate />
		<CharacterDraftManager />
	{:else if activeRole === 'player'}
		<section data-testid="player-character-creation" aria-label="Your character">
			<h2>Your character</h2>
			{#if myDrafts.length === 0}
				<p class="meta" data-testid="no-draft">
					You don’t have a character draft yet. Ask your DM to assign one.
				</p>
			{:else}
				{#each myDrafts as draft (draft.id)}
					<CharacterDraftFlow draftId={draft.id} />
				{/each}
			{/if}
		</section>
	{:else}
		<p class="meta" data-testid="observer-no-characters">
			Observers do not have access to character data.
		</p>
	{/if}
</section>
