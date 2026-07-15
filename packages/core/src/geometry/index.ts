/**
 * The GEOMETRY KIT — the shared toolbox every procedural generator in `src/generation/` is built from.
 *
 * The shape of the whole thing follows one decision: the persisted map model is VECTORS in normalized
 * 0..1 space, but half the good procgen algorithms are raster. So a generator rasterizes into a scratch
 * `CellGrid`, does its raster work there, and exits through `contourGrid` / `unionBoundary` back into
 * rings — which then get simplified, smoothed, and normalized before anyone sees them. Nothing in here
 * persists a grid, and nothing in here reads a clock or `Math.random()`: every coordinate emitted goes
 * through `norm()`, and every random draw comes from an injected `SeededRng`, because two devices
 * replaying the same generate command must produce byte-identical output (Contract 2).
 */

export type { Point, Polyline, Rect, Ring } from './types';

export {
	boundsOf,
	centroid,
	clamp,
	clamp01,
	dist,
	dist2,
	lerpPoint,
	polylineLength,
	rectCenter,
	rectsOverlap,
	rectToRing,
} from './vec';

export { chaikin, resample, simplify } from './simplify';

export {
	isClockwise,
	offsetPolyline,
	pointInRing,
	polygonCentroid,
	ringArea,
	ringPerimeter,
} from './polygon';

export type { CellGrid } from './grid';
export {
	createGrid,
	floodRegions,
	gridCount,
	gridGet,
	gridSet,
	rasterizePolyline,
	rasterizeRing,
} from './grid';

export type { ContourOptions } from './marching';
export { contourGrid, unionBoundary } from './marching';

export type { FbmOptions, NoiseField } from './noise';
export { createValueNoise, domainWarp, fbm } from './noise';

export type { PoissonOptions } from './poisson';
export { poissonDisk } from './poisson';

export type { Triangulation } from './delaunay';
export { delaunay, lloydRelax, minimumSpanningTree, voronoiCells } from './delaunay';

export { distanceField } from './distance';

export {
	pointToSegmentDistance,
	raySegmentHit,
	segmentIntersection,
	segmentsIntersect,
} from './intersect';
