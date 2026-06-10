import type { Actor, PermissionState } from '../state/permission-state';
import type { MapEntity, MapState } from '../state/map-state';
import type { MapEmbed, MapEmbedTransform, Point2D } from '../state/map-nesting';
import {
	applyMatrix,
	composeChain,
	embedTransformToMatrix,
	invertMatrix,
} from '../state/map-nesting';

/**
 * MAP-009 / MAP-017 — the LOGICAL parent↔child viewport-transition model, and the non-leaking
 * resolution of embedded child links.
 *
 * Per ADR-014 the pixel rendering engine is deferred, so this module delivers the pure, testable
 * viewport math the GUI reflects — it does NOT animate. Given a participant's viewport on a parent map
 * and an embed, it computes:
 *   - whether a parent→child transition is permitted for THIS actor (visibility-filtered — a
 *     participant can only transition into a child they can actually see, MAP-009 AC2), and
 *   - the target viewport in the child's normalized space (and the inverse, child→parent), clamped to
 *     the child's [0,1] bounds (MAP-009 AC1).
 *
 * The actor's VISIBLE map data is the boundary: a `dm-only` or otherwise-hidden child yields a generic
 * `unavailable` transition that reveals NOTHING about the child (no name, no content), exactly like a
 * deleted/missing child — reusing the same fail-closed, indistinguishable-from-not-found contract as
 * the NAV deep-link resolver (`queries/deep-links.ts`) and the visibility filter
 * (`permissions/visibility-filter.ts`). MAP-008 AC2's promise holds here: because an embed references
 * the LIVE child, the child's independent visibility is always the authority; the parent being
 * player-visible never widens a dm-only child.
 */

/** A rectangular viewport in a map's normalized (0..1) space: the visible window. */
export interface MapViewport {
	/** Top-left corner of the visible window, normalized. */
	x: number;
	y: number;
	/** Width/height of the visible window, normalized. A full-map view is `{x:0,y:0,w:1,h:1}`. */
	w: number;
	h: number;
}

export const FULL_MAP_VIEWPORT: MapViewport = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });

/**
 * The single generic unavailable message for a broken/hidden embedded child. Identical for hidden,
 * deleted, and missing children so an unauthorized actor cannot tell them apart (MAP-017 AC3), and it
 * names no child. Mirrors the NAV deep-link generic unavailable contract.
 */
export const MAP_CHILD_UNAVAILABLE_MESSAGE =
	'This area is unavailable. It may not exist, may not be available on this device, or you may not have access.';

/** Why a child embed is not transition-able for an actor. The bucket is for diagnostics/tests; the
 *  user-facing `message` is the single generic string for EVERY reason (no leak). */
export type MapChildUnavailableReason = 'hidden' | 'missing' | 'invalid-transform';

/** A resolved embed for an actor: either the visible child surface, or a generic unavailable. */
export type ResolvedEmbed =
	| {
			kind: 'available';
			embedId: string;
			childMapId: string;
			/** The child's display name — ONLY present because the child is visible to this actor. */
			childName: string;
			transform: MapEmbedTransform;
			transitionBehavior: MapEmbed['transitionBehavior'];
			transitionThreshold: number;
	  }
	| {
			kind: 'unavailable';
			embedId: string;
			/** Diagnostic bucket — NOT user-facing. */
			reason: MapChildUnavailableReason;
			/** The single generic, non-leaking message shown for every reason. */
			message: string;
	  };

function unavailableEmbed(embedId: string, reason: MapChildUnavailableReason): ResolvedEmbed {
	return { kind: 'unavailable', embedId, reason, message: MAP_CHILD_UNAVAILABLE_MESSAGE };
}

/**
 * Is a map ENTITY visible to an actor for the purpose of transitioning into it? The DM sees every map.
 * A non-DM sees a child only when its own `visibility` is `player-visible` — a `dm-only` child is
 * hidden (MAP-008 AC2), and a `shared` child is not generally readable without an explicit projection
 * (it is not exposed by a bare nesting transition), so it is also treated as hidden here. This is the
 * SAME rule the map deep-link resolver applies, kept consistent so a child is never reachable through
 * nesting when it would be unavailable through a deep link.
 *
 * Crucially this reads the LIVE child entity's visibility, never a copy on the embed, so the child's
 * independent permission model is authoritative even when the parent is more visible.
 */
function isChildVisibleToActor(child: MapEntity, actor: Actor): boolean {
	if (actor.role === 'dm') return true;
	return child.visibility === 'player-visible';
}

/**
 * Resolve every embed on a parent map FOR AN ACTOR. A child that is hidden from the actor or missing
 * from state collapses to the same generic `unavailable` entry — indistinguishable, no name/content
 * leak (MAP-017 AC3). A child visible to the actor returns its transform + the live child name.
 *
 * Fail closed: an unknown actor sees every embed as unavailable. The list preserves embed ids and
 * order so the renderer can draw a coherent "unavailable area" placeholder where a hidden child sits,
 * without knowing anything about it.
 */
