import { useMemo } from 'react';
import {
	EMPTY_PRESENCE_STATE,
	VAULT_OBJECT_SUBTYPE_KEY,
	WIDGET_QUERY_COLUMNS,
	decideCharacterDataRead,
	detectContinuityMentions,
	evaluateFormula,
	getActiveSystemForActor,
	getCalendarContextForActor,
	getCombatTrackerForActor,
	getContentItemsForActor,
	getDiceHistoryForActor,
	getHandoutsForActor,
	getPlayerViewForActor,
	getPrepRecapDigest,
	getQuickReferencePanelsForActor,
	getSceneForActor,
	getSessionRecapFeedForActor,
	hasDmAuthority,
	listCharactersForActor,
	listMapsForActor,
	listScenesForActor,
	listScreensForActor,
	listWidgetLibrary,
	partyRecordOf,
	projectSessionPresence,
	resourcesOf,
	restKindOfLedgerEntry,
	widgetQueryFormulaIdentifier,
	widgetTemplateReadsQueries,
	type Actor,
	type CharacterView,
	type CombatTrackerView,
	type CoreStateSlice,
	type PlatformProfileId,
	type Scene,
	type WidgetComputedFieldDefinition,
	type WidgetDataQueryDefinition,
	type WidgetDataQueryOptions,
	type WidgetTemplateKind,
	type WidgetDefinition,
} from '@dndtools/core';
import { listLocalVaults } from '../../platform/storage/coreStore';
import { widgetProfileForRuntime } from '../../platform/capabilities';
import { useRuntime } from '../../runtime/RuntimeContext';
import { useSession, type SessionContextValue } from '../../net/SessionContext';
import type { PeerPresenceEntry } from '../../net/messages';
import type { BoardWidget } from '../board-helpers';

/**
 * dataEnvironment — what a TEMPLATE widget is allowed to see (RC-WID-1.2).
 *
 * A `template` widget declares `dataQueries` (one of the named sources in
 * `WIDGET_DATA_QUERY_SOURCES`) and `computedFields`
 * instead of shipping code. This module is the ONLY place those declarations turn into values, and
 * it does so by calling the actor-filtered core reads (`*ForActor`) and rendering whatever they
 * return. It never reads a raw state slice and filters it itself: the core decides what a player
 * sees, so a template can no more leak a hidden character than the party screen can (Contract 3 /
 * CANVAS-009).
 *
 * On top of that filtering it enforces the declaration's OWN two gates, which the core queries know
 * nothing about:
 *
 * - `audience: 'dm'` — a query the package author marked as DM material yields no rows at all to a
 *   non-DM viewer, even when the underlying read would have returned some. Fail closed.
 * - `requiredCapability: 'manager'` — the same, for a query that declares it needs the campaign
 *   manager. `operator`/`viewer` are open to any known actor.
 *
 * A withheld query is not silently empty: it comes back with `withheld` set, so the template can say
 * "not shown here" rather than "nothing yet" — a false "nothing yet" is the dishonest failure this
 * repo forbids.
 *
 * It is a pure function of (state, actorId, definition, widget, host) so a fixture package can be
 * resolved in a unit test with no runtime, no DOM and no storage; `useWidgetTemplateData` is the thin
 * hook the render slot uses in the app.
 *
 * RC-WID-5.2 added the hub sources (screens, vault counts, party, campaign, dice history, handouts,
 * rollable tables, quick reference and the Session console's remaining rows). The rule did not
 * change: each one is a mapping over a `*ForActor` read, or over records for ids such a read has
 * just returned. Where the core read is DM-only (quick reference, the digest, the widget library),
 * a player gets the empty result that read gives them, not a second, looser one built here. The
 * live-table sources are the exception that no core read answers: they read the P2P table the host
 * app passes in, and project it for the viewer exactly as the host's presence broadcast does.
 *
 * RC-WID-6.5 added declarative query OPTIONS (character kind, tag, scene membership, status, sort,
 * limit). Every filter runs over the views the source's `*ForActor` read already returned, so an
 * option can only take rows away: a player's "NPCs" are the NPCs that player may see, a tag the read
 * withheld from them never matches, and "on the active screen" asks the actor-scoped scene read
 * which widgets they receive there.
 */

/** One normalized row. Every template reads this shape, whatever source produced it. */
export interface WidgetDataRow {
	id: string;
	/** The row's name — the only field a template is guaranteed to have. */
	primary: string;
	/** A supporting detail line (HP, timestamp, workflow phase…). */
	secondary?: string;
	/** A short trailing tag: visibility, kind, status. */
	meta?: string;
	/** A numeric measure, when the source has one (HP, counts). Drives Chart/Tracker. */
	value?: number;
	/** The measure's ceiling, when there is one (max HP). */
	max?: number;
	/** The current/active row — the combatant whose turn it is, the active scene. */
	active?: boolean;
	/** RC-WID-5.2 — the initials an avatar draws for this row (party members, table presence). */
	avatar?: string;
	/**
	 * RC-WID-5.2 — a screen's thumbnail, as the scene's background token (`paper`, `parchment`,
	 * `dark`, `grid`). Screens carry no image, so a card draws the thumbnail from the token.
	 */
	thumbnail?: string;
	/**
	 * RC-WID-5.2 — the row's visibility level (`dm-only`, `shared`, `player-visible`), kept apart from
	 * `meta`/`active` so a screen can be live AND private and a template can still tell which.
	 * RC-WID-6.5 — every source whose `meta` names a visibility sets this too, and `meta` then carries
	 * the app's word for it ("DM only", "Shared", "Player visible"), never the enum value.
	 */
	visibility?: Scene['visibility'];
}

/**
 * RC-WID-5.2 — one participant of this device's live table, as the P2P transport knows them. On the
 * hosting DM's device that is the host's peer list, invited-but-unconnected peers included; on a
 * joined player's device it is the roster the host already projected for that player.
 */
export interface WidgetLivePeer {
	/** The transport's peer id on the host; the actor id on a joined device, which has no peer ids. */
	peerId: string;
	actorId: string;
	displayName: string;
	/** Unknown on a joined device: the host's presence broadcast does not carry roles. */
	role: 'player' | 'observer' | 'co-dm' | null;
	connected: boolean;
	status: 'online' | 'away';
	hand: boolean;
	ready: boolean;
}

/** RC-WID-5.2 — this device's live table: its P2P session role and who is on it. */
export interface WidgetLiveTable {
	role: 'solo' | 'host' | 'joined';
	peers: readonly WidgetLivePeer[];
}

/**
 * RC-WID-5.2 — what only the host app knows. Both values are device-local, so they come in as an
 * argument and the resolver stays a pure function of what it is given.
 */
export interface WidgetHostContext {
	/** The vault's name from this device's vault catalog. Absent or blank reads as "Your campaign". */
	campaignName?: string | null;
	/** The platform profile the widget library judges availability for. Defaults to `web`. */
	profileId?: PlatformProfileId;
	/**
	 * This device's live table, when the caller can see the P2P transport. Absent means "not known
	 * here", which the live-table sources say rather than claiming nobody is connected.
	 */
	table?: WidgetLiveTable;
}

/** Why a query returned nothing on purpose. `null` means the query really ran. */
export type WidgetQueryWithheldReason = 'audience' | 'capability';

