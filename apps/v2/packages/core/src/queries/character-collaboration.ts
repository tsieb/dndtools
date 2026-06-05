import type { Actor, PermissionState } from '../state/permission-state';
import type { Character, CharacterState } from '../state/character-state';
import { CHARACTER_ENTITY_TYPE } from '../state/character-state';
import {
	ensureCollaboration,
	readFieldValue,
	type CharacterEdit,
	type CharacterFieldPath,
	type CharacterFieldConflict,
} from '../state/character-collaboration';
import { hasGrantedCapability } from '../permissions/grants';

/**
 * CHAR-014 — the ACTOR-FILTERED collaborative character view. The collaborative surface must visibly
 * DISTINGUISH, per field:
 *
 *   (a) current DM-authored player-visible edits,
 *   (b) player-authored edits, and
 *   (c) unresolved conflicts,
 *
 * WITHOUT exposing DM-only fields to a non-DM actor. This is the single sanctioned read path for the
 * collaborative view: the GUI renders THIS projection, never raw {@link CharacterState}. Visibility
 * is decided in the data layer BEFORE anything is returned (Contract 1 binding rule 5 / Cross-Contract
 * Non-Negotiable 2).
 *
 * NON-LEAK is the load-bearing guarantee (CHAR-014 AC2): for a non-DM actor a DM-only field's VALUE,
 * PATH, AUTHOR, and any conflict on it are ALL omitted — no label, placeholder, or history entry
 * reveals the hidden field's existence. The DM additionally sees the full attribution + history +
 * conflicts. Pure Processing-Core policy; no GUI, no storage.
 */

/** Whether a field's current value was authored by a DM vs a player (CHAR-014 (a)/(b)). */
export type FieldAuthorKind = 'dm-authored' | 'player-authored' | 'original';

/** One field in the collaborative view, after actor filtering. */
export interface CollaborativeField {
	path: CharacterFieldPath;
	/** The single canonical value. (DM-only fields are never present here for a non-DM actor.) */
	value: unknown;
	/** Who authored the current value: DM-authored, player-authored, or original (creator). */
	authorKind: FieldAuthorKind;
	/** The author actor id of the current value, when an attributed edit exists. */
	authorActorId: string | null;
	/** True when this field has an unresolved same-path conflict (CHAR-014 (c)). */
	conflicted: boolean;
	/** True when the field is the DM (so the GUI can flag "DM-authored" on the owner's view). */
	dmAuthored: boolean;
}

/** A single attributed history entry, after actor filtering (DM-only field edits omitted). */
export interface CollaborativeHistoryEntry {
	id: string;
	path: CharacterFieldPath;
	authorActorId: string;
	authorRole: CharacterEdit['authorRole'];
	value: unknown;
	revision: number;
	at: string;
}

/** A conflict, after actor filtering (a conflict on a DM-only field is omitted for non-DM actors). */
export interface CollaborativeConflict {
	id: string;
	path: CharacterFieldPath;
	reason: CharacterFieldConflict['reason'];
	local: CharacterFieldConflict['local'];
	remote: CharacterFieldConflict['remote'];
	detectedAt: string;
}

/** The actor-filtered collaborative view of one character. `null` when the actor may not see it. */
export interface CollaborativeCharacterView {
	id: string;
	name: string;
	/** Whether the requesting actor is the DM (so the GUI knows it is showing the full view). */
	viewerIsDm: boolean;
	/** The visible, attributed fields. DM-only fields are absent for non-DM actors. */
	fields: CollaborativeField[];
	/** The visible attributed edit history, oldest first. DM-only field edits absent for non-DM. */
	history: CollaborativeHistoryEntry[];
	/** Unresolved conflicts the actor may see. DM-only field conflicts absent for non-DM actors. */
	conflicts: CollaborativeConflict[];
	revision: number;
}

function characterVisibleToActor(
	character: Character,
	actor: Actor,
	permissions: PermissionState,
): boolean {
	if (actor.role === 'dm') return true;
	if (character.visibility === 'player-visible') return actor.role === 'player';
	if (character.visibility === 'dm-only') return false;
	if (character.sharedWith.includes(actor.id)) return true;
	return hasGrantedCapability(permissions, actor, CHARACTER_ENTITY_TYPE, character.id, 'viewer');
}

