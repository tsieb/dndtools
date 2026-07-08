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

	// UX-CHAR — the Characters SUITE. A primary command workspace, not a document list: the DM gets a
	// party vitals board + roster alongside an authoring rail (quick-create + draft ownership); a player
	// gets their guided creation wizard as the hero. Which surfaces appear is an ergonomic role hint —
	// the AUTHORITATIVE permission and visibility enforcement is in the Processing Core, so a player
	// rendering this page can still only see/edit what the core permits (Contract 1).
	const runtime = useRuntime();

	const activeRole = $derived(runtime.state.permissions.actors[runtime.activeActorId]?.role ?? null);

	// The draft(s) the active actor owns (for a player, their in-progress PC creation). A player with no
	// draft sees the "ask your DM" empty state; with a draft, the guided resumable wizard.
	const myDrafts = $derived(
		listDraftsForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId).filter(
			(draft) => draft.ownerActorId === runtime.activeActorId && !draft.finalized,
		),
	);

	// UX-CHAR-001 — the quick-create success "Open sheet" affordance brings the new character into view
	// in the roster and moves focus to it (a real character sheet route lands with the CHAR sheet epic).
	function revealCharacter(characterId: string): void {
		const card = document.getElementById(`roster-card-${characterId}`);
		card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
		card?.focus({ preventScroll: true });
	}
</script>

<section class="suite" data-testid="characters-view" aria-label="Characters">
	<!-- The app shell owns the single route-level <h1> ("Characters", NAV-007); the suite adds only a
	     role-aware lede beneath it. -->
	<p class="suite__lede">
		{#if activeRole === 'dm'}
			Track party vitals, quick-create NPCs, and manage who owns each character draft.
		{:else if activeRole === 'player'}
			Build your character and keep an eye on the party.
		{:else}
			The party roster.
		{/if}
	</p>

	<!-- Role-differentiated hero / authoring. These surfaces legitimately swap on a view-as change. -->
	{#if activeRole === 'dm'}
		<div class="suite__grid">
			<div class="suite__col suite__col--primary">
				<section class="card card--hero"><PartyOverview /></section>
				<section class="card"><CharacterRoster /></section>
			</div>
			<div class="suite__col suite__col--rail">
				<section class="card"><CharacterQuickCreate onopen={revealCharacter} /></section>
				<section class="card"><CharacterDraftManager /></section>
			</div>
		</div>
	{:else if activeRole === 'player'}
		<section class="card card--hero" data-testid="player-character-creation" aria-label="Your character">
			{#if myDrafts.length === 0}
				<h2>Your character</h2>
				<p class="meta" data-testid="no-draft">
					You don't have a character draft yet. Ask your DM to assign one.
				</p>
			{:else}
				{#each myDrafts as draft (draft.id)}
					<CharacterDraftFlow draftId={draft.id} />
				{/each}
			{/if}
		</section>

		<div class="suite__grid">
			<div class="suite__col suite__col--primary">
				<section class="card"><PartyOverview /></section>
			</div>
			<div class="suite__col suite__col--rail">
				<section class="card"><CharacterRoster /></section>
			</div>
		</div>
	{:else}
		<section class="card"><PartyOverview /></section>
	{/if}

	<!-- Shared character tools. Rendered in ONE un-branched block so they keep their in-progress edit
	     state (e.g. an unsaved collaborative edit, CHAR-004) across a DM↔player view-as switch instead
	     of remounting. The Processing Core still actor-filters every surface (an observer sees nothing). -->
	<details class="suite__tools" open>
		<summary class="suite__tools-summary">Character tools</summary>
		<div class="suite__tools-grid">
			{#if activeRole === 'dm' || activeRole === 'player'}
				<section class="card"><CharacterCollaboration /></section>
				<section class="card"><CharacterCombatResources /></section>
				<section class="card"><CharacterAdvancement /></section>
			{/if}
			<section class="card"><CharacterDataExposure /></section>
			<section class="card"><CharacterJournal /></section>
		</div>
	</details>
</section>

<style>
	.suite {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.suite__lede {
		margin: 0;
		color: var(--color-text-secondary);
	}
	.suite__grid {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
		gap: var(--space-4);
		align-items: start;
	}
	.suite__col {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
	}
	/* Canonical secondary panel/card — the default content block. */
	.card {
		padding: var(--space-5);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	/* Canonical PRIMARY / hero card — the ONE focal block per role-view (DM: party vitals;
	   player: guided character creation). */
	.card--hero {
		background: var(--color-accent-subtle);
		border-color: var(--color-accent-border);
		box-shadow: var(--shadow-md);
	}
	.card--hero h2 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--font-weight-bold);
		font-size: var(--text-xl);
		color: var(--color-text-primary);
		letter-spacing: var(--tracking-tight);
	}
	.card--hero .meta {
		margin: var(--space-2) 0 0;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	/* Calm / tier-3 strip — the collapsible secondary character tools. */
	.suite__tools {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface-alt);
		box-shadow: var(--shadow-sm);
		padding: var(--space-4);
	}
	.suite__tools-summary {
		cursor: pointer;
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		list-style: revert;
	}
	.suite__tools-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: var(--space-4);
		margin-top: var(--space-4);
	}
	@media (max-width: 860px) {
		.suite__grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