export interface WidgetQueryResult {
	/** The declaration's id, so a computed field can name its inputs. */
	id: string;
	/**
	 * RC-WID-6.5 — true only for {@link sampleTemplateData}'s made-up rows, which the builder preview
	 * draws (labelled "Sample data") while the draft declares no query. Never set on a real query.
	 */
	sample?: boolean;
	label: string;
	source: WidgetDataQueryDefinition['source'];
	rows: WidgetDataRow[];
	/** A summary line the source knows and the rows do not (e.g. "Round 2 · turn 1 of 4"). */
	header: string | null;
	/** What to say when there are no rows and nothing was withheld. Sentence case. */
	emptyLabel: string;
	withheld: WidgetQueryWithheldReason | null;
}

export interface WidgetComputedValue {
	id: string;
	label: string;
	valueType: WidgetComputedFieldDefinition['valueType'];
	value: string | number | boolean | unknown[] | Record<string, unknown>;
	/** The value formatted for display, so every template prints a computed field the same way. */
	display: string;
}

export interface WidgetTemplateData {
	queries: WidgetQueryResult[];
	computed: WidgetComputedValue[];
	/**
	 * The query a single-source template draws: the first declared one. Null when the definition
	 * declares no queries at all (a template widget that is pure configuration, e.g. a message card).
	 */
	primary: WidgetQueryResult | null;
	/** Whether the viewing actor holds DM authority. Templates use it for wording, never for filtering. */
	isDm: boolean;
}

/** Copy for a query this viewer is not the audience for. Honest, and not an error. */
export const WITHHELD_COPY: Record<WidgetQueryWithheldReason, string> = {
	audience: 'DM only — not shown for this viewer.',
	capability: 'Needs campaign manager access.',
};

const EMPTY_DATA: WidgetTemplateData = { queries: [], computed: [], primary: null, isDm: false };

function row(
	id: string,
	primary: string,
	rest: Omit<WidgetDataRow, 'id' | 'primary'> = {},
): WidgetDataRow {
	return { id, primary, ...rest };
}

/**
 * RC-WID-6.5 — the app's words for a visibility level, the ones the screen list and the map use
 * (`common.visibility.*`). `meta` is plain text every template prints as is, so it carries the word;
 * a localizing template reads `visibility` instead.
 */
export const VISIBILITY_WORD: Record<Scene['visibility'], string> = {
	'dm-only': 'DM only',
	shared: 'Shared',
	'player-visible': 'Player visible',
};

function isVisibilityLevel(value: unknown): value is Scene['visibility'] {
	return value === 'dm-only' || value === 'shared' || value === 'player-visible';
}

/** A row's visibility as both fields a template may read: the level and its word. */
function visibilityOf(level: string): Pick<WidgetDataRow, 'meta' | 'visibility'> {
	return isVisibilityLevel(level)
		? { meta: VISIBILITY_WORD[level], visibility: level }
		: { meta: level };
}

/** Preserve the party read's observer ceiling and ordering, using only redacted views. */
function visiblePartyMembers(state: CoreStateSlice, actorId: string): CharacterView[] {
	if (decideCharacterDataRead(state.permissions, actorId).kind !== 'granted') return [];
	const views = listCharactersForActor(state.characters, state.permissions, actorId);
	const byId = new Map(views.map((view) => [view.id, view]));
	const ordered: CharacterView[] = [];
	for (const id of partyRecordOf(state.characters).marchingOrder) {
		const view = byId.get(id);
		if (view) ordered.push(view);
		byId.delete(id);
	}
	return [...ordered, ...byId.values()];
}

/** CharacterView permits individual combat fields to be absent after DM-only redaction. */
function characterVitals(member: CharacterView, includeTemporary = false): string | undefined {
	const { hp, maxHp, tempHp, ac } = member.combat;
	const vitals: string[] = [];
	if (hp != null && maxHp != null) vitals.push(`HP ${hp} of ${maxHp}`);
	else if (hp != null) vitals.push(`HP ${hp}`);
	else if (maxHp != null) vitals.push(`Max HP ${maxHp}`);
	if (includeTemporary && tempHp != null && tempHp > 0) vitals.push(`${tempHp} temporary`);
	if (ac != null) vitals.push(`AC ${ac}`);
	return vitals.join(' · ') || undefined;
}

/** Whether any FILTER is set, so an empty result says "nothing matches" rather than "nothing yet". */
function narrows(options: WidgetDataQueryOptions | undefined): boolean {
	if (!options) return false;
	return (
		options.characterKinds !== undefined ||
		options.tag !== undefined ||
		options.sceneMembership !== undefined ||
		options.status !== undefined
	);
}

/** A tags value as stored in a note's or object's `tags` field: a list, or one comma-separated line. */
function tagsOfField(value: unknown): string[] {
	if (Array.isArray(value)) return value.filter((tag): tag is string => typeof tag === 'string');
	if (typeof value === 'string') return value.split(',');
	return [];
}

