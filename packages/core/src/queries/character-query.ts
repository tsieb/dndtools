import type { Actor, PermissionState } from '../state/permission-state';
import type {
	Character,
	CharacterDraft,
	CharacterState,
} from '../state/character-state';
import { CHARACTER_ENTITY_TYPE, isDraftOwner } from '../state/character-state';
import { hasGrantedCapability } from '../permissions/grants';

/**
 * CHAR-001 / CHAR-002 — the ACTOR-FILTERED character read model. The data layer decides visibility
 * BEFORE any character data is returned to a non-DM surface (Contract 3 Axis 1 / Cross-Contract
 * Non-Negotiable 2), so the GUI roster, a player's character query, search, widgets, and MCP all
 * consume this rather than raw {@link CharacterState}. Fail-closed by construction:
 *
 *   - A `dm-only` DM-authored NPC is OMITTED from a player/observer query (CHAR-001 AC2). It is not
 *     redacted-but-listed; it is absent, so no title/count leaks.
 *   - A `dm-only` character's DM-only fields are stripped for any non-DM actor; a player-visible
 *     character still strips its declared `dmOnlyFields`.
 *   - A draft returns its fields ONLY to its single owner (or the DM); a non-owner player/observer
 *     gets NOTHING — no draft fields, not even existence (CHAR-002 AC3, fail closed).
 */

/** A character as seen by one actor: DM-only fields stripped from `data`/`combat` for non-DM. */
export interface CharacterView {
	id: string;
	kind: Character['kind'];
	name: string;
	visibility: Character['visibility'];
	abilityScores: Character['abilityScores'];
	attacks: Character['attacks'];
	combat: Character['combat'];
	/** `data` with the character's declared DM-only fields removed for non-DM actors. */
	data: Record<string, unknown>;
	updatedAt: string;
	revision: number;
}

function characterVisibleToActor(
	character: Character,
	actor: Actor,
	permissions: PermissionState,
): boolean {
	if (actor.role === 'dm') return true;
	// Observer ceiling (base-roles `canReadCharacterData: false`): an observer NEVER reads character
	// data — not even a `shared` character it was added to `sharedWith` on. Enforced here so the
	// single-character read matches the party overview's ceiling (CHAR-015), fail closed.
	if (actor.role === 'observer') return false;
	if (character.visibility === 'player-visible') return actor.role === 'player';
	if (character.visibility === 'dm-only') return false;
	// `shared`: delivered only through explicit delivery — membership in `sharedWith` (e.g. the
	// owner of a finalized PC) OR a viewer-capable grant on the character.
	if (character.sharedWith.includes(actor.id)) return true;
	return hasGrantedCapability(permissions, actor, CHARACTER_ENTITY_TYPE, character.id, 'viewer');
}

function redactCharacter(character: Character, isDm: boolean): CharacterView {
	const data = { ...character.data };
	const combat = { ...character.combat, conditions: [...character.combat.conditions] };
	if (!isDm) {
		for (const field of character.dmOnlyFields) {
			// DM-only field paths follow the field-edit path convention: `data.<key>` for a structured
			// sheet field, `combat.<key>` for a combat field, or a bare data key for legacy records.
			// Strip the scope prefix so the correct key is removed from `data`/`combat` and the value
			// never reaches a non-DM actor (Contract 3 field visibility / CHAR-010 non-leak).
			if (field.startsWith('combat.')) {
				const combatKey = field.slice('combat.'.length);
				if (combatKey in combat) delete (combat as Record<string, unknown>)[combatKey];
				continue;
			}
			const dataKey = field.startsWith('data.') ? field.slice('data.'.length) : field;
			delete (data as Record<string, unknown>)[dataKey];
		}
	}
	return {
		id: character.id,
		kind: character.kind,
		name: character.name,
		visibility: character.visibility,
		abilityScores: { ...character.abilityScores },
		attacks: character.attacks.map((attack) => ({ ...attack })),
		combat,
		data,
		updatedAt: character.updatedAt,
		revision: character.revision,
	};
}

/** A single character for one actor, or `null` when the actor may not see it (fail closed). */
export function getCharacterForActor(
	state: CharacterState,
	permissions: PermissionState,
	actorId: string,
	characterId: string,
): CharacterView | null {
	const actor = permissions.actors[actorId];
	if (!actor) return null;
	const character = state.characters[characterId];
	if (!character) return null;
	if (!characterVisibleToActor(character, actor, permissions)) return null;
	return redactCharacter(character, actor.role === 'dm');
}

/** Every character the actor may see, omitting hidden ones entirely, sorted by name. */
export function listCharactersForActor(
	state: CharacterState,
	permissions: PermissionState,
	actorId: string,
): CharacterView[] {
	const actor = permissions.actors[actorId];
	if (!actor) return [];
	const isDm = actor.role === 'dm';
	return Object.values(state.characters)
		.filter((character) => characterVisibleToActor(character, actor, permissions))
		.map((character) => redactCharacter(character, isDm))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** A draft as seen by its owner/DM. Drafts are only ever returned to those actors. */
export interface CharacterDraftView {
	id: string;
	name: string;
	ownerActorId: string;
	createdBy: string;
	steps: CharacterDraft['steps'];
	visibility: CharacterDraft['visibility'];
	updatedAt: string;
	revision: number;
	finalized: boolean;
	/** Whether the requesting actor may edit (the single owner only; the DM administers, not edits). */
	editableByActor: boolean;
}

function draftView(draft: CharacterDraft, actorId: string): CharacterDraftView {
	return {
		id: draft.id,
		name: draft.name,
		ownerActorId: draft.ownerActorId,
		createdBy: draft.createdBy,
		steps: draft.steps.map((step) => ({ ...step, values: { ...step.values } })),
		visibility: draft.visibility,
		updatedAt: draft.updatedAt,
		revision: draft.revision,
		finalized: draft.finalized,
		editableByActor: isDraftOwner(draft, actorId),
	};
}

/**
 * A draft for one actor, or `null` when the actor is neither the DM nor the single owner (CHAR-002
 * AC3 — a non-owner gets NO draft fields). Inspecting an existing draft by id yields a
 * pre-finalization character entity with draft state, never a permission-grant entity (CHAR-002 AC4).
 */
export function getDraftForActor(
	state: CharacterState,
	permissions: PermissionState,
	actorId: string,
	draftId: string,
): CharacterDraftView | null {
	const actor = permissions.actors[actorId];
	if (!actor) return null;
	const draft = state.drafts[draftId];
	if (!draft) return null;
	const isOwner = isDraftOwner(draft, actorId);
	if (actor.role !== 'dm' && !isOwner) return null; // fail closed: no draft fields for non-owners
	return draftView(draft, actorId);
}

/**
 * The drafts an actor may see: the DM sees all unfinalized drafts; a player sees only the draft(s)
 * they own. An observer sees none. Used by the draft list/roster surface.
 */
export function listDraftsForActor(
	state: CharacterState,
	permissions: PermissionState,
	actorId: string,
): CharacterDraftView[] {
	const actor = permissions.actors[actorId];
	if (!actor || actor.role === 'observer') return [];
	const isDm = actor.role === 'dm';
	return Object.values(state.drafts)
		.filter((draft) => isDm || isDraftOwner(draft, actorId))
		.map((draft) => draftView(draft, actorId))
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
