import type { MapFeature, MapLayer } from './map-state';
import { normalizeMapLayer } from './map-state';
import type { SceneVisibility } from './scene-state';
import { createRng, type SeededRng } from './prng';

/**
 * MAP-004 — deterministic procedural map generation.
 *
 * Generation produces EDITABLE map layers (MapLayer[] with painted `content`) from EXPLICIT parameters
 * plus an explicit seed. It is a pure, deterministic function of its parameters: the same parameters
 * (including the seed) produce BYTE-IDENTICAL layers every time, and NO ambient nondeterminism is used
 * (no `Math.random()`, no `Date.now()` — all randomness flows from the seeded PRNG in `prng.ts`). This
 * is a hard Contract 2 requirement: two devices replaying the same generate command must produce
 * identical layers so the operation is sync-replayable/mergeable.
 *
 * The result is saved AS the existing MAP layer model (MAP-005), so the DM can immediately draw on the
 * generated layers with the MAP-003 paint command. Generation is BOUNDED for the prototype: sizes are
 * capped via parameters so a generate stays fast and the content stays small.
 *
 * Layer ids/feature ids are derived DETERMINISTICALLY from an `idPrefix` parameter (carried in the
 * command) rather than a random/time id, so the generated ids are reproducible across devices too.
 */

export type MapGenerationKind = 'terrain' | 'settlement' | 'dungeon';

/** Hard caps so the prototype stays bounded and fast regardless of requested size. */
export const MAX_GENERATION_DIMENSION = 24;
export const MIN_GENERATION_DIMENSION = 2;

export interface MapGenerationParams {
	kind: MapGenerationKind;
	/** Explicit seed — the determinism anchor. Same seed + params ⇒ identical output. */
	seed: number | string;
	/** Grid width in cells (MIN..MAX). */
	width: number;
	/** Grid height in cells (MIN..MAX). */
	height: number;
	/**
	 * Density 0..1 — for terrain, the fraction of cells that get a terrain feature; for settlements,
	 * the count of buildings; for dungeons, the room count target. Bounded so generation never runs
	 * unbounded.
	 */
	density: number;
	/** Player-facing visibility for the generated layers (defaults to fail-closed `dm-only`). */
	visibility: SceneVisibility;
	/** Deterministic id prefix for the generated layers/features (no random/time ids). */
	idPrefix: string;
}

export type MapGenerationError =
	| { kind: 'invalid-dimension'; message: string }
	| { kind: 'invalid-density'; message: string }
	| { kind: 'invalid-kind'; message: string }
	| { kind: 'invalid-id-prefix'; message: string };

/** Validate parameters fail-closed BEFORE any layer is built, so a rejected generation persists
 *  no partial layers (MAP-004 AC2). */
export function validateGenerationParams(params: MapGenerationParams): MapGenerationError | null {
	if (params.kind !== 'terrain' && params.kind !== 'settlement' && params.kind !== 'dungeon') {
		return { kind: 'invalid-kind', message: `Unknown generation kind "${String(params.kind)}".` };
	}
	if (params.idPrefix.trim().length === 0) {
		return { kind: 'invalid-id-prefix', message: 'A deterministic id prefix is required.' };
	}
	for (const [label, value] of [
		['width', params.width],
		['height', params.height],
	] as const) {
		if (
			!Number.isInteger(value) ||
			value < MIN_GENERATION_DIMENSION ||
			value > MAX_GENERATION_DIMENSION
		) {
			return {
				kind: 'invalid-dimension',
				message: `${label} must be an integer in [${MIN_GENERATION_DIMENSION}, ${MAX_GENERATION_DIMENSION}].`,
			};
		}
	}
	if (!Number.isFinite(params.density) || params.density < 0 || params.density > 1) {
		return { kind: 'invalid-density', message: 'density must be in [0, 1].' };
	}
	return null;
}

/** Round to a fixed number of decimals so normalized coordinates are STABLE across platforms (a
 *  float printed identically everywhere) — part of the byte-identical determinism contract. */
function norm(value: number): number {
	return Math.round(value * 1_000_000) / 1_000_000;
}

const TERRAIN_STYLES = ['terrain:forest', 'terrain:hills', 'terrain:water', 'terrain:plains'];

/** Build a single layer record from generated features, normalized through the MAP-005 layer model so
 *  the result is a fully-formed, editable layer. */
function buildLayer(
	id: string,
	name: string,
	category: MapLayer['category'],
	visibility: SceneVisibility,
	content: MapFeature[],
	order: number,
	stamp: { actorId: string; now: string },
): MapLayer {
	return normalizeMapLayer(
		{
			id,
			name,
			category,
			visibility,
			enabled: true,
			opacity: 1,
			content,
			updatedBy: stamp.actorId,
			updatedAt: stamp.now,
		},
		order,
	);
}

/** Terrain: a base grid of filled cells, each assigned a deterministic terrain style by density. */
function generateTerrain(
	params: MapGenerationParams,
	rng: SeededRng,
	stamp: { actorId: string; now: string },
): MapLayer[] {
	const features: MapFeature[] = [];
	const cellW = 1 / params.width;
	const cellH = 1 / params.height;
	for (let y = 0; y < params.height; y += 1) {
		for (let x = 0; x < params.width; x += 1) {
			if (!rng.chance(params.density)) continue;
			const style = rng.pick(TERRAIN_STYLES);
			features.push({
				id: `${params.idPrefix}-terrain-${x}-${y}`,
				kind: 'fill',
				points: [
					{ x: norm(x * cellW), y: norm(y * cellH) },
					{ x: norm((x + 1) * cellW), y: norm((y + 1) * cellH) },
				],
				style,
			});
		}
	}
	return [
		buildLayer(
			`${params.idPrefix}-terrain`,
			'Generated Terrain',
			'terrain',
			params.visibility,
			features,
			0,
			stamp,
		),
	];
}