/** Case- and `#`-insensitive, so `#Undead`, `undead` and ` Undead ` are one tag. */
function normalizeTag(tag: string): string {
	return tag.trim().replace(/^#/, '').toLocaleLowerCase();
}

function hasTag(tags: readonly string[], wanted: string | undefined): boolean {
	if (wanted === undefined) return true;
	const needle = normalizeTag(wanted);
	return tags.some((tag) => normalizeTag(tag) === needle);
}

/**
 * The entity ids bound to a widget on the active screen, as THIS ACTOR receives that screen: the
 * actor-scoped scene read decides whether they may open it at all and which of its widgets reach
 * them, so a player is never told what sits on a screen, or a section of one, that they cannot see.
 */
function activeScreenBindings(state: CoreStateSlice, actor: Actor): ReadonlySet<string> {
	const activeId = state.session.activeSceneId;
	if (!activeId) return new Set();
	const summary = getSceneForActor(state.scenes, state.permissions, actor.id, activeId, {
		widgetPackages: state.widgets,
	});
	if ('kind' in summary) return new Set();
	const ids = new Set<string>();
	for (const payload of summary.widgets) {
		if (payload.kind !== 'available' && payload.kind !== 'degraded') continue;
		const entityId = payload.widget.binding?.source.entityId;
		if (entityId) ids.add(entityId);
	}
	return ids;
}

/**
 * HP status from what the viewer may see. A character or combatant whose HP the read withheld has
 * no status, so it matches no status filter rather than being placed by a value the viewer lacks.
 */
function hpStatusOf(
	hp: number | null | undefined,
	maxHp: number | null | undefined,
): WidgetDataQueryOptions['status'] | null {
	if (hp == null) return null;
	if (hp <= 0) return 'down';
	if (maxHp != null && maxHp > 0 && hp <= maxHp / 2) return 'bloodied';
	return 'up';
}

/** RC-WID-6.5 — the character filters, over views the actor-scoped read already returned. */
function filterCharacters(
	state: CoreStateSlice,
	actor: Actor,
	members: CharacterView[],
	options: WidgetDataQueryOptions | undefined,
): CharacterView[] {
	if (!narrows(options)) return members;
	const kinds = options?.characterKinds;
	const membership = options?.sceneMembership;
	const inScope: ReadonlySet<string> | null =
		membership === 'active-scene'
			? activeScreenBindings(state, actor)
			: membership === 'in-combat'
				? new Set(
						getCombatTrackerForActor(state.session.combat, state.permissions, actor.id)
							.combatants.map((combatant) => combatant.characterId)
							.filter((id): id is string => id !== null),
					)
				: null;
	return members.filter(
		(member) =>
			(kinds === undefined || kinds.includes(member.kind)) &&
			(inScope === null || inScope.has(member.id)) &&
			(options?.status === undefined ||
				hpStatusOf(member.combat.hp, member.combat.maxHp) === options.status),
	);
}

/**
 * RC-WID-6.5 — the combatant filters. A combatant's kind is its character's kind when this viewer
 * may see that character, else the tracker's own NPC/monster word; a character row the viewer cannot
 * resolve matches no kind filter. Status reads the tracker's own flags, which are false for a
 * combatant whose vitals are withheld, and `resources` itself, which is null for one.
 */
function filterCombatants(
	state: CoreStateSlice,
	actorId: string,
	combatants: CombatTrackerView['combatants'],
	options: WidgetDataQueryOptions | undefined,
): CombatTrackerView['combatants'] {
	if (!narrows(options)) return combatants;
	const kinds = options?.characterKinds;
	const kindOfCharacter =
		kinds === undefined
			? null
			: new Map(
					listCharactersForActor(state.characters, state.permissions, actorId).map((view) => [
						view.id,
						view.kind,
					]),
				);
	return combatants.filter((combatant) => {
		if (kinds !== undefined) {
			const kind =
				(combatant.characterId ? kindOfCharacter?.get(combatant.characterId) : undefined) ??
				(combatant.kind === 'character' ? undefined : combatant.kind);
			if (kind === undefined || !kinds.includes(kind)) return false;
		}
		if (options?.status !== undefined) {
			const status = combatant.resources
				? combatant.isDefeated || combatant.isDying
					? 'down'
					: hpStatusOf(combatant.resources.hp, combatant.resources.maxHp)
				: null;
			if (status !== options.status) return false;
		}
		return true;
	});
}

/** RC-WID-6.5 — `sort` then `limit`, over the normalized rows any source produced. */
function orderRows(
	rows: WidgetDataRow[],
	options: WidgetDataQueryOptions | undefined,
): WidgetDataRow[] {
	if (!options || (options.sort === undefined && options.limit === undefined)) return rows;
	const sorted = rows.slice();
	if (options.sort === 'name') {
		sorted.sort((a, b) => a.primary.localeCompare(b.primary));
	} else if (options.sort === 'value-high' || options.sort === 'value-low') {
		const sign = options.sort === 'value-high' ? -1 : 1;
		// A row with no measure sorts last either way: it has nothing to rank by.
		sorted.sort((a, b) => {
			if (a.value === undefined || b.value === undefined) {
				return a.value === undefined ? (b.value === undefined ? 0 : 1) : -1;
			}
			return sign * (a.value - b.value);
		});
	}
	return options.limit === undefined ? sorted : sorted.slice(0, options.limit);
}

/**
 * Resolve ONE declared query against the actor-filtered core reads.
 *
 * Every branch calls a `*ForActor` query and maps its result; none of them touches a raw record.
 * `binding` is the one source that is per-INSTANCE rather than per-campaign: it describes the entity
 * the DM bound this widget to, and it reports the binding STATUS the board already derived rather
 * than re-deriving (and possibly disagreeing with) it.
 */
type ResolvedSource = { rows: WidgetDataRow[]; header: string | null; emptyLabel: string };

function resolveSource(
	state: CoreStateSlice,
	actor: Actor,
	query: WidgetDataQueryDefinition,
	widget: BoardWidget,
	host: WidgetHostContext,
): ResolvedSource {
	const actorId = actor.id;
	const options = query.options;
	switch (query.source) {
		case 'current-combatants': {
			const tracker = getCombatTrackerForActor(state.session.combat, state.permissions, actorId);
			const header =
				tracker.status === 'running'
					? `Round ${tracker.round} · turn ${tracker.turn + 1} of ${tracker.combatants.length}`
					: 'No combat running';
			const combatants = filterCombatants(state, actorId, tracker.combatants, options);
			return {
				header,
				emptyLabel: narrows(options)
					? 'No combatants match these filters.'
					: 'No combatants in the tracker.',
				rows: combatants.map((combatant) => {
					// `resources` is null for a combatant whose vitals are withheld from this viewer, so
					// the HP detail simply disappears rather than being reconstructed here.
					const detail: string[] = [];
					if (combatant.statBlock?.initiative != null) {
						detail.push(`Initiative ${combatant.statBlock.initiative}`);
					}
					if (combatant.resources) {
						detail.push(`HP ${combatant.resources.hp} of ${combatant.resources.maxHp}`);
					}
					return row(combatant.id, combatant.name, {
						secondary: detail.length > 0 ? detail.join(' · ') : undefined,
						meta: combatant.redacted ? 'Hidden' : undefined,
						value: combatant.resources?.hp,
						max: combatant.resources?.maxHp,
						active: combatant.isActive,
					});
				}),
			};
		}
		case 'visible-characters': {
			const members = filterCharacters(state, actor, visiblePartyMembers(state, actorId), options);
			return {
				header: null,
				emptyLabel: narrows(options)
					? 'No characters match these filters.'
					: 'No characters visible yet.',
				rows: members.map((member) =>
					row(member.id, member.name, {
						secondary: characterVitals(member),
						...visibilityOf(member.visibility),
						value: member.combat.hp,
						max: member.combat.maxHp,
					}),
				),
			};
		}
		case 'selected-scene': {
			const scenes = listScenesForActor(state.scenes, state.permissions, actorId).filter(
				(scene) => !scene.isTemplate && hasTag(scene.tags, options?.tag),
			);
			const activeId = state.session.activeSceneId;
			return {
				header: null,
				emptyLabel: options?.tag ? 'No scenes carry this tag.' : 'No scenes yet.',
				rows: scenes.map((scene) =>
					row(scene.id, scene.name, {
						secondary: scene.tags.join(', ') || undefined,
						...visibilityOf(scene.visibility),
						active: scene.id === activeId,
					}),
				),
			};
		}
		case 'session-state': {
			// Composed from reads that are already actor-safe: the workflow phase is campaign-wide, the
			// active scene is named ONLY when this actor may see it, and combat comes from the filtered
			// tracker. Nothing here can name a scene the viewer cannot open.
			const tracker = getCombatTrackerForActor(state.session.combat, state.permissions, actorId);
			const activeId = state.session.activeSceneId;
			const activeScene = activeId
				? (listScenesForActor(state.scenes, state.permissions, actorId).find(
						(scene) => scene.id === activeId,
					) ?? null)
				: null;
			return {
				header: null,
				emptyLabel: 'No session details yet.',
				rows: [
					row('workflow', 'Session', { secondary: state.session.workflow }),
					row('scene', 'Active scene', { secondary: activeScene?.name ?? 'None' }),
					row('combat', 'Combat', {
						secondary: tracker.status === 'running' ? `Round ${tracker.round}` : tracker.status,
						value: tracker.combatants.length,
					}),
				],
			};
		}
		case 'notes':
		case 'content-objects': {
			// The vault holds two content kinds; the declaration names which one it wants, so `notes`
			// and `content-objects` are the two halves rather than two names for the same list.
			const kind = query.source === 'notes' ? 'note' : 'object';
			// A tag is read off the item's `tags` field AS THIS VIEWER RECEIVED IT: a field the DM hid
			// from players is already gone from their view, so it can never match for them.
			const onScreen = options?.sceneMembership ? activeScreenBindings(state, actor) : null;
			const wanted = getContentItemsForActor(state.content, state.permissions, actorId).filter(
				(item) =>
					item.kind === kind &&
					hasTag(tagsOfField(item.fields.tags), options?.tag) &&
					(onScreen === null || onScreen.has(item.id)),
			);
			return {
				header: null,
				emptyLabel: narrows(options)
					? 'Nothing here matches these filters.'
					: query.source === 'notes'
						? 'No notes yet.'
						: 'No vault objects yet.',
				rows: wanted
					.slice()
					.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
					.map((item) => row(item.id, item.title, { secondary: item.updatedAt, meta: item.kind })),
			};
		}
		case 'maps': {
			const onScreen = options?.sceneMembership ? activeScreenBindings(state, actor) : null;
			const maps = listMapsForActor(state.maps, state.permissions, actorId).filter(
				(map) => onScreen === null || onScreen.has(map.id),
			);
			return {
				header: null,
				emptyLabel: onScreen ? 'No maps on the active screen.' : 'No maps yet.',
				rows: maps.map((map) =>
					row(map.id, map.name, {
						secondary: map.description || undefined,
						...visibilityOf(map.visibility),
					}),
				),
			};
		}
		case 'binding': {
			const ref = widget.bindingRef;
			if (!ref) return { rows: [], header: null, emptyLabel: 'No data source bound.' };
			// The binding's availability is the board's, verbatim: `status`/`statusNote` come from the
			// actor-scoped scene summary, so a bound-but-hidden entity reads as hidden here too instead
			// of the template inventing a second opinion about the same binding.
			return {
				header: widget.statusNote,
				emptyLabel: 'No data source bound.',
				rows: [row(ref.entityId, ref.entityId, { secondary: ref.entityType, meta: widget.status })],
			};
		}
		default:
			return resolveHubSource(state, actor, query, host);
	}
}

/** Two-letter initials, the same rule the DS `Avatar` draws from a name. */
function initialsOf(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((word) => word[0]?.toUpperCase() ?? '')
		.join('');
}

/** What a live-table source says when its caller passed no table: unknown, not empty. */
const TABLE_UNKNOWN = 'The live table is not available here.';

const PEER_ROLE_WORD: Record<NonNullable<WidgetLivePeer['role']>, string> = {
	player: 'Player',
	observer: 'Observer',
	'co-dm': 'Co-DM',
};

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

/** The vault objects of one subtype the actor may see (quests, factions, dice tables…). */
function objectsOfSubtype(state: CoreStateSlice, actorId: string, subtype: string) {
	return getContentItemsForActor(state.content, state.permissions, actorId).filter(
		(item) => item.kind === 'object' && item.fields[VAULT_OBJECT_SUBTYPE_KEY] === subtype,
	);
}

/**
 * Where a combatant's initiative came from, read off the actor-filtered encounter log: a `roll`
 * entry, or a DM reorder that carries a value. During a call (running, round 0) a character row
 * with neither still owes a roll. The same reading the Session console's initiative call makes.
 */
function initiativeSourceOf(
	tracker: CombatTrackerView,
	combatant: CombatTrackerView['combatants'][number],
	calling: boolean,
): 'awaiting' | 'rolled' | 'adjusted' | null {
	let source: 'rolled' | 'adjusted' | null = null;
	for (const entry of tracker.log) {
		if (entry.combatantId !== combatant.id) continue;
		if (entry.kind === 'roll') source = 'rolled';
		else if (entry.kind === 'combatant-reordered' && entry.delta !== null) source = 'adjusted';
	}
	if (source) return source;
	return calling && combatant.kind === 'character' ? 'awaiting' : null;
}

/**
 * RC-WID-5.2 — the hub sources. Kept apart from the eight original ones only so each switch stays
 * readable. Every branch maps an actor-scoped core read; DM-only reads are named as such.
 */
function resolveHubSource(
	state: CoreStateSlice,
	actor: Actor,
	query: WidgetDataQueryDefinition,
	host: WidgetHostContext,
): ResolvedSource {
	const { source, options } = query;
	const actorId = actor.id;
	const isDm = hasDmAuthority(actor.role);
	const live = state.session.workflow === 'active';
	switch (source) {
		case 'screens': {
			const screens = listScreensForActor(state.scenes, state.permissions, actorId, {
				commandCenter: state.commandCenter,
				session: state.session,
			}).filter((screen) => hasTag(screen.tags, options?.tag));
			return {
				header: null,
				emptyLabel: options?.tag ? 'No screens carry this tag.' : 'No screens yet.',
				rows: screens.map((screen) => {
					// The live flag needs a running session, not just a remembered scene id: a recovered
					// session restores the id into recap and must not read as live (SCREENS_PARITY CC-01).
					const isLive = live && screen.isLive;
					// Read off a screen the actor-scoped list just returned, so it describes only a screen
					// this viewer may already open.
					const background = state.scenes.scenes[screen.id]?.visualSettings.background;
					// Visibility and the live flag are two fields, not one marker: a private screen can be
					// live, and a template must still be able to say it is private.
					const detail = [
						screen.tags[0] ?? 'Screen',
						plural(screen.widgetCount, 'widget', 'widgets'),
					];
					if (isLive) detail.push('Live');
					return row(screen.id, screen.name, {
						secondary: detail.join(' · '),
						...visibilityOf(screen.visibility),
						value: screen.widgetCount,
						active: isLive,
						thumbnail: background,
					});
				}),
			};
		}
		case 'vault-counts': {
			// Counts of what THIS viewer may list. A player's count of NPCs is the NPCs they can see,
			// never the vault's total, so a number cannot reveal how much the DM holds back.
			const characters = listCharactersForActor(state.characters, state.permissions, actorId);
			const notes = getContentItemsForActor(state.content, state.permissions, actorId).filter(
				(item) => item.kind === 'note',
			);
			const kind = (wanted: string) => characters.filter((c) => c.kind === wanted).length;
			const counts: Array<[string, string, number]> = [
				['pcs', 'Player characters', kind('pc')],
				['npcs', 'NPCs', kind('npc')],
				['monsters', 'Monsters', kind('monster')],
				['sidekicks', 'Sidekicks', kind('sidekick')],
				['maps', 'Maps', listMapsForActor(state.maps, state.permissions, actorId).length],
				['notes', 'Notes', notes.length],
				['threads', 'Story threads', objectsOfSubtype(state, actorId, 'quest').length],
				['factions', 'Factions', objectsOfSubtype(state, actorId, 'faction').length],
			];
			return {
				header: null,
				emptyLabel: 'Nothing in the vault yet.',
				rows: counts.map(([id, label, count]) =>
					row(id, label, { secondary: String(count), value: count }),
				),
			};
		}
		case 'party': {
			const members = filterCharacters(
				state,
				actor,
				visiblePartyMembers(state, actorId).filter((member) => member.kind === 'pc'),
				options,
			);
			return {
				header: members.length > 0 ? `${members.length} in the party` : null,
				emptyLabel: narrows(options)
					? 'No party members match these filters.'
					: 'No player characters yet.',
				rows: members.map((member) => {
					return row(member.id, member.name, {
						secondary: characterVitals(member, true),
						meta: member.combat.conditions?.join(', ') || undefined,
						value: member.combat.hp,
						max: member.combat.maxHp,
						avatar: initialsOf(member.name),
					});
				}),
			};
		}
		case 'campaign': {
			const system = getActiveSystemForActor(state.systems, state.permissions, actorId);
			const activeId = state.session.activeSceneId;
			// Named only while the session is live AND this viewer may see that screen.
			const liveScreen =
				live && activeId
					? (listScenesForActor(state.scenes, state.permissions, actorId).find(
							(scene) => scene.id === activeId,
						) ?? null)
					: null;
			const date = getCalendarContextForActor(
				state.session,
				state.content,
				state.maps,
				state.permissions,
				actorId,
			).currentDate;
			return {
				header: null,
				emptyLabel: 'No campaign details yet.',
				rows: [
					row('name', 'Campaign', { secondary: host.campaignName?.trim() || 'Your campaign' }),
					row('system', 'Rules system', { secondary: system.activePackage.displayName }),
					row('live-screen', 'Live screen', {
						secondary: liveScreen?.name ?? 'None',
						active: liveScreen !== null,
					}),
					row('workflow', 'Session', { secondary: state.session.workflow, active: live }),
					row('date', 'Campaign date', { secondary: date?.display ?? 'No date set' }),
					row('viewer', 'Viewing as', { secondary: actor.displayName, meta: actor.role }),
				],
			};
		}
		case 'dice-history': {
			// `hiddenCount` is deliberately not surfaced: how many rolls a viewer cannot see is itself
			// something the DM did not choose to show.
			const history = getDiceHistoryForActor(state.session, state.permissions, actorId);
			return {
				header: null,
				emptyLabel: 'No rolls yet.',
				rows: history.rolls
					.slice()
					.sort((a, b) => b.rolledAt.localeCompare(a.rolledAt))
					.slice(0, 20)
					.map((roll) =>
						row(roll.id, roll.label ?? roll.expression, {
							secondary: `${roll.expression} · ${state.permissions.actors[roll.actorId]?.displayName ?? 'Someone'}`,
							meta: roll.visibility === 'dm-only' ? 'DM only' : undefined,
							value: roll.total,
						}),
					),
			};
		}
		case 'handouts': {
			const handouts = getHandoutsForActor(state.session, state.permissions, actorId);
			return {
				header: null,
				emptyLabel: 'No handouts yet.',
				rows: handouts.map((handout) =>
					row(handout.id, handout.title, {
						secondary: handout.updatedAt,
						meta: handout.acknowledged ? 'Acknowledged' : handout.handoutKind,
					}),
				),
			};
		}
		case 'rollable-tables': {
			const draws = getDiceHistoryForActor(state.session, state.permissions, actorId).rolls;
			return {
				header: null,
				emptyLabel: 'No rollable tables yet.',
				rows: objectsOfSubtype(state, actorId, 'dice-table').map((table) => {
					// The latest draw this viewer may see, out of the already-filtered roll history.
					const last = draws
						.filter((roll) => roll.tableItemId === table.id)
						.sort((a, b) => b.rolledAt.localeCompare(a.rolledAt))[0];
					return row(table.id, table.title, {
						secondary: last ? `Last draw: ${last.tableRowText ?? last.total}` : undefined,
						value: last?.tableRowNumber ?? undefined,
					});
				}),
			};
		}
		case 'quick-reference': {
			// DM-only in the core: a player receives no panels at all.
			const panels = getQuickReferencePanelsForActor(
				state.session,
				state.content,
				state.characters,
				state.permissions,
				actorId,
			);
			return {
				header: null,
				emptyLabel: 'Nothing pinned yet.',
				rows: panels.map((panel) =>
					row(panel.id, panel.label, {
						secondary: panel.kind,
						meta: panel.status === 'available' ? undefined : 'Unavailable',
					}),
				),
			};
		}
		case 'session-archives': {
			// The DM lists every archive (the Session console's own archive list); anyone else lists
			// only the archived sessions whose recap the core's recap feed delivers to them.
			const rows = isDm
				? Object.values(state.session.archives)
						.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt))
						.map((archive) =>
							row(archive.id, archive.title ?? 'Untitled session', {
								secondary: archive.archivedAt,
								meta: archive.recap ? 'Recap written' : undefined,
								active: archive.id === state.session.recapArchiveId,
							}),
						)
				: getSessionRecapFeedForActor(state.session, state.permissions, actorId)
						.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt))
						.map((entry) =>
							row(entry.archiveId, entry.title ?? 'Untitled session', {
								secondary: entry.archivedAt,
								meta: 'Recap written',
							}),
						);
			return { header: null, emptyLabel: 'No past sessions yet.', rows };
		}
		case 'continuity-digest': {
			// DM-only in the core: a non-DM digest is empty, so a player gets no prompts.
			const digest = getPrepRecapDigest(
				state.session,
				state.content,
				state.maps,
				state.characters,
				state.permissions,
				state.sync,
				actorId,
				state.session.workflow === 'recap' ? 'recap' : 'prep',
			);
			return {
				header: digest.dmOnly
					? plural(
							digest.recentChanges.length,
							'recent change to review',
							'recent changes to review',
						)
					: null,
				emptyLabel: 'Nothing to carry forward.',
				rows: digest.continuityPrompts.map((prompt) =>
					row(prompt.id, prompt.text, { meta: prompt.source }),
				),
			};
		}
		case 'rest-log': {
			// Read back from each character's expenditure ledger, but only for characters the
			// actor-scoped roster returned, so a rest never surfaces for a character this viewer
			// cannot see. The same reading as the Session console's "Rests this session".
			const rests = listCharactersForActor(state.characters, state.permissions, actorId)
				.flatMap((character) => {
					const record = state.characters.characters[character.id];
					if (!record) return [];
					return resourcesOf(record)
						.ledger.filter((entry) => entry.kind === 'rest')
						.map((entry) => ({ character, entry }));
				})
				.sort((a, b) => b.entry.at.localeCompare(a.entry.at))
				.slice(0, 12);
			return {
				header: null,
				emptyLabel: 'No rests yet.',
				rows: rests.map(({ character, entry }) =>
					row(`${character.id}:${entry.id}`, character.name, {
						secondary: entry.at,
						meta: restKindOfLedgerEntry(entry) === 'long' ? 'Long rest' : 'Short rest',
					}),
				),
			};
		}
		case 'presence': {
			// Core presence only. The transport's live peers are the `live-peers` source.
			const scenes = new Map(
				listScenesForActor(state.scenes, state.permissions, actorId).map((scene) => [
					scene.id,
					scene.name,
				]),
			);
			const projection = projectSessionPresence(
				state.presence ?? EMPTY_PRESENCE_STATE,
				state.permissions,
				actorId,
				// Strips a hint naming a screen this viewer cannot see, before it reaches a row.
				{ resolveSceneVisibility: (_viewer, sceneId) => scenes.has(sceneId) },
			);
			return {
				header: null,
				emptyLabel: 'Nobody else is connected.',
				rows: projection.visible.map((entry) => {
					const name = state.permissions.actors[entry.actorId]?.displayName ?? entry.actorId;
					const where = entry.activeSceneId ? scenes.get(entry.activeSceneId) : undefined;
					return row(entry.actorId, name, {
						secondary: where ? `${entry.device} · ${where}` : entry.device,
						meta: entry.status,
						active: entry.status === 'online',
						avatar: initialsOf(name),
					});
				}),
			};
		}
		case 'player-projections': {
			// The DM sees every player and observer; anyone else sees their own row and nothing about
			// who else is being shown what.
			if (!isDm) {
				const view = getPlayerViewForActor(state.scenes, state.permissions, state.session, actorId);
				return {
					header: null,
					emptyLabel: 'Nothing projected to you.',
					rows: [
						row(actorId, actor.displayName, {
							secondary: view.kind === 'assigned' ? view.name : 'Nothing projected',
							meta: actor.role,
							active: view.kind === 'assigned',
						}),
					],
				};
			}
			const scenes = new Map(
				listScenesForActor(state.scenes, state.permissions, actorId).map((scene) => [
					scene.id,
					scene.name,
				]),
			);
			return {
				header: null,
				emptyLabel: 'No players registered yet.',
				rows: Object.values(state.permissions.actors)
					.filter((other) => other.role === 'player' || other.role === 'observer')
					.sort((a, b) => a.displayName.localeCompare(b.displayName))
					.map((other) => {
						const assignment = state.session.playerViewAssignments[other.id];
						return row(other.id, other.displayName, {
							secondary: assignment
								? (scenes.get(assignment.target.sceneId) ?? 'Unknown screen')
								: 'Nothing projected',
							meta: other.role,
							active: assignment !== undefined,
						});
					}),
			};
		}
		case 'initiative-call': {
			const tracker = getCombatTrackerForActor(state.session.combat, state.permissions, actorId);
			const calling = tracker.status === 'running' && tracker.round === 0;
			const sources = tracker.combatants.map((combatant) => ({
				combatant,
				source: initiativeSourceOf(tracker, combatant, calling),
			}));
			const owed = sources.filter(({ combatant }) => combatant.kind === 'character');
			const rolled = owed.filter(({ source }) => source !== 'awaiting').length;
			return {
				header: calling ? `${rolled} of ${owed.length} rolled` : 'No initiative call open',
				emptyLabel: 'No combatants in the tracker.',
				rows: sources.map(({ combatant, source }) => {
					const initiative = combatant.statBlock.initiative;
					const secondary =
						source === 'awaiting'
							? 'Awaiting roll'
							: source === 'rolled'
								? `Rolled ${initiative ?? 0}`
								: source === 'adjusted'
									? 'Adjusted by DM'
									: initiative !== null
										? `Initiative ${initiative}`
										: undefined;
					return row(combatant.id, combatant.name, {
						secondary,
						meta: combatant.redacted ? 'Hidden' : undefined,
						value: source === 'awaiting' ? undefined : (initiative ?? undefined),
						active: combatant.isActive,
					});
				}),
			};
		}
		case 'combatant-status': {
			const tracker = getCombatTrackerForActor(state.session.combat, state.permissions, actorId);
			return {
				header: tracker.status === 'running' ? `Round ${tracker.round}` : 'No combat running',
				emptyLabel: 'No combatants in the tracker.',
				rows: tracker.combatants.map((combatant) => {
					// `resources` is null when this viewer may not see the combatant's vitals; then no
					// condition, concentration or death-save detail is written either.
					const vitals = combatant.resources;
					const detail: string[] = [];
					if (vitals) {
						for (const condition of vitals.conditions) {
							const rounds = vitals.conditionRounds[condition];
							detail.push(
								rounds ? `${condition} (${plural(rounds, 'round', 'rounds')} left)` : condition,
							);
						}
						if (vitals.concentration.effect) {
							detail.push(`Concentrating on ${vitals.concentration.effect}`);
						}
						if (vitals.concentration.checkDc !== null) {
							detail.push(`Concentration check, DC ${vitals.concentration.checkDc}`);
						}
						if (combatant.isDying) {
							detail.push(
								`Death saves ${vitals.deathSaves.successes} of 3 kept, ${vitals.deathSaves.failures} of 3 failed`,
							);
						}
					}
					const meta = !vitals
						? combatant.redacted
							? 'Hidden'
							: undefined
						: combatant.isDying
							? 'Dying'
							: combatant.isDefeated
								? 'Down'
								: combatant.isBloodied
									? 'Bloodied'
									: undefined;
					return row(combatant.id, combatant.name, {
						secondary: detail.length > 0 ? detail.join(' · ') : undefined,
						meta,
						value: vitals?.hp,
						max: vitals?.maxHp,
						active: combatant.isActive,
					});
				}),
			};
		}
		case 'capture-candidates': {
			// What an end-of-session capture can mark as changed: references to the roster and the
			// vault items this viewer may list, never copies of them.
			const characters = listCharactersForActor(state.characters, state.permissions, actorId);
			const items = getContentItemsForActor(state.content, state.permissions, actorId);
			return {
				header: null,
				emptyLabel: 'Nothing to mark as changed yet.',
				rows: [
					...characters.map((character) =>
						row(`character:${character.id}`, character.name, {
							secondary: character.kind,
							meta: 'Character',
						}),
					),
					...items.map((item) =>
						row(`content-item:${item.id}`, item.title, {
							meta: item.kind === 'note' ? 'Note' : 'Object',
						}),
					),
				],
			};
		}
		case 'widget-library': {
			// DM-only in the core: an actor who cannot author scenes gets an empty library.
			const entries = listWidgetLibrary(state.widgets, state.permissions, actorId, {
				profileId: host.profileId ?? 'web',
			});
			return {
				header: null,
				emptyLabel: 'No widgets to add.',
				rows: entries.map((entry) =>
					row(`${entry.packageId}:${entry.type}`, entry.displayName, {
						secondary: entry.availability.available
							? (entry.description ?? entry.packageDisplayName)
							: entry.availability.reason,
						meta: entry.availability.available ? entry.category : 'Unavailable',
						active: entry.availability.available,
					}),
				),
			};
		}
		case 'live-peers': {
			// SE-23's transport half. The DM reads every peer the host holds, invited ones included.
			// Anyone else reads only connected peers, and only what the host's presence broadcast
			// already sends a player: name, status, hand and ready. No peer ids, roles or invitations.
			const table = host.table;
			if (!table) return { header: null, emptyLabel: TABLE_UNKNOWN, rows: [] };
			if (table.role === 'solo') {
				return {
					header: 'Not hosting a table',
					emptyLabel: 'No live table yet. Host a table and players appear here as they connect.',
					rows: [],
				};
			}
			// The online/away reading prefers core presence, as the Session console's roster does.
			const presence = new Map(
				projectSessionPresence(
					state.presence ?? EMPTY_PRESENCE_STATE,
					state.permissions,
					actorId,
				).visible.map((entry) => [entry.actorId, entry.status]),
			);
			const peers = isDm ? table.peers : table.peers.filter((peer) => peer.connected);
			return {
				header: `${peers.filter((peer) => peer.connected).length} connected`,
				emptyLabel: 'Nobody has joined yet.',
				rows: peers.map((peer) => {
					const status = peer.connected ? (presence.get(peer.actorId) ?? peer.status) : 'offline';
					const detail = isDm && peer.role ? [PEER_ROLE_WORD[peer.role], status] : [status];
					return row(isDm ? peer.peerId : peer.actorId, peer.displayName, {
						secondary: detail.join(' · '),
						meta: peer.hand
							? 'Hand raised'
							: peer.ready
								? 'Ready'
								: peer.connected
									? undefined
									: 'Invited',
						active: peer.connected && status === 'online',
						avatar: initialsOf(peer.displayName),
					});
				}),
			};
		}
		case 'table-readiness': {
			// SE-34's ready chips: the DM's cue to call initiative. Only a hosting DM holds a roster to
			// read readiness from, the same rule the Session console follows, so anyone else gets none.
			const table = host.table;
			if (!table) return { header: null, emptyLabel: TABLE_UNKNOWN, rows: [] };
			if (!isDm) return { header: null, emptyLabel: 'Only the DM sees table readiness.', rows: [] };
			if (table.role !== 'host') {
				return { header: null, emptyLabel: 'Readiness shows while you host a table.', rows: [] };
			}
			const players = table.peers.filter((peer) => peer.connected && peer.role === 'player');
			const ready = players.filter((peer) => peer.ready).length;
			return {
				header: players.length > 0 ? `${ready} of ${players.length} ready` : null,
				emptyLabel: 'No players connected yet.',
				rows: players.map((peer) =>
					row(peer.peerId, peer.displayName, {
						meta: peer.ready ? 'Ready' : 'Not ready',
						value: peer.ready ? 1 : 0,
						active: peer.ready,
						avatar: initialsOf(peer.displayName),
					}),
				),
			};
		}
		case 'continuity-mentions': {
			// SE-41: the names the latest saved capture mentions with no record behind them, read from
			// what that capture stored on its archive and checked against the roster and vault labels
			// the capture panel uses, so a quick-created NPC drops off by itself. ("Not now" is a local
			// dismissal, not data.) DM-only, like the capture: against a player's smaller roster a hidden
			// NPC's name would come back as a "no record" row.
			if (!isDm) return { header: null, emptyLabel: 'Nothing to follow up.', rows: [] };
			const latest = Object.values(state.session.archives)
				.filter(
					(archive) =>
						archive.recap !== undefined &&
						(archive.recap.happened !== undefined ||
							archive.recap.changes !== undefined ||
							archive.recap.followUps !== undefined),
				)
				.sort((a, b) => (b.recap?.authoredAt ?? '').localeCompare(a.recap?.authoredAt ?? ''))[0];
			const recap = latest?.recap;
			if (!latest || !recap) {
				return { header: null, emptyLabel: 'No session log saved yet.', rows: [] };
			}
			const known = [
				...listCharactersForActor(state.characters, state.permissions, actorId).map((c) => c.name),
				...getContentItemsForActor(state.content, state.permissions, actorId).map((i) => i.title),
			];
			const mentions = detectContinuityMentions(
				{
					happened: recap.happened ?? '',
					changes: recap.changes ?? [],
					followUps: recap.followUps ?? [],
				},
				known,
			);
			return {
				header:
					mentions.length > 0
						? plural(
								mentions.length,
								'name mentioned without notes',
								'names mentioned without notes',
							)
						: null,
				emptyLabel: 'Every name in the last session log has a record.',
				rows: mentions.map((mention) =>
					row(mention.id, mention.name, {
						secondary: latest.title ?? 'Untitled session',
						meta: 'No record yet',
					}),
				),
			};
		}
		default:
			return { header: null, emptyLabel: 'No data.', rows: [] };
	}
}

