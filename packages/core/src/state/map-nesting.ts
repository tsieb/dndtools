import type { MapEntity, MapState } from './map-state';

/**
 * MAP-008 / MAP-017 — the durable map NESTING model: pure graph + 2D affine transform math.
 *
 * A parent map embeds a child map as a TYPED REFERENCE plus a transform, NOT a copy of the child
 * (Architecture Contract 4 "Embed, Link, and Project Rules": embedding does not clone target data;
 * the source/scene owns placement, the target entity owns its data). This is the keystone of the
 * epic's permission promise (MAP-008 AC2): because an embed only references the child by id, the
 * child keeps its OWN independent `layers` AND `visibility`/permission model. A `dm-only` child stays
 * `dm-only` for a player even when the parent is `player-visible`; the embed never widens the child's
 * access. Visibility is always resolved against the LIVE child entity, never against a flattened copy.
 *
 * This module is pure Processing-Core policy (Contract 1): graph validation (cycles, depth),
 * ancestor/descendant walks, and affine transform composition/inversion are deterministic,
 * side-effect-free functions over plain serializable records. The GUI/renderer consumes the computed
 * models; per ADR-014 the pixel rendering engine is deferred, so this delivers the LOGICAL model only.
 *
 * Coordinate convention: every transform maps a point in the CHILD map's normalized space (0..1) into
 * the PARENT map's normalized space. A child placed at `position {x,y}` with uniform `scale` and
 * `rotationDegrees` therefore occupies a `scale`-sized, rotated footprint anchored at `position` on
 * the parent. Composition across depth multiplies these transforms so a grandchild point resolves
 * deterministically all the way up to the root (MAP-017 AC2).
 */

/** How crossing the embed boundary behaves when a participant scrolls/zooms (MAP-008). Presentation
 *  intent only — the logical transition model (MAP-009) reads it; no animation is implemented here. */
export type MapTransitionBehavior =
	| 'zoom' // the viewport smoothly zooms into/out of the child at the embed footprint.
	| 'instant' // crossing the threshold swaps maps with no intermediate zoom.
	| 'fade'; // crossing cross-fades; logically identical to `instant` for viewport math.

export const SUPPORTED_TRANSITION_BEHAVIORS: readonly MapTransitionBehavior[] = Object.freeze([
	'zoom',
	'instant',
	'fade',
]);

/**
 * MAP-008 — the placement of a child inside a parent: a 2D affine transform expressed as
 * position + uniform scale + rotation (degrees). Stored on the PARENT, in the parent's normalized
 * space. Uniform scale keeps the child's aspect ratio (a map is a fixed-aspect image), which also
 * keeps the inverse well-defined for the parent↔child viewport math (MAP-009).
 */
export interface MapEmbedTransform {
	/** Anchor of the child's origin (its 0,0 corner) in the parent's normalized space. */
	position: { x: number; y: number };
	/** Uniform scale: the child's full normalized width occupies `scale` of the parent's width. */
	scale: number;
	/** Clockwise rotation of the child within the parent, in degrees. */
	rotationDegrees: number;
}

/**
 * MAP-008 — a single embed: a typed reference from a parent map to a child map, with the placement
 * transform and the transition behavior. The embed lives on the parent (`MapEntity.embeds`). It NEVER
 * carries the child's layers, name, or visibility — those are read live from the child entity, so the
 * child's independent permission model is always authoritative (MAP-008 AC2 / MAP-017 AC3).
 */
export interface MapEmbed {
	/** Stable id of this embed relationship (distinct from the child map id; a parent may embed the
	 *  same child more than once at different transforms). */
	id: string;
	/** The embedded CHILD map's id. The child entity is resolved live; the embed stores no copy. */
	childMapId: string;
	/** Placement of the child within the parent (parent normalized space). */
	transform: MapEmbedTransform;
	/** How scroll/zoom crosses this embed boundary (MAP-008). */
	transitionBehavior: MapTransitionBehavior;
	/**
	 * The normalized zoom threshold at which a parent→child transition fires (MAP-009 AC1). When the
	 * effective on-screen scale of the child footprint exceeds this, the viewport transitions into the
	 * child. In (0, 1]; defaults applied at creation. Higher = the user must zoom in further first.
	 */
	transitionThreshold: number;
}

