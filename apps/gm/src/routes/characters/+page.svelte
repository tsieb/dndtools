<script lang="ts">
	import { listDraftsForActor } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import CharacterQuickCreate from '$lib/gui/CharacterQuickCreate.svelte';
	import CharacterDraftManager from '$lib/gui/CharacterDraftManager.svelte';
	import CharacterDraftFlow from '$lib/gui/CharacterDraftFlow.svelte';
	import CharacterRoster from '$lib/gui/CharacterRoster.svelte';
	import CharacterCollaboration from '$lib/gui/CharacterCollaboration.svelte';
	import CharacterCombatResources from '$lib/gui/CharacterCombatResources.svelte';
	import CharacterAdvancement from '$lib/gui/CharacterAdvancement.svelte';
	import PartyOverview from '$lib/gui/PartyOverview.svelte';
	import CharacterJournal from '$lib/gui/CharacterJournal.svelte';
	import CharacterDataExposure from '$lib/gui/CharacterDataExposure.svelte';

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

	<!-- CHAR-011: the actor-filtered party overview (HP/status/resource summaries, marching order, party
	     inventory). The DM and players see only what their role/visibility/grants permit; an observer
	     receives an empty overview (CHAR-015). The core's single party-view query enforces all filtering. -->
	<PartyOverview />

	<!-- CHAR-006: the structured, stable character data-exposure API a widget binds to. Rendered for
	     every role so the actor-filtered, fail-closed resolution is visible: a player/observer bound to a
	     DM-only or hidden field sees the explicit hidden state, never the value. The core resolver
	     enforces all filtering and the unknown-path fail-closed contract (Contract 4). -->
	<CharacterDataExposure />

	<!-- CHAR-004 / CHAR-005 / CHAR-014: collaborative editing is available to the DM and to players who
	     own a character. Observers see nothing (the core's actor-filtered view returns no characters). -->
	{#if activeRole === 'dm' || activeRole === 'player'}
		<CharacterCollaboration />
		<!-- CHAR-007 / CHAR-008: combat resources + spell/resource state. Owners and combat participants
		     update resources during a session; owners manage structure and rest recovery. The core gates
		     session-active writes and owner-vs-combat-participant authority. -->
		<CharacterCombatResources />
		<!-- CHAR-009: level-up / advancement with staged validation before finalization (owner-only). -->
		<CharacterAdvancement />
	{/if}

	<!-- CHAR-012 / CHAR-016 / CHAR-015: the character journal — owner-scoped, per-entry visibility,
	     other-player filtering, data-layer cross-surface invalidation on visibility change. Rendered for
	     every role: an observer receives an empty surface (no characters, no entries), proving non-leak. -->
	<CharacterJournal />

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