/** Format a computed value for display, so every template prints one the same way. */
function displayOf(value: WidgetComputedValue['value']): string {
	if (Array.isArray(value)) return String(value.length);
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	if (typeof value === 'object' && value !== null) {
		return Object.entries(value)
			.map(([key, entry]) => `${key} ${String(entry)}`)
			.join(' · ');
	}
	return String(value);
}

/**
 * The numbers a formula may name: four aggregates per input query (RC-WID-2.2).
 *
 * A withheld query contributes ZEROES rather than being left out of the scope, so a formula that
 * names it still evaluates — to a total that contains nothing the viewer was not allowed to see.
 * Leaving the identifier undefined instead would turn "you may not see this" into a formula error,
 * which tells the player the query exists and produces no answer at all.
 */
function formulaScope(inputs: readonly WidgetQueryResult[]): Record<string, number> {
	const scope: Record<string, number> = {};
	for (const result of inputs) {
		const rows = result.withheld === null ? result.rows : [];
		const totals: Record<(typeof WIDGET_QUERY_COLUMNS)[number], number> = {
			count: rows.length,
			sum: rows.reduce((total, r) => total + (r.value ?? 0), 0),
			max: rows.reduce((total, r) => total + (r.max ?? 0), 0),
			active: rows.filter((r) => r.active).length,
		};
		for (const column of WIDGET_QUERY_COLUMNS) {
			scope[widgetQueryFormulaIdentifier(result.id, column)] = totals[column];
		}
	}
	return scope;
}