/** MAP-017 — the configured maximum nesting depth (root counts as depth 0). A 4-level world →
 *  region → city → building chain (MAP-017 AC2) has depth 3, so the supported depth must be ≥ 3. We
 *  set the bound at 8 to comfortably cover deep campaign atlases while still bounding graph walks and
 *  transform composition cost. An embed that would create a chain deeper than this is rejected. */
export const MAX_NESTING_DEPTH = 8 as const;

/** Default transition threshold when the DM does not specify one. */
export const DEFAULT_TRANSITION_THRESHOLD = 0.6 as const;

/** Why a proposed embed is rejected. The graph layer surfaces these; the command layer maps them to
 *  a `CommandRejection`. */
export type MapNestingError =
	| { kind: 'child-not-found'; childMapId: string }
	| { kind: 'self-embed'; mapId: string }
	| { kind: 'cycle'; parentMapId: string; childMapId: string }
	| { kind: 'max-depth-exceeded'; limit: number; wouldBeDepth: number }
	| { kind: 'duplicate-embed-id'; embedId: string }
	| { kind: 'embed-not-found'; embedId: string }
	| { kind: 'invalid-transform'; message: string }
	| { kind: 'invalid-threshold'; message: string };

// ---------------------------------------------------------------------------
// Graph helpers (pure, read-only). All references are by map id; a missing child is treated as a
// broken link (handled non-leaking at the query layer), never as an exception here.
// ---------------------------------------------------------------------------

/** The set of child map ids a map directly embeds. */
export function directChildMapIds(map: MapEntity | undefined): string[] {
	if (!map) return [];
	return map.embeds.map((embed) => embed.childMapId);
}

/**
 * Walk the nesting graph from `rootMapId` and return every map id reachable as a descendant
 * (transitively), EXCLUDING the root itself. Cycle-safe: a `visited` set bounds the walk even if the
 * stored graph somehow already contains a cycle (defense in depth — the commands reject cycles, but a
 * corrupt/synced state must not loop the walk). A missing child id is simply not expanded.
 */
export function descendantMapIds(maps: MapState['maps'], rootMapId: string): Set<string> {
	const seen = new Set<string>();
	const stack = directChildMapIds(maps[rootMapId]);
	while (stack.length > 0) {
		const next = stack.pop()!;
		if (seen.has(next)) continue;
		seen.add(next);
		for (const grandChild of directChildMapIds(maps[next])) {
			if (!seen.has(grandChild)) stack.push(grandChild);
		}
	}
	return seen;
}

/**
 * Return every map id that is an ANCESTOR of `targetMapId` (a map that can reach it through embeds),
 * EXCLUDING the target itself. Computed by scanning all maps for those whose descendant set contains
 * the target. Cycle-safe via {@link descendantMapIds}.
 */
export function ancestorMapIds(maps: MapState['maps'], targetMapId: string): Set<string> {
	const ancestors = new Set<string>();
	for (const mapId of Object.keys(maps)) {
		if (mapId === targetMapId) continue;
		if (descendantMapIds(maps, mapId).has(targetMapId)) ancestors.add(mapId);
	}
	return ancestors;
}

/**
 * The maximum depth of the subtree rooted at `mapId` (the longest chain of embeds below it). A leaf
 * map (no embeds) has subtree depth 0. Cycle-safe: a node already on the current path contributes 0
 * rather than recursing forever. Used to enforce {@link MAX_NESTING_DEPTH} when adding an embed.
 */
export function subtreeDepth(
	maps: MapState['maps'],
	mapId: string,
	onPath: Set<string> = new Set(),
): number {
	if (onPath.has(mapId)) return 0;
	const children = directChildMapIds(maps[mapId]);
	if (children.length === 0) return 0;
	const nextPath = new Set(onPath).add(mapId);
	let deepest = 0;
	for (const childId of children) {
		const childDepth = 1 + subtreeDepth(maps, childId, nextPath);
		if (childDepth > deepest) deepest = childDepth;
	}
	return deepest;
}

