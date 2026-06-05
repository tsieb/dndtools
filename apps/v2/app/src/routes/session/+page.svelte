<script lang="ts">
	import CombatTracker from '$lib/gui/CombatTracker.svelte';
	import EncounterBuilder from '$lib/gui/EncounterBuilder.svelte';
	import DiceTools from '$lib/gui/DiceTools.svelte';
	import HandoutDelivery from '$lib/gui/HandoutDelivery.svelte';
	import LiveTools from '$lib/gui/LiveTools.svelte';
	import QuickReference from '$lib/gui/QuickReference.svelte';

	// SES-002 / SES-006: the Session section's combat surface. The DM BUILDS encounters (combatant
	// selection + deterministic challenge guidance + terrain notes) and RUNS combat (initiative order,
	// rounds, turns, per-combatant HP/conditions/death-saves/concentration, stat-block previews, and a
	// durable encounter log). Players/observers see the live tracker through the actor-filtered query;
	// hidden combatants never leak.
	//
	// SES-003 / SES-008: the Session section's DICE + TABLES surface. A participant rolls dice
	// expressions/macros/inline rolls through shared dice commands; the DM draws rollable `dice-table`
	// assets and may append a recorded result to a note. The outcome is computed once in the core from a
	// recorded seed (reproducible), and roll visibility composes with PERM (a secret roll is filtered out
	// of a player's history). Both surfaces are gated on the active session workflow and re-enforce
	// authority in the Processing Core (fail-closed).
</script>

<section data-testid="session-view" aria-label="Session">
	<p class="meta">
		Run the live session: build encounters, run combat, and roll dice or draw tables. The DM builds
		and runs combat and draws session assets; players roll and see the live state filtered to what
		they may see.
	</p>

	<EncounterBuilder />
	<CombatTracker />
	<DiceTools />
	<HandoutDelivery />
	<LiveTools />
	<QuickReference />
</section>

<style>
	.meta {
		color: var(--color-text-muted, #666);
	}
</style>