/**
 * Evaluate one computed field over its input queries.
 *
 * Two ways to reduce, and the declaration picks. A field that carries a `formula` (RC-WID-2.2) is
 * the SYS-1.1 declarative grammar applied to the four aggregates each input query exposes — no
 * property access, no host call, no way to name an individual row. Everything else keeps the
 * declared per-type reduction: a number sums the rows' measures (falling back to the row count when
 * no row carries one), a string lists the row names, a boolean asks whether there is anything at
 * all, an array is the rows and an object is the per-query row count.
 *
 * A withheld input contributes nothing either way, so a player's computed total can never be
 * derived from rows the player was not allowed to receive. A formula that fails to evaluate says so
 * where the value would have been rather than printing a plausible zero.
 */
function evaluateComputedField(
	field: WidgetComputedFieldDefinition,
	byId: Map<string, WidgetQueryResult>,
): WidgetComputedValue {
	const declared = field.inputQueryIds
		.map((id) => byId.get(id))
		.filter((result): result is WidgetQueryResult => result !== undefined);
	const inputs = declared.filter((result) => result.withheld === null);
	const rows = inputs.flatMap((result) => result.rows);

	if (field.formula !== undefined && field.valueType === 'number') {
		const result = evaluateFormula(field.formula, formulaScope(declared));
		return {
			id: field.id,
			label: field.label,
			valueType: 'number',
			value: result.ok ? result.value : 0,
			display: result.ok ? displayOf(result.value) : result.message,
		};
	}

	let value: WidgetComputedValue['value'];
	switch (field.valueType) {
		case 'number': {
			const measured = rows.filter((r) => typeof r.value === 'number');
			value =
				measured.length > 0 ? measured.reduce((sum, r) => sum + (r.value ?? 0), 0) : rows.length;
			break;
		}
		case 'boolean':
			value = rows.length > 0;
			break;
		case 'array':
			value = rows;
			break;
		case 'object':
			value = Object.fromEntries(inputs.map((result) => [result.id, result.rows.length]));
			break;
		case 'string':
		default:
			value = rows.map((r) => r.primary).join(', ');
			break;
	}
	return {
		id: field.id,
		label: field.label,
		valueType: field.valueType,
		value,
		display: displayOf(value),
	};
}

