<script lang="ts">
	import { listCharactersForActor } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import HpBar from '$lib/gui/ux-char/HpBar.svelte';

	// UX-CHAR-011 (roster facet) — the actor-filtered character roster: every character the viewer may
	// see (PCs, NPCs, monsters), rendered ENTIRELY from the Processing Core's actor-filtered query, so a
	// dm-only NPC never appears for a player/observer (omitted, not redacted) and DM-only fields are
	// stripped before render. The GUI never re-derives visibility.
	const runtime = useRuntime();

	const characters = $derived(
		listCharactersForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId),
	);

	const VIS_LABEL: Record<string, string> = {
		'dm-only': 'DM only',
		'player-visible': 'Player visible',
		shared: 'Shared',
	};
</script>

<section class="roster" data-testid="character-roster" aria-labelledby="roster-heading">
	<header class="roster__head">
		<h2 id="roster-heading">Roster</h2>
		<span class="roster__count">{characters.length}</span>
	</header>
	{#if characters.length === 0}
		<p class="roster__empty" data-testid="roster-empty">No characters are visible to you.</p>
	{:else}
		<ul class="roster__list" data-testid="roster-list">
			{#each characters as character (character.id)}
				<li
					class="rc"
					id={`roster-card-${character.id}`}
					data-testid={`roster-${character.id}`}
					tabindex="-1"
				>
					<div class="rc__top">
						<span class="kind-badge" data-kind={character.kind}>{character.kind}</span>
						<span class="vis-badge" data-visibility={character.visibility}>
							{VIS_LABEL[character.visibility] ?? character.visibility}
						</span>
					</div>
					<strong class="rc__name">{character.name}</strong>
					<div class="rc__vitals">
						<HpBar
							hp={character.combat.hp}
							maxHp={character.combat.maxHp}
							label={character.name}
							testid={`roster-hp-${character.id}`}
						/>
						<span class="ac-badge">AC {character.combat.ac}</span>
					</div>
					{#if character.combat.conditions.length > 0}
						<ul class="rc__conditions" aria-label="Conditions">
							{#each character.combat.conditions as condition (condition)}
								<li class="condition-pill">{condition}</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.roster {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.roster__head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.roster__head h2 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--font-weight-bold);
		font-size: var(--text-lg);
		color: var(--color-text-primary);
		letter-spacing: var(--tracking-tight);
	}
	.roster__count {
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		color: var(--color-text-secondary);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		padding: 0 var(--space-2);
	}
	.roster__empty {
		margin: 0;
		padding: var(--space-4);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	/* Roster as a card grid (mockup: repeat(auto-fill, minmax(260px, …))), HP / AC / conditions /
	   ownership pulled forward. Each card is a recessed --color-surface tile so it pops on the raised
	   wrapper card. */
	.roster__list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(244px, 1fr));
		gap: var(--space-3);
	}
	.rc {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
	}
	.rc:focus-visible {
		outline: var(--focus-ring-width) solid var(--focus-ring-color);
		outline-offset: var(--focus-ring-offset);
	}
	.rc__top {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.rc__name {
		color: var(--color-text-primary);
		font-family: var(--font-display);
		font-weight: var(--font-weight-bold);
		font-size: var(--text-md);
		line-height: var(--leading-tight);
	}
	.rc__conditions {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.condition-pill {
		font-size: var(--text-2xs);
		color: var(--color-status-warning-text);
		background: var(--color-status-warning-subtle);
		border: 1px solid var(--color-status-warning);
		border-radius: var(--radius-full);
		padding: 0 var(--space-2);
	}
	.rc__vitals {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.rc__vitals :global(.hpbar) {
		flex: 1 1 auto;
		min-width: 0;
	}
	.kind-badge,
	.vis-badge {
		font-size: var(--text-2xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		padding: 0 var(--space-1-5);
	}
	.vis-badge[data-visibility='dm-only'] {
		color: var(--color-dm-only-badge);
		border-color: var(--color-dm-only-badge);
		background: var(--color-dm-only-subtle);
	}
	/* Kind tone (mockup: PC success, NPC neutral, Monster warning) — colour on top of the visible
	   uppercase label, never the sole cue. */
	.kind-badge[data-kind='pc'] {
		color: var(--color-status-success-text);
		border-color: var(--color-status-success);
		background: var(--color-status-success-subtle);
	}
	.kind-badge[data-kind='monster'] {
		color: var(--color-status-warning-text);
		border-color: var(--color-status-warning);
		background: var(--color-status-warning-subtle);
	}
	.kind-badge[data-kind='sidekick'] {
		color: var(--color-status-info-text);
		border-color: var(--color-status-info);
		background: var(--color-status-info-subtle);
	}
	.ac-badge {
		flex: 0 0 auto;
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--space-0-5) var(--space-2);
		white-space: nowrap;
	}
</style>
