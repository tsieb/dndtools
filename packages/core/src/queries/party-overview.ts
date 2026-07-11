import { hasDmAuthority } from '../state/permission-state';
import type { Actor, PermissionState } from '../state/permission-state';
import type { Character, CharacterState, PartyInventoryItem } from '../state/character-state';
import { partyRecordOf } from '../state/character-state';
import { listCharactersForActor, type CharacterView } from './character-query';
import { resourcesOf, availableSlots, availableClassResource } from '../state/character-resources';
import { decideCharacterDataRead } from '../permissions/consistency';

/**
 * CHAR-011 / CHAR-015 — THE single actor-filtered PARTY-OVERVIEW read model. This is the KEYSTONE of
 * the epic's non-leak guarantee for the party surface (Architecture Contract 1 Processing Core;
 * Contract 3 Visibility), built on the MAP-018 single-filtered-read-model template: the GUI party
 * panel, search, widgets, and MCP all consume THIS — never raw {@link CharacterState}. Because there
 * is exactly ONE filtered read path, a character hidden from a viewer cannot leak through one surface
 * while being blocked on another.
 *
 * Two gates, both fail-closed:
 *
 *   1. OBSERVER CEILING (CHAR-015): an observer (or unknown/unauthenticated actor) is denied character
 *      data wholesale via the PERM-011 {@link decideCharacterDataRead} guard — the party overview is
 *      EMPTY for them (no members, no marching order, no inventory), indistinguishable from an empty
 *      party. No character sheet, private resource, or owner journal data is ever returned.
 *   2. PER-VIEWER VISIBILITY (CHAR-011): members are exactly the characters the viewer may see (reusing
 *      {@link listCharactersForActor}, which already strips `dm-only` characters AND DM-only fields).
 *      A character not visible to the viewer is OMITTED from the member list AND from the marching
 *      order; party-inventory items are filtered by their own canonical visibility.
 *
 * The DM additionally receives hidden counts (how many members/inventory items are hidden from the
 * general player view) as an authoring aid; a non-DM receives zeros — the count itself could leak.
 *
 * Pure Processing-Core policy. The summaries are DERIVED from the already-redacted {@link CharacterView}
 * + the character's resources, so no DM-only field can reach the summary.
 */

/** A per-member combat/status/resource summary, derived from the actor-redacted character view. */
export interface PartyMemberSummary {
	characterId: string;
	name: string;
	kind: Character['kind'];
	visibility: Character['visibility'];
	/** Current/max HP and temp HP from the (redacted) combat block. */
	hp: number;
	maxHp: number;
	tempHp: number;
	ac: number;
	/** Active condition names (the visible status summary). */
	conditions: string[];
	/** Total available spell slots across levels (a compact resource summary), or 0 when none. */
	availableSpellSlots: number;
	/** Total available class-resource units across resources, or 0 when none. */
	availableClassResources: number;
	/** This member's position in the marching order (1-based), or null when unplaced. */
	marchingPosition: number | null;
}

/** A party-inventory item as projected to an actor. A non-DM only ever receives visible items. */
export interface PartyInventoryView {
	id: string;
	name: string;
	detail: string;
	visibility: PartyInventoryItem['visibility'];
}

/** Hidden-count aggregates, populated ONLY for the DM (a non-DM receives zeros — counts could leak). */
export interface PartyHiddenCounts {
	members: number;
	inventory: number;
}

/** The actor-filtered party overview. Every list is already visibility-filtered. */
export interface PartyOverview {
	/** Members the viewer may see, in marching order first (placed), then any unplaced by name. */
	members: PartyMemberSummary[];
	/** The marching order as VISIBLE character ids only (hidden members are omitted, not gapped). */
	marchingOrder: string[];
	/** The visible party inventory. */
	inventory: PartyInventoryView[];
	/** DM-only hidden counts (all zero for a non-DM). */
	hidden: PartyHiddenCounts;
}

const EMPTY_OVERVIEW: PartyOverview = Object.freeze({
	members: [],
	marchingOrder: [],
	inventory: [],
	hidden: { members: 0, inventory: 0 },
});

/** Total available spell slots across all levels on a (redacted) character. */
function totalAvailableSpellSlots(character: Character): number {
	const resources = resourcesOf(character);
	return Object.values(resources.spellSlots).reduce((sum, slot) => sum + availableSlots(slot), 0);
}

/** Total available class-resource units across all class resources on a (redacted) character. */
function totalAvailableClassResources(character: Character): number {
	const resources = resourcesOf(character);
	return Object.values(resources.classResources).reduce(
		(sum, resource) => sum + availableClassResource(resource),
		0,
	);
}