/**
 * Resolve every declared query and computed field for one placed widget. Pure: pass a state slice
 * and an actor id and get the same answer a template would draw.
 */
export function resolveWidgetTemplateData(
	state: CoreStateSlice,
	actorId: string,
	definition: WidgetDefinition | null | undefined,
	widget: BoardWidget,
	host: WidgetHostContext = {},
): WidgetTemplateData {
	const actor = state.permissions.actors[actorId];
	// An unknown actor gets nothing rather than the DM's view — the same fail-closed default every
	// core query takes for an actor it cannot find.
	if (!actor) return EMPTY_DATA;
	const isDm = hasDmAuthority(actor.role);

	const queries: WidgetQueryResult[] = (definition?.dataQueries ?? []).map((query) => {
		const withheld: WidgetQueryWithheldReason | null =
			query.audience === 'dm' && !isDm
				? 'audience'
				: query.requiredCapability === 'manager' && !isDm
					? 'capability'
					: null;
		if (withheld) {
			return {
				id: query.id,
				label: query.label,
				source: query.source,
				rows: [],
				header: null,
				emptyLabel: WITHHELD_COPY[withheld],
				withheld,
			};
		}
		const resolved = resolveSource(state, actor, query, widget, host);
		return {
			id: query.id,
			label: query.label,
			source: query.source,
			rows: orderRows(resolved.rows, query.options),
			header: resolved.header,
			emptyLabel: resolved.emptyLabel,
			withheld: null,
		};
	});

	const byId = new Map(queries.map((result) => [result.id, result]));
	const computed = (definition?.computedFields ?? []).map((field) =>
		evaluateComputedField(field, byId),
	);

	return { queries, computed, primary: queries[0] ?? null, isDm };
}

