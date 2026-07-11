import type { CoreStateSlice } from '../commands/types';
import type { ActorId, SceneId } from '../state/ids';
import type { ActorRole } from '../state/permission-state';
import { hasDmAuthority } from '../state/permission-state';
import type { SessionWorkflowState } from '../state/session-state';
import { getCombatTrackerForActor } from './combat-tracker-view';
import { getSessionAudioView } from './session-audio-query';
import { getPlayerViewForActor, type PlayerViewQueryResult, type SceneQueryOptions } from './scene';

/**
 * UX-CMD-003 / UX-CMD-012 — THE single viewer-gated read model for the Command Center HOME surface.
 *
 * The home aggregates campaign-wide live-play state (session phase, combat turn, connected players,
 * audio) and decides which DASHBOARD an actor receives. Because the home summarizes across the
 * campaign, it is the product's single most dangerous leak surface: a player/observer must NEVER learn
 * — via a status cell, a count, a turn name, or the presence of the DM dashboard at all — that hidden
 * DM-only content exists.
 *
 * This module is that single choke point. Every potentially-sensitive home field is routed through a
 * viewer-gated function here, fail-closed:
 *
 *   - {@link getSessionStatusStrip} builds the glanceable strip from ALREADY-FILTERED Processing-Core
 *     read models: the combat TURN comes from `getCombatTrackerForActor` (a hidden active combatant
 *     yields no name to a non-DM), the AUDIO cell from `getSessionAudioView` (a participant only ever
 *     sees the player-safe track), and the PLAYERS roster cell is DM-ONLY (`null` for participants) so a
 *     connected-count never reveals the table roster to a player (anti-pattern 10.7).
 *   - {@link resolveCommandCenterHome} decides the home by ROLE: a DM gets the full dashboard pointer; a
 *     player/observer gets ONLY their own player-view scene (via `getPlayerViewForActor`, already
 *     visibility-filtered) plus the player-safe strip — never the DM dashboard, its presets, its widget
 *     library, its player-view controller, or the DM home scene's title/widgets.
 *
 * Pure + deterministic: a function of (state, actor) only. No GUI, no storage, no clock.
 */

/** The semantic tone of a session phase — encoded redundantly with the text label (never colour-only). */
export type SessionPhaseTone = 'idle' | 'prep' | 'live' | 'paused' | 'ending' | 'archived';

const PHASE_PRESENTATION: Record<
	SessionWorkflowState,
	{ label: string; tone: SessionPhaseTone; attention: boolean }
> = {
	idle: { label: 'Idle', tone: 'idle', attention: false },
	prep: { label: 'Prep', tone: 'prep', attention: false },
	active: { label: 'Active', tone: 'live', attention: false },
	// Paused requests glanceable ATTENTION; the GUI honours `prefers-reduced-motion` and substitutes a
	// static state for the pulse (UX-CMD-003 §states / §9.7).
	paused: { label: 'Paused', tone: 'paused', attention: true },
	ending: { label: 'Ending', tone: 'ending', attention: false },
	recap: { label: 'Recap', tone: 'archived', attention: false },
	archived: { label: 'Archived', tone: 'archived', attention: false },
};

/** Session-phase cell (UX-CMD-003 §6.1): pill text label + semantic tone + attention flag. */
export interface StatusStripPhaseCell {
	phase: SessionWorkflowState;
	label: string;
	tone: SessionPhaseTone;
	/** True only for `paused`; the GUI may pulse it (reduced-motion: static). */
	attention: boolean;
}

/** Current-turn cell: the viewer-filtered active combatant, or a non-leaking placeholder. */
export interface StatusStripTurnCell {
	/** True only while combat is running. */
	inCombat: boolean;
	/** The active combatant's name AS VISIBLE TO THIS VIEWER, or null (hidden / no combat). */
	activeName: string | null;
	initiative: number | null;
	round: number | null;
	/** Glanceable label: the active combatant's name, or "No combat" / "Combat in progress". */
	label: string;
}

/** Players cell — present ONLY for the DM; `null` for a participant so the roster never leaks. */
export interface StatusStripPlayersCell {
	connectedCount: number;
	label: string;
}

/** Audio cell: whether session audio is playing + a SAFE label (source id for the DM, generic for a participant). */
export interface StatusStripAudioCell {
	playing: boolean;
	label: string;
	/** The track source id — DM-only; `null` for a participant (never the DM's audio config). */
	sourceId: string | null;
}

/** The glanceable session status strip, already filtered for the requesting actor (UX-CMD-003). */
export interface SessionStatusStrip {
	kind: 'status-strip';
	viewerRole: ActorRole;
	/** True when the viewer is an Observer (drives the "Observer mode" label, UX-CMD-012). */
	observerMode: boolean;
	phase: StatusStripPhaseCell;
	turn: StatusStripTurnCell;
	/** DM-only roster cell; `null` for players/observers (no operational-info leak, anti-pattern 10.7). */
	players: StatusStripPlayersCell | null;
	audio: StatusStripAudioCell;
}

export type SessionStatusStripResult = SessionStatusStrip | { kind: 'unknown-actor' };

/**
 * UX-CMD-003 — build the glanceable session status strip for the requesting actor, fail-closed. Every
 * cell is derived from an already-actor-filtered Processing-Core read model, so the strip cannot reveal
 * a hidden combatant, the DM's audio config, or (for a participant) the table roster.
 */
