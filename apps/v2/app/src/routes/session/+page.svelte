<script lang="ts">
	import CombatTracker from '$lib/gui/CombatTracker.svelte';
	import EncounterBuilder from '$lib/gui/EncounterBuilder.svelte';
	import DiceTools from '$lib/gui/DiceTools.svelte';
	import HandoutDelivery from '$lib/gui/HandoutDelivery.svelte';
	import PlayerGroups from '$lib/gui/PlayerGroups.svelte';
	import LiveTools from '$lib/gui/LiveTools.svelte';
	import QuickReference from '$lib/gui/QuickReference.svelte';
	import PrepRecap from '$lib/gui/PrepRecap.svelte';
	import ReconnectStatus from '$lib/gui/ReconnectStatus.svelte';
	import LiveSessionStatus from '$lib/gui/LiveSessionStatus.svelte';

	// SES-009 / SES-012: the Session section's PREP / RECAP + CAMPAIGN CALENDAR CONTINUITY surface. The DM
	// maintains the campaign calendar + current date and LINKS dates to notes (by reference; a hidden/
	// deleted target degrades — no leak), then runs the PREP (forward) / RECAP (backward) workflows that
	// GATHER unresolved threads, recent changes, handout outcomes, combat summaries, and continuity prompts
	// as a PURE DERIVATION over the existing sources — no AI. The digest is DM-only (a non-DM sees nothing).
	//
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
	//
	// SES-004 / COLLAB-007 / COLLAB-012: the Session section's HANDOUT + PLAYER GROUP surface. The DM
	// delivers handouts/images/notes/map-fragments/ciphers/rumors to selected recipients (or PLAYER
	// GROUPS) with per-recipient delivered/opened status and revocation; a recipient confirms receipt.
	// PLAYER GROUPS are DELIVERY/PROJECTION TARGETS ONLY — membership grants no visibility or write
	// permission (the Processing Core enforces this; the group surface is DM-only).
	//
	// COLLAB-002 / COLLAB-013: the participant RECONNECT + CATCH-UP surface. On reconnect (or a mobile
	// device waking from sleep/backgrounding) the Processing Core re-evaluates the participant's CURRENT
	// role/visibility/grants and computes the catch-up they may receive — in dependency order, never the
	// cached one — and DISABLES durable actions until they are provably caught up. DM-only content never
	// enters the participant's catch-up stream (filtered at the source). The panel is participant-only.
	//
	// COLLAB-003 / COLLAB-004: the participant LIVE SESSION STATE + PRESENCE surface. Live session updates
	// (combat, dice, timers, handouts, visible map updates) are shared near-real-time; the surface shows
	// the participant's live/syncing/stale/reconnecting status (so a behind view is marked stale) and the
	// ephemeral presence of co-participants, projected fail-closed by the Processing Core (a participant the
	// viewer may not see is never listed; presence never persists or replays as history). Participant-only.
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
	<PlayerGroups />
	<HandoutDelivery />
	<LiveSessionStatus />
	<ReconnectStatus />
	<LiveTools />
	<QuickReference />
	<PrepRecap />
</section>

<style>
	.meta {
		color: var(--color-text-muted, #666);
	}
</style>