/**
 * RC-WID-6.5 — whether the builder preview should draw {@link sampleTemplateData}: the draft
 * declares no query, and its template kind draws a query's rows. A kind that is complete without one
 * (buttons, a message, a form, a launcher of intents) is drawn as it is. So is a tracker counting its
 * own configured numbers, or a card grid built from intents: made-up rows would hide what the
 * author actually set.
 */
export function previewNeedsSampleData(definition: WidgetDefinition | null | undefined): boolean {
	if (!definition || (definition.dataQueries?.length ?? 0) > 0) return false;
	const entrypoint = definition.renderEntrypoint;
	if (entrypoint?.runtime !== 'template' || !entrypoint.template) return false;
	const kind: WidgetTemplateKind = entrypoint.template;
	if (!widgetTemplateReadsQueries(kind)) return false;
	if (kind === 'tracker') {
		return !(definition.configFields ?? []).some(
			(field) => field.control === 'number' && (field.group ?? 'content') === 'content',
		);
	}
	if (kind === 'card-grid') return (definition.intents ?? []).length === 0;
	return true;
}

/** Made-up rows that exercise every field a template draws: a measure, a ceiling, a turn, a tag. */
const SAMPLE_ROWS: readonly WidgetDataRow[] = Object.freeze([
	row('sample-1', 'Ser Brannoc', {
		secondary: 'HP 18 of 24 · AC 16',
		value: 18,
		max: 24,
		active: true,
		avatar: 'SB',
		...visibilityOf('player-visible'),
	}),
	row('sample-2', 'Wren Ashdown', {
		secondary: 'HP 9 of 20 · AC 13',
		value: 9,
		max: 20,
		avatar: 'WA',
		...visibilityOf('shared'),
	}),
	row('sample-3', 'Old Tam', {
		secondary: 'HP 31 of 31 · AC 12',
		value: 31,
		max: 31,
		avatar: 'OT',
		...visibilityOf('dm-only'),
	}),
]);