/**
 * Whether a single FIELD PATH is visible to the actor. The DM sees every field. A non-DM actor never
 * sees a field path the character declares `dm-only` (Contract 3 field-level visibility). This is the
 * SINGLE gate every per-field projection below passes through, so a DM-only field cannot leak through
 * the value list, the history, OR the conflict list.
 */
function fieldVisibleToActor(character: Character, actor: Actor, path: string): boolean {
	if (actor.role === 'dm') return true;
	return !character.dmOnlyFields.includes(path);
}

/** The editable field paths a collaborative view exposes for a character, in stable order. */
function collaborativeFieldPaths(character: Character): CharacterFieldPath[] {
	const paths: CharacterFieldPath[] = [
		'name',
		'combat.hp',
		'combat.maxHp',
		'combat.tempHp',
		'combat.ac',
		'combat.conditions',
	];
	for (const key of Object.keys(character.data)) {
		paths.push(`data.${key}` as CharacterFieldPath);
	}
	return paths;
}

/**
 * Build the actor-filtered collaborative view of ONE character (CHAR-014), or `null` when the actor
 * may not see the character at all (fail closed — omitted, not redacted, so existence is not probeable
 * by id). For a visible character:
 *
 *   - the DM sees every field, the full attributed history, and every conflict;
 *   - a non-DM actor sees only player-VISIBLE fields. Every DM-only field is omitted from the field
 *     list, the history, AND the conflict list — its value/path/author never appear (CHAR-014 AC2).
 *
 * Each visible field is tagged DM-authored vs player-authored vs original (CHAR-014 (a)/(b)) and
 * flagged `conflicted` when it has an unresolved same-path conflict (CHAR-014 (c)).
 */
export function getCollaborativeCharacterView(
	state: CharacterState,
	permissions: PermissionState,
	actorId: string,
	characterId: string,
): CollaborativeCharacterView | null {
	const actor = permissions.actors[actorId];
	if (!actor) return null;
	const character = state.characters[characterId];
	if (!character) return null;
	if (!characterVisibleToActor(character, actor, permissions)) return null;

	const collaboration = ensureCollaboration(character.collaboration);
	const isDm = actor.role === 'dm';

	const unresolvedByPath = new Set(
		collaboration.conflicts.filter((c) => c.resolvedAt === null).map((c) => c.path),
	);

	const fields: CollaborativeField[] = [];
	for (const path of collaborativeFieldPaths(character)) {
		// THE non-leak gate: a DM-only field is never returned to a non-DM actor — no value, no
		// attribution, not even the path. So the field list cannot reveal a hidden field's existence.
		if (!fieldVisibleToActor(character, actor, path)) continue;
		const author = collaboration.fieldAuthors[path];
		const dmAuthored = author?.authorRole === 'dm';
		const authorKind: FieldAuthorKind = !author
			? 'original'
			: dmAuthored
				? 'dm-authored'
				: 'player-authored';
		fields.push({
			path,
			value: readFieldValue(character, path),
			authorKind,
			authorActorId: author?.authorActorId ?? null,
			conflicted: unresolvedByPath.has(path),
			dmAuthored,
		});
	}

	// History + conflicts pass through the SAME field-visibility gate, so a DM-only field's edits and
	// conflicts never leak into a non-DM view (CHAR-014 AC2).
	const history: CollaborativeHistoryEntry[] = collaboration.editHistory
		.filter((edit) => fieldVisibleToActor(character, actor, edit.path))
		.map((edit) => ({
			id: edit.id,
			path: edit.path,
			authorActorId: edit.authorActorId,
			authorRole: edit.authorRole,
			value: edit.value,
			revision: edit.revision,
			at: edit.at,
		}));

	const conflicts: CollaborativeConflict[] = collaboration.conflicts
		.filter((c) => c.resolvedAt === null && fieldVisibleToActor(character, actor, c.path))
		.map((c) => ({
			id: c.id,
			path: c.path,
			reason: c.reason,
			local: c.local,
			remote: c.remote,
			detectedAt: c.detectedAt,
		}));

	return {
		id: character.id,
		name: character.name,
		viewerIsDm: isDm,
		fields,
		history,
		conflicts,
		revision: character.revision,
	};
}
