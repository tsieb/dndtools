<script lang="ts">
	import CombatTracker from '$lib/gui/CombatTracker.svelte';
	import EncounterBuilder from '$lib/gui/EncounterBuilder.svelte';
	import DiceTools from '$lib/gui/DiceTools.svelte';
	import HandoutDelivery from '$lib/gui/HandoutDelivery.svelte';
	import AudioPlayback from '$lib/gui/AudioPlayback.svelte';
	import PlayerGroups from '$lib/gui/PlayerGroups.svelte';
	import LiveTools from '$lib/gui/LiveTools.svelte';
	import QuickReference from '$lib/gui/QuickReference.svelte';
	import PrepRecap from '$lib/gui/PrepRecap.svelte';
	import ReconnectStatus from '$lib/gui/ReconnectStatus.svelte';
	import LiveSessionStatus from '$lib/gui/LiveSessionStatus.svelte';
	import PlayerViewAccess from '$lib/gui/PlayerViewAccess.svelte';
	import SessionRecoveryGate from '$lib/gui/ux-ses/SessionRecoveryGate.svelte';
	import ToastStack from '$lib/gui/ux-ses/ToastStack.svelte';
	import {
		SessionToastStore,
		provideSessionToasts,
	} from '$lib/gui/ux-ses/session-toasts.svelte';

	// UX-SES-017: the Session route owns ONE toast queue for the async action model (undo / retry /
	// milestone); session tools push into it via context and the stack renders fixed at the corner.
	const toasts = provideSessionToasts(new SessionToastStore());

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
	//
	// COLLAB-005 / COLLAB-011: the participant PLAYER VIEW + OBSERVER ACCESS surface. The DM projects
	// DIFFERENT player-view subsets to DIFFERENT players during one session; each participant sees ONLY
	// their own assigned subset (actor-filtered in the Processing Core). Observers join as READ-ONLY
	// participants with access only to explicitly shared scenes, no character data, and no write controls.
	// The surface renders the participant's own filtered view + (for an observer) the read-only shared-scene
	// list; observer write commands are rejected before mutation by the core. Participant-only.
</script>

<section data-testid="session-view" aria-label="Session" class="session-view">
	<p class="meta">
		Run the live session: build encounters, run combat, and roll dice or draw tables. The DM builds
		and runs combat and draws session assets; players roll and see the live state filtered to what
		they may see.
	</p>

	<!-- UX-SES-002: restart-during-live-session recovery — a full-restore confirmation strip, or the
	     MODAL partial-restore prompt that locks every session tool until the DM decides. -->
	<SessionRecoveryGate />

	<!-- Combat is the section's single primary focus (accent hero); the build/dice tools and the
	     status strips read as calmer secondary content below it. Combat is lifted above the encounter
	     builder to match the mockup's "Run combat" / "Build encounter" order. -->
	<CombatTracker />
	<EncounterBuilder />
	<DiceTools />
	<PlayerGroups />
	<HandoutDelivery />
	<AudioPlayback />
	<PlayerViewAccess />
	<LiveSessionStatus />
	<ReconnectStatus />
	<LiveTools />
	<QuickReference />
	<PrepRecap />
</section>

<!-- UX-SES-017: the session toast stack (undo / retry / milestone), fixed at the viewport corner. -->
<ToastStack store={toasts} />

<style>
	/* The session route stacks one accent hero (combat) above a calm column of secondary tool and
	   status cards. Each child component owns its own card surface; the route sets the vertical
	   rhythm + reading width so the hierarchy reads as one composed section, not a flat stack. */
	.session-view {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.session-view > .meta {
		max-width: 60ch;
		margin: 0;
		color: var(--color-text-secondary);
		line-height: var(--leading-relaxed);
	}
</style>