// ---------------------------------------------------------------------------
// 2D affine transform math (pure). A transform maps CHILD-normalized space → PARENT-normalized space.
// ---------------------------------------------------------------------------

export interface Point2D {
	x: number;
	y: number;
}

/**
 * A 2x3 affine matrix `[a c e; b d f]` mapping `(x, y) -> (a*x + c*y + e, b*x + d*y + f)`. This is the
 * composable form of a {@link MapEmbedTransform}; composing matrices is associative and exact, so a
 * multi-level chain (world→region→city→building) composes to a single matrix whose inverse round-trips
 * (MAP-017 AC2).
 */
export interface AffineMatrix {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
}

/** The identity transform — a point maps to itself. */
export const IDENTITY_MATRIX: AffineMatrix = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

const DEG_TO_RAD = Math.PI / 180;

/**
 * Build the affine matrix for an embed transform: translate by `position` after rotating then scaling
 * about the child origin. Order: scale → rotate → translate, i.e. a child point `p` maps to
 * `position + R(rotation) * (scale * p)`. With uniform scale `s` and rotation `θ`:
 *   a =  s·cosθ   c = -s·sinθ   e = position.x
 *   b =  s·sinθ   d =  s·cosθ   f = position.y
 */
export function embedTransformToMatrix(transform: MapEmbedTransform): AffineMatrix {
	const theta = transform.rotationDegrees * DEG_TO_RAD;
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	const s = transform.scale;
	return {
		a: s * cos,
		b: s * sin,
		c: -s * sin,
		d: s * cos,
		e: transform.position.x,
		f: transform.position.y,
	};
}

/**
 * Compose two affine matrices: `compose(outer, inner)` applies `inner` first, then `outer`. For a
 * nesting chain parent→child→grandchild, the parent→grandchild matrix is
 * `compose(parent→child, child→grandchild)`. Pure multiplication; associative.
 */
export function composeMatrix(outer: AffineMatrix, inner: AffineMatrix): AffineMatrix {
	return {
		a: outer.a * inner.a + outer.c * inner.b,
		b: outer.b * inner.a + outer.d * inner.b,
		c: outer.a * inner.c + outer.c * inner.d,
		d: outer.b * inner.c + outer.d * inner.d,
		e: outer.a * inner.e + outer.c * inner.f + outer.e,
		f: outer.b * inner.e + outer.d * inner.f + outer.f,
	};
}

/** The determinant of the linear part. Non-zero for any positive-scale embed, so the inverse exists. */
export function matrixDeterminant(m: AffineMatrix): number {
	return m.a * m.d - m.b * m.c;
}

/**
 * Invert an affine matrix (maps PARENT space → CHILD space). Returns `null` when the matrix is
 * singular (determinant ~0, e.g. a degenerate zero-scale embed) so callers fail closed rather than
 * producing NaN coordinates.
 */
export function invertMatrix(m: AffineMatrix): AffineMatrix | null {
	const det = matrixDeterminant(m);
	if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
	const inv = 1 / det;
	const a = m.d * inv;
	const b = -m.b * inv;
	const c = -m.c * inv;
	const d = m.a * inv;
	return {
		a,
		b,
		c,
		d,
		e: -(a * m.e + c * m.f),
		f: -(b * m.e + d * m.f),
	};
}

