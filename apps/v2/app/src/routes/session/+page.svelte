<script lang="ts">
	import CombatTracker from '$lib/gui/CombatTracker.svelte';
	import EncounterBuilder from '$lib/gui/EncounterBuilder.svelte';

	// SES-002 / SES-006: the Session section's combat surface — the FIRST SES slice. The DM BUILDS
	// encounters (combatant selection + deterministic challenge guidance + terrain notes) and RUNS combat
	// (initiative order, rounds, turns, per-combatant HP/conditions/death-saves/concentration, stat-block
	// previews, and a durable encounter log). Players/observers see the live tracker through the
	// actor-filtered query; hidden combatants never leak. Combat is gated on the active session workflow,
	// and DM/combat-participant authority is re-enforced in the Processing Core (fail-closed).
</script>

<section data-testid="session-view" aria-label="Session">
	<p class="meta">
		Run the live session: build encounters and run combat with initiative order, rounds, turns, and
		per-combatant resources. The DM builds and runs combat; players see the live tracker filtered to
		what they may see.
	</p>

	<EncounterBuilder />
	<CombatTracker />
</section>

<style>
	.meta {
		color: var(--color-text-muted, #666);
	}
</style>