export function resolveEmbedsForActor(
	maps: MapState['maps'],
	parentMapId: string,
	actor: Actor | undefined,
): ResolvedEmbed[] {
	const parent = maps[parentMapId];
	if (!parent) return [];
	return parent.embeds.map((embed) => {
		if (!actor) return unavailableEmbed(embed.id, 'hidden');
		const child = maps[embed.childMapId];
		// A missing child and a hidden child are reported with the SAME generic unavailable so a
		// player cannot probe which one it is (MAP-017 AC3). We bucket the reason for DM diagnostics,
		// but the message is identical and no child detail is ever attached.
		if (!child) {
			// Only the DM may even learn the bucket is "missing"; a non-DM gets the same `hidden`-shaped
			// generic result, so deletion is indistinguishable from never-having-access.
			return unavailableEmbed(embed.id, actor.role === 'dm' ? 'missing' : 'hidden');
		}
		if (!isChildVisibleToActor(child, actor)) return unavailableEmbed(embed.id, 'hidden');
		const inverse = invertMatrix(embedTransformToMatrix(embed.transform));
		if (!inverse) return unavailableEmbed(embed.id, 'invalid-transform');
		return {
			kind: 'available',
			embedId: embed.id,
			childMapId: embed.childMapId,
			childName: child.name,
			transform: embed.transform,
			transitionBehavior: embed.transitionBehavior,
			transitionThreshold: embed.transitionThreshold,
		};
	});
}

/** Clamp a viewport into the [0,1] x [0,1] map bounds, preserving size where possible. A viewport
 *  larger than the map is clamped to the full map. */
function clampViewport(viewport: MapViewport): MapViewport {
	const w = Math.min(Math.max(viewport.w, 0), 1);
	const h = Math.min(Math.max(viewport.h, 0), 1);
	const x = Math.min(Math.max(viewport.x, 0), 1 - w);
	const y = Math.min(Math.max(viewport.y, 0), 1 - h);
	return { x, y, w, h };
}

/** The four corners of a viewport rectangle. */
function viewportCorners(viewport: MapViewport): Point2D[] {
	return [
		{ x: viewport.x, y: viewport.y },
		{ x: viewport.x + viewport.w, y: viewport.y },
		{ x: viewport.x, y: viewport.y + viewport.h },
		{ x: viewport.x + viewport.w, y: viewport.y + viewport.h },
	];
}