/** Apply an affine matrix to a point. */
export function applyMatrix(m: AffineMatrix, p: Point2D): Point2D {
	return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/**
 * Compose the full CHILD→ROOT transform for a chain of embeds, parent-first. Given the ordered list of
 * transforms from the outermost parent down to the deepest child, returns the single matrix mapping a
 * point in the deepest child's space all the way up to the outermost parent's space. An empty chain is
 * the identity. This is the determinism anchor for MAP-017 AC2: the same chain always composes to the
 * same matrix, and `invertMatrix(compose(...))` round-trips a point to within floating tolerance.
 */
export function composeChain(transforms: readonly MapEmbedTransform[]): AffineMatrix {
	let matrix: AffineMatrix = { ...IDENTITY_MATRIX };
	for (const transform of transforms) {
		matrix = composeMatrix(matrix, embedTransformToMatrix(transform));
	}
	return matrix;
}

// ---------------------------------------------------------------------------
// Validation (pure). The single place the embed graph rules are enforced; the command handler maps
// the returned error to a rejection. Fail-closed: anything ambiguous is rejected, nothing is mutated.
// ---------------------------------------------------------------------------

/** Validate a transform's numeric fields (finite, positive scale, finite rotation). */
export function validateEmbedTransform(transform: MapEmbedTransform): MapNestingError | null {
	const { position, scale, rotationDegrees } = transform;
	if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
		return { kind: 'invalid-transform', message: 'Embed position must be finite.' };
	}
	if (!Number.isFinite(scale) || scale <= 0) {
		return { kind: 'invalid-transform', message: 'Embed scale must be a positive, finite number.' };
	}
	if (!Number.isFinite(rotationDegrees)) {
		return { kind: 'invalid-transform', message: 'Embed rotation must be finite.' };
	}
	return null;
}

/** Validate a transition threshold (finite, in (0, 1]). */
export function validateTransitionThreshold(threshold: number): MapNestingError | null {
	if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
		return {
			kind: 'invalid-threshold',
			message: 'Transition threshold must be a finite number in (0, 1].',
		};
	}
	return null;
}

export interface AddEmbedRequest {
	parentMapId: string;
	embedId: string;
	childMapId: string;
	transform: MapEmbedTransform;
	transitionBehavior: MapTransitionBehavior;
	transitionThreshold: number;
}

/**
 * MAP-017 — validate adding an embed of `childMapId` under `parentMapId` against the WHOLE graph.
 * Rejects, fail-closed and in priority order:
 *   1. an unknown child (`child-not-found`);
 *   2. a self-embed (`self-embed`) — a map cannot embed itself;
 *   3. a CYCLE (`cycle`) — the child must not already be an ancestor of the parent, i.e. the parent
 *      must not be the child or any descendant of the child (MAP-017 AC1);
 *   4. a duplicate embed id (`duplicate-embed-id`);
 *   5. an invalid transform/threshold;
 *   6. a chain that would exceed {@link MAX_NESTING_DEPTH} (`max-depth-exceeded`).
 * Returns `null` when the embed is safe to add.
 */
export function validateAddEmbed(
	maps: MapState['maps'],
	request: AddEmbedRequest,
): MapNestingError | null {
	const parent = maps[request.parentMapId];
	if (!parent) {
		// The command layer resolves the parent first, but guard defensively.
		return { kind: 'embed-not-found', embedId: request.parentMapId };
	}
	if (!maps[request.childMapId]) {
		return { kind: 'child-not-found', childMapId: request.childMapId };
	}
	if (request.childMapId === request.parentMapId) {
		return { kind: 'self-embed', mapId: request.parentMapId };
	}

	// Cycle: embedding the child must not make the parent a descendant of itself. A cycle forms iff the
	// parent is the child OR the parent is already a descendant of the child (so the child can reach the
	// parent). Equivalently: the child is an ancestor of the parent.
	const childDescendants = descendantMapIds(maps, request.childMapId);
	if (childDescendants.has(request.parentMapId)) {
		return { kind: 'cycle', parentMapId: request.parentMapId, childMapId: request.childMapId };
	}

	if (parent.embeds.some((embed) => embed.id === request.embedId)) {
		return { kind: 'duplicate-embed-id', embedId: request.embedId };
	}

	const transformError = validateEmbedTransform(request.transform);
	if (transformError) return transformError;
	const thresholdError = validateTransitionThreshold(request.transitionThreshold);
	if (thresholdError) return thresholdError;

	// Depth: the new chain length through this embed = (parent's depth from its deepest root) + 1 (the
	// new edge) + (child's deepest subtree). Reject if that exceeds the configured bound. We simulate
	// adding the edge so the check accounts for the child's existing subtree under the new parent.
	const parentDepth = longestPathFromAnyRoot(maps, request.parentMapId);
	const childSubtree = subtreeDepth(maps, request.childMapId);
	const wouldBeDepth = parentDepth + 1 + childSubtree;
	if (wouldBeDepth > MAX_NESTING_DEPTH) {
		return { kind: 'max-depth-exceeded', limit: MAX_NESTING_DEPTH, wouldBeDepth };
	}

	return null;
}