/**
 * RC-WID-6.5 — what the builder preview draws while a data template has no query yet: three
 * sample rows as the primary query, flagged `sample` so the preview labels them "Sample data". They
 * never reach a placed widget — the board resolves the real (empty) declaration — and `queries`
 * stays empty, so no computed field or query list counts them. Previewed as a player, the DM-only
 * sample row is left out, so the two previews still differ the way real rows would.
 */
export function sampleTemplateData(isDm: boolean): WidgetTemplateData {
	const primary: WidgetQueryResult = {
		id: 'sample',
		label: 'Sample data',
		source: 'visible-characters',
		sample: true,
		rows: SAMPLE_ROWS.filter((sample) => isDm || sample.visibility !== 'dm-only').map((sample) => ({
			...sample,
		})),
		header: null,
		emptyLabel: '',
		withheld: null,
	};
	return { queries: [], computed: [], primary, isDm };
}

/** The P2P session, or null where no `SessionProvider` is mounted (an isolated render). */
function useOptionalSession(): SessionContextValue | null {
	try {
		return useSession();
	} catch {
		return null;
	}
}

/** The transport's view of this device's table, in the shape the live-table sources read. */
function liveTableOf(
	role: SessionContextValue['role'],
	peers: SessionContextValue['peers'],
	clientPresence: readonly PeerPresenceEntry[],
): WidgetLiveTable {
	if (role === 'joined') {
		// A joined device holds only the roster the host projected for it: connected peers, no roles.
		return {
			role,
			peers: clientPresence.map((entry) => ({
				peerId: entry.actorId,
				actorId: entry.actorId,
				displayName: entry.displayName,
				role: null,
				connected: true,
				status: entry.status,
				hand: entry.hand ?? false,
				ready: entry.ready ?? false,
			})),
		};
	}
	return { role, peers: role === 'host' ? peers.map((peer) => ({ ...peer })) : [] };
}

/**
 * The device-local half of {@link WidgetHostContext}: this vault's name from the device's catalog,
 * the platform profile and the live table. A catalog that cannot be read leaves the name out rather
 * than failing the widget; the campaign source then says "Your campaign", as the Command Center hero
 * does.
 */
export function useWidgetHostContext(): WidgetHostContext {
	const runtime = useRuntime();
	const session = useOptionalSession();
	const vaultId = runtime.vaultId;
	const role = session?.role;
	const peers = session?.peers;
	const clientPresence = session?.client?.presence;
	const table = useMemo(
		() => (role ? liveTableOf(role, peers ?? [], clientPresence ?? []) : undefined),
		[role, peers, clientPresence],
	);
	return useMemo(() => {
		let campaignName: string | null = null;
		try {
			campaignName = listLocalVaults().find((vault) => vault.id === vaultId)?.name ?? null;
		} catch {
			/* A missing catalog is not a widget error. */
		}
		return { campaignName, profileId: widgetProfileForRuntime(), table };
	}, [vaultId, table]);
}

/** The app-side hook: the same resolution against the live, actor-projected runtime state. */
export function useWidgetTemplateData(
	widget: BoardWidget,
	definition: WidgetDefinition | null | undefined,
): WidgetTemplateData {
	const runtime = useRuntime();
	const host = useWidgetHostContext();
	return resolveWidgetTemplateData(runtime.state, runtime.activeActorId, definition, widget, host);
}
