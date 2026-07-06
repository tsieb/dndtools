import {
	resolveCommandCenterHome,
	advancementStateOf,
	getPartyOverviewForActor,
	getCharacterForActor,
	getCharacterJournalForActor,
	getContentItemsForActor,
	getCombatTrackerForActor,
	getDiceHistoryForActor,
	listCharactersForActor,
	resourcesOf,
	type ActorId,
	type CoreStateSlice,
	type CommandCenterHomeView,
	type PartyOverview,
	type CharacterView,
	type DiceRollView,
	type JournalEntryView,
	type ContentItemView,
} from '@dndtools/core';

/**
 * PLAYER VIEW-MODEL — the single, player-safe, JSON-serializable snapshot the P2P host replicates to a
 * remote player, and the exact shape `PlayerView` renders.
 *
 * WHY view-models, not raw operations: the Processing Core has no generic op→state applier, and op
 * `value` payloads are heterogeneous (a full entity, a sub-field, or a synthetic descriptor), so a peer
 * cannot faithfully rebuild `CoreStateSlice` from a filtered op stream. Instead the DM device (which
 * already holds the authoritative, materialized state) computes this view-model THROUGH THE ACTOR-FILTERED
 * QUERY LAYER and sends the result. Every field here is produced by a `*ForActor` query that internally
 * runs the visibility engine — so the snapshot is player-safe BY CONSTRUCTION (hidden content never
 * enters it; there is nothing to "hide in the UI"). This is the same computation `PlayerView` performed
 * inline; lifting it here lets the local (DM preview / offline) path and the remote (joined) path share
 * one shape.
 *
 * Pure + deterministic over `(state, viewer)`. No DOM/storage/network.
 */
export interface PlayerData {
	home: CommandCenterHomeView;
	live: boolean;
	sceneName: string | null;
	turnOrder: {
		id: string;
		name: string;
		init: number | null;
		hp: number | null;
		maxHp: number | null;
		kind: string;
		active: boolean;
	}[];
	round: number | null;
	activeName: string | null;
	pc: CharacterView | null;
	pcId: string | null;
	/** The PC's real level from the CHAR-009 advancement model (null without a PC). */
	level: number | null;
	resources: ReturnType<typeof resourcesOf> | null;
	party: PartyOverview;
	journal: JournalEntryView[];
	handouts: ContentItemView[];
	/** The actor-filtered SHARED session roll log (own + session-visible rolls), oldest-first. */
	diceRolls: DiceRollView[];
	/** Whether the Session workflow is `active` — the Core's gate for `dice.roll`. */
	sessionActive: boolean;
	displayName: string;
	/** The role the Core resolved for this viewer (`player` | `observer`) — drives the tier gate. */
	role: 'player' | 'observer';
}

/**
 * Build the player-safe view-model for `viewer` from the authoritative campaign `state`. This is the
 * ONE serialization surface the host sends over the wire and the one PlayerView renders — reused so the
 * local and replicated code paths can never diverge. Reads exclusively through the actor-filtered query
 * layer, so the result carries only content `viewer` may see.
 */
export function buildPlayerData(state: CoreStateSlice, viewer: ActorId): PlayerData {
	const actor = state.permissions.actors[viewer];
	const role: 'player' | 'observer' = actor?.role === 'observer' ? 'observer' : 'player';

	const home = resolveCommandCenterHome(state, viewer, { widgetPackages: state.widgets });
	const strip = home.kind === 'participant' || home.kind === 'dm' ? home.statusStrip : null;
	const playerView = home.kind === 'participant' ? home.playerView : null;
	const sceneName = playerView && playerView.kind === 'assigned' ? playerView.name : null;
	const live = strip?.phase.tone === 'live' || sceneName !== null;

	const combat = getCombatTrackerForActor(state.session.combat, state.permissions, viewer);
	const turnOrder =
		combat.status === 'running'
			? combat.combatants.map((c) => ({
					id: c.id,
					name: c.name,
					init: c.statBlock.initiative,
					hp: c.resources?.hp ?? null,
					maxHp: c.resources?.maxHp ?? null,
					kind: c.kind,
					active: c.isActive,
				}))
			: [];

	const pcs = listCharactersForActor(state.characters, state.permissions, viewer).filter(
		(c) => c.kind === 'pc',
	);
	const chosen = pcs[0] ?? null;
	const pc = chosen
		? getCharacterForActor(state.characters, state.permissions, viewer, chosen.id)
		: null;
	const record = chosen ? state.characters.characters[chosen.id] : undefined;
	const resources = record ? resourcesOf(record) : null;
	const journal = chosen
		? getCharacterJournalForActor(state.characters, state.permissions, viewer, chosen.id).entries
		: [];
	const party = getPartyOverviewForActor(state.characters, state.permissions, viewer);
	const handouts = getContentItemsForActor(state.content, state.permissions, viewer);
	const dice = getDiceHistoryForActor(state.session, state.permissions, viewer);

	return {
		home,
		live: Boolean(live),
		sceneName,
		turnOrder,
		round: strip?.turn.round ?? null,
		activeName: strip?.turn.activeName ?? null,
		pc,
		pcId: chosen?.id ?? null,
		level: record ? advancementStateOf(record).level : null,
		resources,
		party,
		journal,
		handouts,
		diceRolls: dice.rolls,
		sessionActive: state.session.workflow === 'active',
		displayName: home.kind === 'participant' ? home.displayName : (actor?.displayName ?? 'Player'),
		role,
	};
}