/**
 * MAP-008 — pure reducer: add a validated embed to the parent's embed list. The caller MUST have
 * already run {@link validateAddEmbed} (the command handler does); this only builds the record and
 * appends it. Returns a new embed array (never mutates the input).
 */
export function addEmbed(parent: MapEntity, request: AddEmbedRequest): MapEmbed[] {
	const embed: MapEmbed = {
		id: request.embedId,
		childMapId: request.childMapId,
		transform: { ...request.transform, position: { ...request.transform.position } },
		transitionBehavior: request.transitionBehavior,
		transitionThreshold: request.transitionThreshold,
	};
	return [...parent.embeds, embed];
}

export interface UpdateEmbedPatch {
	transform?: MapEmbedTransform;
	transitionBehavior?: MapTransitionBehavior;
	transitionThreshold?: number;
}

/**
 * MAP-008 — pure reducer: update an existing embed's transform/behavior/threshold. Validates the
 * supplied fields fail-closed (an invalid transform/threshold rejects the whole update; the prior
 * embed list is untouched). The child reference and embed id are immutable through this path — moving
 * a child to a different parent is a remove + add so the graph integrity checks re-run.
 */
export function updateEmbed(
	parent: MapEntity,
	embedId: string,
	patch: UpdateEmbedPatch,
): { embeds: MapEmbed[] } | { error: MapNestingError } {
	const existing = parent.embeds.find((embed) => embed.id === embedId);
	if (!existing) return { error: { kind: 'embed-not-found', embedId } };
	if (patch.transform) {
		const transformError = validateEmbedTransform(patch.transform);
		if (transformError) return { error: transformError };
	}
	if (patch.transitionThreshold !== undefined) {
		const thresholdError = validateTransitionThreshold(patch.transitionThreshold);
		if (thresholdError) return { error: thresholdError };
	}
	const next: MapEmbed = {
		...existing,
		transform: patch.transform
			? { ...patch.transform, position: { ...patch.transform.position } }
			: existing.transform,
		transitionBehavior: patch.transitionBehavior ?? existing.transitionBehavior,
		transitionThreshold: patch.transitionThreshold ?? existing.transitionThreshold,
	};
	return { embeds: parent.embeds.map((embed) => (embed.id === embedId ? next : embed)) };
}

/**
 * MAP-008 — pure reducer: remove an embed by id. Returns the new embed array, or an error when no
 * embed with that id exists. Removing an embed never deletes the child map (Contract 4: an embed owns
 * only the placement; the target entity owns its data).
 */
export function removeEmbed(
	parent: MapEntity,
	embedId: string,
): { embeds: MapEmbed[] } | { error: MapNestingError } {
	if (!parent.embeds.some((embed) => embed.id === embedId)) {
		return { error: { kind: 'embed-not-found', embedId } };
	}
	return { embeds: parent.embeds.filter((embed) => embed.id !== embedId) };
}

/**
 * The longest path (number of edges) from ANY root down to `mapId`. A root is a map with no ancestors.
 * Cycle-safe via memo + on-path guard. This is the precise depth measure used by the depth bound.
 */
export function longestPathFromAnyRoot(maps: MapState['maps'], mapId: string): number {
	// longest path TO mapId = max over parents of (1 + longest path to parent); 0 if no parents.
	const memo = new Map<string, number>();
	const visiting = new Set<string>();
	const parentsOf = (id: string): string[] => {
		const parents: string[] = [];
		for (const candidateId of Object.keys(maps)) {
			if (directChildMapIds(maps[candidateId]).includes(id)) parents.push(candidateId);
		}
		return parents;
	};
	const walk = (id: string): number => {
		if (memo.has(id)) return memo.get(id)!;
		if (visiting.has(id)) return 0; // cycle guard
		visiting.add(id);
		let best = 0;
		for (const parentId of parentsOf(id)) {
			const candidate = 1 + walk(parentId);
			if (candidate > best) best = candidate;
		}
		visiting.delete(id);
		memo.set(id, best);
		return best;
	};
	return walk(mapId);
}
