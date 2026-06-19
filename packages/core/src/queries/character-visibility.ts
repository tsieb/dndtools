import { CHARACTER_ENTITY_TYPE, type Character } from '../state/character-state';
import type { Actor, PermissionState } from '../state/permission-state';
import { hasGrantedCapability } from '../permissions/grants';

/**
 * Whether a CHARACTER entity is visible to an actor (the entity-level gate, before per-field redaction).
 * Fail closed and shared by the single-character read and the collaborative view so the rule cannot
 * diverge:
 *
 *   - DM: always.
 *   - Observer: NEVER — the base-roles observer ceiling is `canReadCharacterData: false`, even for a
 *     `shared` character it was added to `sharedWith` on (CHAR-015).
 *   - `player-visible`: the players.
 *   - `dm-only`: nobody but the DM.
 *   - `shared`: explicit delivery only — `sharedWith` membership OR a viewer-capable grant.
 */
export function characterVisibleToActor(
	character: Character,
	actor: Actor,
	permissions: PermissionState,
): boolean {
	if (actor.role === 'dm') return true;
	if (actor.role === 'observer') return false;
	if (character.visibility === 'player-visible') return actor.role === 'player';
	if (character.visibility === 'dm-only') return false;
	if (character.sharedWith.includes(actor.id)) return true;
	return hasGrantedCapability(permissions, actor, CHARACTER_ENTITY_TYPE, character.id, 'viewer');
}
