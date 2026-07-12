import { hasDmAuthority } from '../state/permission-state';
import type { Actor, PermissionState } from '../state/permission-state';
import type {
	CharacterJournal,
	CharacterJournalEntry,
	JournalEntryKind,
} from '../state/character-journal';
import { journalForCharacter } from '../state/character-journal';
import type { Character, CharacterState } from '../state/character-state';
import { journalsOf } from '../state/character-state';
import { hasGrantedCapability } from '../permissions/grants';
import { decideCharacterDataRead } from '../permissions/consistency';

/**
 * CHAR-012 / CHAR-016 — THE single actor-filtered CHARACTER-JOURNAL read model. The data layer
 * decides per-entry visibility BEFORE any journal data is returned to ANY surface (Contract 3 Axis 1
 * / Cross-Contract Non-Negotiable 2), so the GUI, search, the graph, widgets, and MCP ALL consume
 * this — never the raw {@link CharacterJournalState}. Because there is exactly ONE filtered read path,
 * an owner-only entry CANNOT leak through one surface while being blocked on another (CHAR-016 AC4).
 *
 * Two enforcement gates, both fail-closed:
 *
 *   1. OBSERVER CEILING (CHAR-015): an observer is denied character data wholesale via the PERM-011
 *      {@link decideCharacterDataRead} guard — they receive NOTHING (no entries, no count, no ids),
 *      indistinguishable from a character with no journal.
 *   2. PER-ENTRY VISIBILITY (CHAR-016): each surviving entry is checked against its OWN canonical
 *      visibility (`dm-only` / `player-visible` / `shared`):
 *        - the DM sees every entry (DM authority);
 *        - the character's OWNER (a viewer-grantee on the character or the journal) sees their own
 *          entries regardless of level — the owner is recorded in a `shared` entry's `sharedWith`;
 *        - any OTHER player sees an entry ONLY when it is `player-visible`, or `shared` AND delivered
 *          to them (membership in `sharedWith` or a viewer grant on the journal entity);
 *        - a `dm-only` entry is visible to the DM and the owner only.
 *      A hidden entry is OMITTED ENTIRELY (never redacted-in-place) so no title, snippet, id, count,
 *      or relationship edge appears (CHAR-016 AC4).
 *
 * Pure Processing-Core policy. The command layer enforces WRITE authority; this enforces READ.
 */

/** A journal entry as projected to an actor. For a non-DM result this is always a visible entry. */
export interface JournalEntryView {
	id: string;
	kind: JournalEntryKind;
	title: string;
	body: string;
	visibility: CharacterJournalEntry['visibility'];
	authorActorId: string;
	updatedAt: string;
	revision: number;
}

/** The actor-filtered view of one character's journal. `entries` is already visibility-filtered. */
export interface CharacterJournalView {
	characterId: string;
	entries: JournalEntryView[];
	/** DM-only count of entries hidden from the GENERAL player view; zero for any non-DM (count leaks). */
	hiddenFromPlayers: number;
}

/** Whether an actor is the character's OWNER (holds the `owner` capability) — or the DM. */
function actorIsOwner(
	permissions: PermissionState,
	actor: Actor,
	characterId: string,
): boolean {
	if (hasDmAuthority(actor.role)) return true;
	return hasGrantedCapability(permissions, actor, 'character', characterId, 'owner');
}

/**
 * Whether ONE entry is visible to an actor (the per-entry CHAR-016 check). The DM sees everything; the
 * owner sees all of their own entries; any other player sees `player-visible`, or `shared` delivered to
 * them (membership in `sharedWith`). Fail closed otherwise.
 *
 * Note: `character-journal` is not registered in the capability-set schema, so viewer grants on this
 * entity type cannot be issued via the command layer. The sole delivery channel for a `shared` entry
 * is explicit `sharedWith` membership (CHAR-016 AC3).
 */
function entryVisibleToActor(
	entry: CharacterJournalEntry,
	actor: Actor,
	isOwner: boolean,
	_permissions: PermissionState,
	_characterId: string,
): boolean {
	if (hasDmAuthority(actor.role)) return true;
	if (isOwner) return true;
	if (entry.visibility === 'dm-only') return false;
	if (entry.visibility === 'player-visible') return actor.role === 'player';
	// `shared`: delivered only to actors explicitly listed in `sharedWith` (CHAR-016 AC3). Viewer
	// grants on the journal entity are not available (no capability schema for `character-journal`).
	return entry.sharedWith.includes(actor.id);
}

function projectEntry(entry: CharacterJournalEntry): JournalEntryView {
	return {
		id: entry.id,
		kind: entry.kind,
		title: entry.title,
		body: entry.body,
		visibility: entry.visibility,
		authorActorId: entry.authorActorId,
		updatedAt: entry.updatedAt,
		revision: entry.revision,
	};
}

/** Count entries hidden from the GENERAL player view (not `player-visible`). DM-only authoring aid. */
function countHiddenFromPlayers(journal: CharacterJournal): number {
	return journal.entries.filter((entry) => entry.visibility !== 'player-visible').length;
}

const EMPTY_VIEW = (characterId: string): CharacterJournalView => ({
	characterId,
	entries: [],
	hiddenFromPlayers: 0,
});

/**
 * CHAR-012 / CHAR-015 / CHAR-016 — the actor-filtered journal for ONE character. Returns an EMPTY view
 * (no entries, no count) when the actor may not read character data at all (observer / unknown /
 * unauthenticated — CHAR-015), or when the character does not exist. Otherwise every entry is filtered
 * through the per-entry visibility check (CHAR-016); the DM additionally receives the hidden count.
 *
 * A non-owner player who can see the CHARACTER (e.g. a party member) still only receives the journal
 * entries explicitly shared with them — never the owner's private bookmarks (CHAR-016 other-player
 * filtering). A player with no relationship to the character receives an empty view.
 */
export function getCharacterJournalForActor(
	characters: CharacterState,
	permissions: PermissionState,
	actorId: string,
	characterId: string,
): CharacterJournalView {
	const actor = permissions.actors[actorId];
	if (!actor) return EMPTY_VIEW(characterId);

	// CHAR-015 / PERM-011 observer ceiling: an observer (or unauthenticated/unknown actor) receives
	// NO character data on ANY surface, regardless of any grant. Fail closed before touching entries.
	if (decideCharacterDataRead(permissions, actorId).kind !== 'granted') {
		return EMPTY_VIEW(characterId);
	}

	const character: Character | undefined = characters.characters[characterId];
	if (!character) return EMPTY_VIEW(characterId);

	const journal = journalForCharacter(journalsOf(characters), characterId);
	const isOwner = actorIsOwner(permissions, actor, characterId);
	const isDm = hasDmAuthority(actor.role);

	const entries: JournalEntryView[] = [];
	for (const entry of journal.entries) {
		if (!entryVisibleToActor(entry, actor, isOwner, permissions, characterId)) continue;
		entries.push(projectEntry(entry));
	}

	return {
		characterId,
		entries,
		hiddenFromPlayers: isDm ? countHiddenFromPlayers(journal) : 0,
	};
}

/**
 * Whether an actor may AUTHOR/own a character's journal (the owner or the DM). Used by the GUI to
 * decide whether to render the journal authoring affordances; the command layer re-checks fail-closed.
 */
export function actorCanAuthorJournal(
	permissions: PermissionState,
	actorId: string,
	characterId: string,
): boolean {
	const actor = permissions.actors[actorId];
	if (!actor) return false;
	if (decideCharacterDataRead(permissions, actorId).kind !== 'granted') return false;
	return actorIsOwner(permissions, actor, characterId);
}