/** Settlement: a roads layer (a few crossing streets) plus a buildings layer of placed structures. */
function generateSettlement(
	params: MapGenerationParams,
	rng: SeededRng,
	stamp: { actorId: string; now: string },
): MapLayer[] {
	const roadCount = Math.max(1, Math.round(params.density * 4) + 1);
	const roads: MapFeature[] = [];
	for (let i = 0; i < roadCount; i += 1) {
		const horizontal = rng.chance(0.5);
		const offset = norm(rng.nextInt(1, 9) / 10);
		roads.push({
			id: `${params.idPrefix}-road-${i}`,
			kind: 'road',
			points: horizontal
				? [
						{ x: 0, y: offset },
						{ x: 1, y: offset },
					]
				: [
						{ x: offset, y: 0 },
						{ x: offset, y: 1 },
					],
			style: 'road:street',
		});
	}
	const buildingCount = Math.max(1, Math.round(params.density * params.width * params.height) || 1);
	const buildings: MapFeature[] = [];
	for (let i = 0; i < buildingCount; i += 1) {
		const cx = rng.nextInt(0, params.width - 1) / params.width;
		const cy = rng.nextInt(0, params.height - 1) / params.height;
		const w = 0.8 / params.width;
		const h = 0.8 / params.height;
		buildings.push({
			id: `${params.idPrefix}-building-${i}`,
			kind: 'room',
			points: [
				{ x: norm(cx), y: norm(cy) },
				{ x: norm(cx + w), y: norm(cy + h) },
			],
			style: 'building:house',
		});
	}
	return [
		buildLayer(
			`${params.idPrefix}-roads`,
			'Generated Roads',
			'roads',
			params.visibility,
			roads,
			0,
			stamp,
		),
		buildLayer(
			`${params.idPrefix}-buildings`,
			'Generated Buildings',
			'base',
			params.visibility,
			buildings,
			1,
			stamp,
		),
	];
}

/** Dungeon: a rooms layer (placed rectangular rooms) plus a corridors layer connecting them. */
function generateDungeon(
	params: MapGenerationParams,
	rng: SeededRng,
	stamp: { actorId: string; now: string },
): MapLayer[] {
	const roomTarget = Math.max(1, Math.round(params.density * params.width) + 1);
	const rooms: MapFeature[] = [];
	const centers: Array<{ x: number; y: number }> = [];
	for (let i = 0; i < roomTarget; i += 1) {
		const rw = rng.nextInt(1, Math.max(1, Math.floor(params.width / 3)));
		const rh = rng.nextInt(1, Math.max(1, Math.floor(params.height / 3)));
		const rx = rng.nextInt(0, Math.max(0, params.width - rw));
		const ry = rng.nextInt(0, Math.max(0, params.height - rh));
		const x0 = rx / params.width;
		const y0 = ry / params.height;
		const x1 = (rx + rw) / params.width;
		const y1 = (ry + rh) / params.height;
		rooms.push({
			id: `${params.idPrefix}-room-${i}`,
			kind: 'room',
			points: [
				{ x: norm(x0), y: norm(y0) },
				{ x: norm(x1), y: norm(y1) },
			],
			style: 'dungeon:room',
		});
		centers.push({ x: norm((x0 + x1) / 2), y: norm((y0 + y1) / 2) });
	}
	const corridors: MapFeature[] = [];
	for (let i = 1; i < centers.length; i += 1) {
		const from = centers[i - 1]!;
		const to = centers[i]!;
		corridors.push({
			id: `${params.idPrefix}-corridor-${i}`,
			kind: 'wall',
			// L-shaped corridor: horizontal then vertical, in normalized space.
			points: [
				{ x: from.x, y: from.y },
				{ x: to.x, y: from.y },
				{ x: to.x, y: to.y },
			],
			style: 'dungeon:corridor',
		});
	}
	return [
		buildLayer(
			`${params.idPrefix}-rooms`,
			'Generated Rooms',
			'base',
			params.visibility,
			rooms,
			0,
			stamp,
		),
		buildLayer(
			`${params.idPrefix}-corridors`,
			'Generated Corridors',
			'dm-annotations',
			params.visibility,
			corridors,
			1,
			stamp,
		),
	];
}

export interface GenerateMapLayersResult {
	layers: MapLayer[];
}

/**
 * MAP-004: generate editable map layers from explicit parameters + seed. Deterministic — the same
 * params produce identical layers. Validates fail-closed first (an invalid param set yields an error
 * and NO layers, so a rejected generation persists nothing). The caller (command handler) inserts the
 * returned layers into the map's layer set through the MAP-005 layer model.
 *
 * The order of PRNG calls inside each generator is fixed and part of the determinism contract; do not
 * reorder generation loops without versioning the algorithm.
 */
export function generateMapLayers(
	params: MapGenerationParams,
	stamp: { actorId: string; now: string },
): GenerateMapLayersResult | { error: MapGenerationError } {
	const invalid = validateGenerationParams(params);
	if (invalid) return { error: invalid };
	const rng = createRng(params.seed);
	switch (params.kind) {
		case 'terrain':
			return { layers: generateTerrain(params, rng, stamp) };
		case 'settlement':
			return { layers: generateSettlement(params, rng, stamp) };
		case 'dungeon':
			return { layers: generateDungeon(params, rng, stamp) };
	}
}
