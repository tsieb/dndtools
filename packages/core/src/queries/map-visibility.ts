import type { MapEntity } from '../state/map-state';
import type { Actor } from '../state/permission-state';

/**
 * Whether a MAP entity is visible to an actor (the map-level gate, before any layer/annotation
 * filtering). The DM always sees it; a `dm-only` map never reaches a non-DM; a `player-visible` map is
 * public; a `shared` map requires explicit per-actor delivery (`delivered`). Shared by the map view and
 * the map-layer query so the map-level rule cannot diverge.
 */
export function mapVisibleToActor(map: MapEntity, actor: Actor, delivered: boolean): boolean {
	if (actor.role === 'dm') return true;
	if (map.visibility === 'dm-only') return false;
	if (map.visibility === 'player-visible') return true;
	return delivered; // `shared` map requires explicit delivery.
}
