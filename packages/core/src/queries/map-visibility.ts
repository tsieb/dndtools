import { hasDmAuthority } from '../state/permission-state';
import type { MapEntity } from '../state/map-state';
import type { Actor } from '../state/permission-state';
import type { MapFogOpKind, MapFogRegion, NormalizedPoint } from '../state/map-annotations';
import { fogCoverageAtPoint, type FogCoverage } from '../state/map-annotations';

/**
 * Whether a MAP entity is visible to an actor (the map-level gate, before any layer/annotation
 * filtering). The DM always sees it; a `dm-only` map never reaches a non-DM; a `player-visible` map is
 * public; a `shared` map requires explicit per-actor delivery (`delivered`). Shared by the map view and
 * the map-layer query so the map-level rule cannot diverge.
 */
export function mapVisibleToActor(map: MapEntity, actor: Actor, delivered: boolean): boolean {
	if (hasDmAuthority(actor.role)) return true;
	if (map.visibility === 'dm-only') return false;
	if (map.visibility === 'player-visible') return true;
	return delivered; // `shared` map requires explicit delivery.
}

/**
 * The minimal structural fog-op shape the PLAYER fog composition needs: the reveal/conceal verb, the
 * region (rect / polygon / stroke — legacy untagged rects stay valid), and the deterministic replay
 * `sequence`. Both the durable `MapFogOp` and the actor-filtered `MapFogView` satisfy it, so the same
 * pure composition serves the renderer's player view and the core state.
 */
export interface FogCoverageOp {
	kind: MapFogOpKind;
	region: MapFogRegion;
	sequence: number;
}

/**
 * MAP-012 — compose the ACTOR-VISIBLE fog ops at one normalized point. The op with the highest
 * `sequence` covering the point wins (a later op overrides an earlier overlap), uniformly across all
 * region shapes AND legacy rect ops, so a replayed old op-log composes identically. Pure.
 */
export function fogCoverageForActorView(
	fog: readonly FogCoverageOp[],
	point: NormalizedPoint,
): FogCoverage {
	// Delegate to the single pure composition rule in `state/map-annotations.ts`.
	return fogCoverageAtPoint(fog, point);
}

/**
 * Whether a point is CONCEALED for the viewer given their visible fog ops: the composed coverage at
 * the point resolves `concealed` (an explicit conceal is the latest covering op). A point covered by
 * no fog op is NOT concealed — base map visibility rules govern it. Fail-safe for the player view:
 * callers pass the ALREADY actor-filtered fog list, so a fog op the viewer may not see never
 * influences their composition.
 */
export function isPointConcealed(fog: readonly FogCoverageOp[], point: NormalizedPoint): boolean {
	return fogCoverageForActorView(fog, point) === 'concealed';
}
