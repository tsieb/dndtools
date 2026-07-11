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
	listScenesForActor,
	hasDmAuthority,
	resourcesOf,
	type ActorId,
	type CoreStateSlice,
	type CommandCenterHomeView,
	type PartyOverview,
	type CharacterView,
	type CombatTrackerView,
	type DiceRollView,
	type JournalEntryView,
	type ContentItemView,
	type SceneListEntry,
} from '@dndtools/core';
import { resolveProjectedMapForViewer, type ProjectedMapInfo } from '../app/projectedMap';

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
	/**
	 * The map actively projected TO THIS VIEWER (`session.set-active-map` + `session.project-active-map`),
	 * or null. This is the ONLY path a raster asset id may take into a player view-model: the resolver
	 * is gated on the viewer's own delivery record, so a non-projected map's raster reference (and
	 * therefore its bytes) can never reach a player device. Metadata only — bytes resolve on the
	 * rendering device through the content-addressed store, and only for ids this gate admitted.
	 */
	projectedMap: ProjectedMapInfo | null;
	displayName: string;
	/** The role the Core resolved for this viewer (`player` | `observer` | `co-dm`) — drives the
	 *  tier gate. A `co-dm` unlocks the elevated tier and carries the {@link ElevatedData} payload. */
	role: 'player' | 'observer' | 'co-dm';
	/**
	 * Present ONLY for a `co-dm` viewer (the elevated seat): DM-grade read models that a player/observer
	 * snapshot never carries. Built through the SAME actor-filtered queries, so it is still safe BY
	 * CONSTRUCTION — a co-DM legitimately sees dm-only scenes, hidden combatants, and the creature roster.
	 * `null` for every non-elevated viewer, so the wire never leaks elevated content to a player.
	 */
	elevated: ElevatedData | null;
}

/** The Co-DM-only elevated read models. Every field is an actor-filtered query result for the co-DM. */
export interface ElevatedData {
	/** Every scene the co-DM may see (INCLUDING dm-only) — the Atlas/Maps panel. */
	scenes: SceneListEntry[];
	/** The full combat tracker (hidden combatants + full stat blocks visible) — the Combat assist panel. */
	combat: CombatTrackerView;
	/** The DM's creature/NPC roster the co-DM may see (non-PC characters) — the Bestiary panel. */
	bestiary: CharacterView[];
}

/**
 * Build the player-safe view-model for `viewer` from the authoritative campaign `state`. This is the
 * ONE serialization surface the host sends over the wire and the one PlayerView renders — reused so the
 * local and replicated code paths can never diverge. Reads exclusively through the actor-filtered query
 * layer, so the result carries only content `viewer` may see.
 */
export function buildPlayerData(state: CoreStateSlice, viewer: ActorId): PlayerData {
	const actor = state.permissions.actors[viewer];
	const role: 'player' | 'observer' | 'co-dm' =
		actor?.role === 'co-dm' ? 'co-dm' : actor?.role === 'observer' ? 'observer' : 'player';

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

	// ELEVATED — only a co-DM (dm-authority) carries the elevated read models. Built through the same
	// actor-filtered queries, so it is safe by construction; `null` for every player/observer.
	const elevated: ElevatedData | null =
		role === 'co-dm' && hasDmAuthority(actor?.role)
			? {
					scenes: listScenesForActor(state.scenes, state.permissions, viewer),
					combat,
					bestiary: listCharactersForActor(state.characters, state.permissions, viewer).filter(
						(c) => c.kind !== 'pc',
					),
				}
			: null;

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
		projectedMap: resolveProjectedMapForViewer(state, viewer),
		displayName: home.kind === 'participant' ? home.displayName : (actor?.displayName ?? 'Player'),
		role,
		elevated,
	};
}