/** The axis-aligned bounding box of a set of points, as a viewport. */
function boundingViewport(points: Point2D[]): MapViewport {
	const xs = points.map((p) => p.x);
	const ys = points.map((p) => p.y);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/** A computed parent↔child viewport transition. */
export type MapTransition =
	| {
			kind: 'transition';
			direction: 'into-child' | 'to-parent';
			embedId: string;
			childMapId: string;
			behavior: MapEmbed['transitionBehavior'];
			/** The target viewport in the destination map's normalized space, clamped to [0,1]. */
			targetViewport: MapViewport;
	  }
	| {
			kind: 'unavailable';
			embedId: string;
			reason: MapChildUnavailableReason;
			message: string;
	  }
	| {
			kind: 'none';
			/** Why no transition fired: the zoom has not crossed the embed's threshold. */
			reason: 'below-threshold';
	  };

/**
 * MAP-009 — compute whether scrolling/zooming a `parentViewport` into an embed crosses the transition
 * threshold, and if so the target viewport in the child's space. Visibility-filtered: a child hidden
 * from the actor yields the generic `unavailable` transition (MAP-009 AC2), never a leak.
 *
 * The "zoom" measure is how much of the parent viewport the child footprint fills. The child occupies
 * a `scale`-sized footprint on the parent; when the viewport zooms in until that footprint fills at
 * least `transitionThreshold` of the smaller viewport dimension, the transition into the child fires.
 * The target child viewport is the parent viewport mapped through the embed's INVERSE transform
 * (parent→child) and clamped to the child's bounds, so the participant lands looking at the same world
 * area, now in child coordinates (MAP-009 AC1).
 */
export function computeTransitionIntoChild(
	maps: MapState['maps'],
	parentMapId: string,
	embedId: string,
	parentViewport: MapViewport,
	actor: Actor | undefined,
	_permission?: PermissionState,
): MapTransition {
	const parent = maps[parentMapId];
	if (!parent)
		return {
			kind: 'unavailable',
			embedId,
			reason: 'missing',
			message: MAP_CHILD_UNAVAILABLE_MESSAGE,
		};
	const embed = parent.embeds.find((candidate) => candidate.id === embedId);
	if (!embed) {
		return {
			kind: 'unavailable',
			embedId,
			reason: 'missing',
			message: MAP_CHILD_UNAVAILABLE_MESSAGE,
		};
	}
	if (!actor)
		return {
			kind: 'unavailable',
			embedId,
			reason: 'hidden',
			message: MAP_CHILD_UNAVAILABLE_MESSAGE,
		};
	const child = maps[embed.childMapId];
	if (!child) {
		return {
			kind: 'unavailable',
			embedId,
			reason: actor.role === 'dm' ? 'missing' : 'hidden',
			message: MAP_CHILD_UNAVAILABLE_MESSAGE,
		};
	}
	if (!isChildVisibleToActor(child, actor)) {
		return {
			kind: 'unavailable',
			embedId,
			reason: 'hidden',
			message: MAP_CHILD_UNAVAILABLE_MESSAGE,
		};
	}

	const childToParent = embedTransformToMatrix(embed.transform);
	const parentToChild = invertMatrix(childToParent);
	if (!parentToChild) {
		return {
			kind: 'unavailable',
			embedId,
			reason: 'invalid-transform',
			message: MAP_CHILD_UNAVAILABLE_MESSAGE,
		};
	}

	// "Zoom" = how much of the viewport's smaller dimension the child footprint fills. The child footprint
	// width on the parent is `scale` (uniform). The fraction of the current viewport it fills is
	// `scale / min(viewportW, viewportH)`. The transition fires once that meets the threshold.
	const viewportSpan = Math.min(parentViewport.w, parentViewport.h);
	const childFillFraction = viewportSpan > 0 ? embed.transform.scale / viewportSpan : Infinity;
	if (childFillFraction < embed.transitionThreshold) {
		return { kind: 'none', reason: 'below-threshold' };
	}

	// Map the parent viewport rectangle into child space and clamp to the child's [0,1] bounds.
	const childCorners = viewportCorners(parentViewport).map((corner) =>
		applyMatrix(parentToChild, corner),
	);
	const targetViewport = clampViewport(boundingViewport(childCorners));
	return {
		kind: 'transition',
		direction: 'into-child',
		embedId,
		childMapId: embed.childMapId,
		behavior: embed.transitionBehavior,
		targetViewport,
	};
}

/**
 * MAP-009 — compute the inverse transition: zooming OUT of a child back to the parent. Given the
 * child viewport, map it up into the parent's space through the embed's (child→parent) transform and
 * clamp to the parent bounds. Always available to an actor who could reach the child (the parent is
 * by definition at least as visible along the path they used); a missing parent/embed is the generic
 * unavailable.
 */
export function computeTransitionToParent(
	maps: MapState['maps'],
	parentMapId: string,
	embedId: string,
	childViewport: MapViewport,
): MapTransition {
	const parent = maps[parentMapId];
	if (!parent)
		return {
			kind: 'unavailable',
			embedId,
			reason: 'missing',
			message: MAP_CHILD_UNAVAILABLE_MESSAGE,
		};
	const embed = parent.embeds.find((candidate) => candidate.id === embedId);
	if (!embed) {
		return {
			kind: 'unavailable',
			embedId,
			reason: 'missing',
			message: MAP_CHILD_UNAVAILABLE_MESSAGE,
		};
	}
	const childToParent = embedTransformToMatrix(embed.transform);
	const parentCorners = viewportCorners(childViewport).map((corner) =>
		applyMatrix(childToParent, corner),
	);
	const targetViewport = clampViewport(boundingViewport(parentCorners));
	return {
		kind: 'transition',
		direction: 'to-parent',
		embedId,
		childMapId: embed.childMapId,
		behavior: embed.transitionBehavior,
		targetViewport,
	};
}

/**
 * MAP-017 AC2 — map a point given as a chain of embeds from the ROOT down to a leaf, all the way into
 * the leaf's space, and back. Returns the composed root→leaf matrix's INVERSE applied to a parent
 * point so callers get the leaf-space coordinate, plus a round-trip helper for tests. The chain is the
 * ordered embed transforms parent-first (outermost embed first). A degenerate (zero-scale) transform
 * yields `null` (fail closed).
 */
export function projectPointThroughChain(
	chain: readonly MapEmbedTransform[],
	rootPoint: Point2D,
): { leafPoint: Point2D; roundTrip: Point2D } | null {
	const rootToLeaf = composeChain(chain);
	const leafToRoot = invertMatrix(rootToLeaf);
	if (!leafToRoot) return null;
	// `composeChain` maps child→parent (leaf→root). So root→leaf is its inverse.
	const leafPoint = applyMatrix(leafToRoot, rootPoint);
	const roundTrip = applyMatrix(rootToLeaf, leafPoint);
	return { leafPoint, roundTrip };
}