export function getSessionStatusStrip(
	state: CoreStateSlice,
	actorId: ActorId,
): SessionStatusStripResult {
	const actor = state.permissions.actors[actorId];
	if (!actor) return { kind: 'unknown-actor' };
	const isDm = hasDmAuthority(actor.role);

	const phasePresentation = PHASE_PRESENTATION[state.session.workflow];
	const phase: StatusStripPhaseCell = { phase: state.session.workflow, ...phasePresentation };

	// TURN — read the ACTOR-FILTERED combat tracker: for a non-DM viewer a hidden active combatant is
	// not in `activeCombatantId`, so the strip never names it (SES-002 / UX-CMD-003 no-leak).
	const combat = getCombatTrackerForActor(state.session.combat, state.permissions, actorId);
	const inCombat = combat.status === 'running';
	const active = combat.activeCombatantId
		? (combat.combatants.find((entry) => entry.id === combat.activeCombatantId) ?? null)
		: null;
	const turn: StatusStripTurnCell = {
		inCombat,
		activeName: active ? active.name : null,
		initiative: active ? active.statBlock.initiative : null,
		round: inCombat ? combat.round : null,
		label: active ? active.name : inCombat ? 'Combat in progress' : 'No combat',
	};

	// PLAYERS — DM-only. A participant gets `null` so a connected-count never reveals the table roster.
	const players: StatusStripPlayersCell | null = isDm
		? ((): StatusStripPlayersCell => {
				const connectedCount = Object.values(state.permissions.actors).filter(
					(participant) => !hasDmAuthority(participant.role),
				).length;
				return {
					connectedCount,
					label: `${connectedCount} player${connectedCount === 1 ? '' : 's'}`,
				};
			})()
		: null;

	// AUDIO — the per-actor session-audio view: a participant only ever receives the player-safe track,
	// never the DM's source config. The strip shows the source id to the DM and a generic label otherwise.
	const audioView = getSessionAudioView(
		state.audio,
		state.session.audioPlayback,
		state.permissions,
		actorId,
	);
	const audio: StatusStripAudioCell = audioView.track
		? {
				playing: true,
				label: isDm ? audioView.track.sourceId : 'Playing',
				sourceId: isDm ? audioView.track.sourceId : null,
			}
		: { playing: false, label: 'Silent', sourceId: null };

	return {
		kind: 'status-strip',
		viewerRole: actor.role,
		observerMode: actor.role === 'observer',
		phase,
		turn,
		players,
		audio,
	};
}

/**
 * The role-differentiated Command Center home (UX-CMD-012):
 *
 *   - `dm` — the full DM dashboard. The GUI renders the spatial command surface; this view only carries
 *     the home-scene pointer + the (DM) status strip, so the dashboard data is never computed for a
 *     non-DM actor.
 *   - `participant` — a player or observer. Carries ONLY their own player-view scene (already
 *     visibility-filtered by `getPlayerViewForActor`) + the player-safe status strip + flags. The DM
 *     dashboard, its controls, and the DM home scene are entirely absent — there is no read-only DM view.
 *   - `unknown-actor` — fail-closed for an actor the vault does not know.
 */
export type CommandCenterHomeView =
	| {
			kind: 'dm';
			actorId: ActorId;
			homeSceneId: SceneId | null;
			statusStrip: SessionStatusStrip;
	  }
	| {
			kind: 'participant';
			actorId: ActorId;
			role: 'player' | 'observer';
			displayName: string;
			/** True for an Observer: the player canvas is read-only with no interactive controls. */
			readOnly: boolean;
			/** True for an Observer: the "Observer mode" label is shown (UX-CMD-012 AC3). */
			observerMode: boolean;
			statusStrip: SessionStatusStrip;
			/** The participant's OWN assigned scene, already visibility-filtered (never DM-only data). */
			playerView: PlayerViewQueryResult;
	  }
	| { kind: 'unknown-actor' };

/**
 * UX-CMD-012 — resolve which home an actor receives. This is the single role gate for the `/` route:
 * the GUI branches on `kind` and, for a participant, renders ONLY `playerView` + the player-safe strip,
 * so a player/observer can never see the DM dashboard or any DM-only content/count/title.
 */
export function resolveCommandCenterHome(
	state: CoreStateSlice,
	actorId: ActorId,
	options: Omit<SceneQueryOptions, 'projectionScope'> = {},
): CommandCenterHomeView {
	const actor = state.permissions.actors[actorId];
	if (!actor) return { kind: 'unknown-actor' };

	const statusStrip = getSessionStatusStrip(state, actorId);
	if (statusStrip.kind !== 'status-strip') return { kind: 'unknown-actor' };

	if (hasDmAuthority(actor.role)) {
		return {
			kind: 'dm',
			actorId: actor.id,
			homeSceneId: state.commandCenter.homeSceneId,
			statusStrip,
		};
	}

	// A player/observer home is their OWN player-view scene — never the DM dashboard. The summary is
	// produced by the actor-filtered Processing-Core read model, so it can only contain content the
	// Core already cleared for delivery to this participant.
	const playerView = getPlayerViewForActor(
		state.scenes,
		state.permissions,
		state.session,
		actorId,
		options,
	);
	// Reached only for a non-elevated actor (dm / co-dm returned above): narrow to the participant roles.
	const participantRole: 'player' | 'observer' = actor.role === 'observer' ? 'observer' : 'player';
	return {
		kind: 'participant',
		actorId: actor.id,
		role: participantRole,
		displayName: actor.displayName,
		readOnly: participantRole === 'observer',
		observerMode: participantRole === 'observer',
		statusStrip,
		playerView,
	};
}
