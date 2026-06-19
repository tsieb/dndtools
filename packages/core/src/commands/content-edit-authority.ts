import { hasGrantedCapability } from '../permissions/grants';
import type { Actor } from '../state/permission-state';
import { CONTENT_ITEM_ENTITY_TYPE, contentItemById } from '../state/content';
import type { CoreStateSlice } from './types';

/**
 * Authorized editor for an EXISTING content item: the DM, or a player holding a write-capable grant
 * (`section-editor` / `contributor`) on that content-item entity. Fail closed.
 *
 * CONTENT-009 AC4 / Architecture Contract 3 (Axis 2 rule 4): a non-DM can NEVER write to a `dm-only`
 * item even with a write grant — a grant never bypasses a visibility barrier (the grant is invalid; the
 * DM sees a `write-grant-on-hidden-content` consistency error). The guard is enforced here so a player
 * cannot circumvent the barrier via a stale grant. `now` (from `env.clock()`) MUST be passed so an
 * EXPIRED grant is treated as inert (PERM-004 fail closed).
 *
 * This is the SINGLE source for content-edit authority — every content edit path (note/object update,
 * snippet insert, wikilink rename/repair, append-roll-to-note, section/field visibility) routes through
 * it so the dm-only guard can never diverge across the copies again.
 */
export function actorMayEditItem(
	state: CoreStateSlice,
	actor: Actor,
	itemId: string,
	now: string,
): boolean {
	if (actor.role === 'dm') return true;
	if (actor.role === 'observer') return false;
	// Fail closed: a dm-only item is never writable by a non-DM, regardless of any grant (CONTENT-009 AC4).
	const item = contentItemById(state.content, itemId);
	if (item && item.visibility === 'dm-only') return false;
	return (
		hasGrantedCapability(state.permissions, actor, CONTENT_ITEM_ENTITY_TYPE, itemId, 'section-editor', now) ||
		hasGrantedCapability(state.permissions, actor, CONTENT_ITEM_ENTITY_TYPE, itemId, 'contributor', now)
	);
}
