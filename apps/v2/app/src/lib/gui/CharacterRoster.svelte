<script lang="ts">
	import { listCharactersForActor } from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CHAR-001: the actor-filtered character roster. It renders ENTIRELY from the Processing Core's
	// actor-filtered query, so a dm-only NPC never appears for a player/observer (omitted, not
	// redacted), and DM-only fields are stripped before render. The GUI never re-derives visibility.
	const runtime = useRuntime();

	const characters = $derived(
		listCharactersForActor(
			runtime.state.characters,
			runtime.state.permissions,
			runtime.activeActorId,
		),
	);
</script>

<section data-testid="character-roster" aria-label="Characters">
	<h2>Roster</h2>
	{#if characters.length === 0}
		<p class="meta" data-testid="roster-empty">No characters are visible to you.</p>
	{:else}
		<ul class="scene-list" data-testid="roster-list">
			{#each characters as character (character.id)}
				<li class="scene-card" data-testid={`roster-${character.id}`}>
					<div>
						<strong>{character.name}</strong>
						<span class="meta"> • {character.kind}</span>
						<div class="meta">
							HP {character.combat.hp}/{character.combat.maxHp} • AC {character.combat.ac} •
							{character.visibility}
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