/** Whether a party-inventory item is visible to an actor (per-item canonical visibility). */
function inventoryVisibleToActor(item: PartyInventoryItem, actor: Actor): boolean {
	if (hasDmAuthority(actor.role)) return true;
	if (item.visibility === 'dm-only') return false;
	if (item.visibility === 'player-visible') return actor.role === 'player';
	return item.sharedWith.includes(actor.id); // `shared`: explicit delivery only.
}

/**
 * CHAR-011 / CHAR-015 — build the actor-filtered party overview. Returns the EMPTY overview when the
 * actor may not read character data at all (observer / unknown / unauthenticated — CHAR-015). For a
 * permitted actor, members are exactly the visible characters, summaries are derived from the redacted
 * view + resources, the marching order is restricted to visible members, and inventory is filtered by
 * per-item visibility. The DM additionally receives hidden counts.
 *
 * The `characters` argument is the raw {@link CharacterState} so the function can derive resource
 * summaries from the full record AFTER confirming the character is visible to the actor; it never
 * returns a character (or field) the viewer may not see — visibility is decided by
 * {@link listCharactersForActor} first.
 */
export function getPartyOverviewForActor(
	characters: CharacterState,
	permissions: PermissionState,
	actorId: string,
): PartyOverview {
	const actor = permissions.actors[actorId];
	if (!actor) return EMPTY_OVERVIEW;

	// CHAR-015 / PERM-011 observer ceiling: deny character data wholesale before any projection.
	if (decideCharacterDataRead(permissions, actorId).kind !== 'granted') return EMPTY_OVERVIEW;

	const isDm = hasDmAuthority(actor.role);
	const party = partyRecordOf(characters);

	// Members the viewer may see — the same redaction the roster uses (CharacterView strips DM-only
	// fields; a dm-only character is omitted entirely). This is the visibility root for the overview.
	const visibleViews: CharacterView[] = listCharactersForActor(characters, permissions, actorId);
	const visibleById = new Map<string, CharacterView>();
	for (const view of visibleViews) visibleById.set(view.id, view);

	// The visible marching order: placed members in declared order (omitting any hidden member), then
	// any visible member not placed in the order, appended by name (CharacterView is name-sorted).
	const placedVisibleIds = party.marchingOrder.filter((id) => visibleById.has(id));
	const placedSet = new Set(placedVisibleIds);
	const unplacedVisibleIds = visibleViews.map((v) => v.id).filter((id) => !placedSet.has(id));
	const orderedIds = [...placedVisibleIds, ...unplacedVisibleIds];
	const positionById = new Map<string, number>();
	placedVisibleIds.forEach((id, index) => positionById.set(id, index + 1));

	const members: PartyMemberSummary[] = orderedIds.map((id) => {
		const view = visibleById.get(id)!;
		// Derive the resource summary from the FULL record (already confirmed visible) — but only the
		// redacted combat block reaches the summary, so no DM-only field leaks.
		const fullRecord = characters.characters[id]!;
		return {
			characterId: view.id,
			name: view.name,
			kind: view.kind,
			visibility: view.visibility,
			hp: view.combat.hp,
			maxHp: view.combat.maxHp,
			tempHp: view.combat.tempHp,
			ac: view.combat.ac,
			conditions: [...view.combat.conditions],
			availableSpellSlots: totalAvailableSpellSlots(fullRecord),
			availableClassResources: totalAvailableClassResources(fullRecord),
			marchingPosition: positionById.get(id) ?? null,
		};
	});

	const inventory: PartyInventoryView[] = party.inventory
		.filter((item) => inventoryVisibleToActor(item, actor))
		.map((item) => ({ id: item.id, name: item.name, detail: item.detail, visibility: item.visibility }));

	// Hidden-from-PLAYERS counts (the general player view, before per-actor `shared` delivery): a
	// character is hidden from players when it is not `player-visible`; an item likewise. This mirrors
	// MAP-018's `countHiddenFromPlayers` — it is independent of the DM's own (full) visible set.
	const membersHiddenFromPlayers = Object.values(characters.characters).filter(
		(character) => character.visibility !== 'player-visible',
	).length;
	const inventoryHiddenFromPlayers = party.inventory.filter(
		(item) => item.visibility !== 'player-visible',
	).length;

	const hidden: PartyHiddenCounts = isDm
		? { members: membersHiddenFromPlayers, inventory: inventoryHiddenFromPlayers }
		: { members: 0, inventory: 0 };

	return { members, marchingOrder: orderedIds, inventory, hidden };
}
