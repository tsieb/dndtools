import type { MapEntity, MapFeature } from '../state/map-state';
import { norm } from '../generation/types';

/**
 * MAP-021 — Universal VTT (`.uvtt` / `.dd2vtt`) export.
 *
 * Research §8.3: "This is THE export format. Emit this and you're compatible with Foundry (via the
 * Universal Battlemap Importer), Fantasy Grounds Unity, Arkenforge, Roll20 (via converters), MapTool,
 * and Above VTT — from one exporter." One file, six targets, and the reason a generated map stops being
 * a picture and starts being a scene with working line-of-sight the moment it lands in someone's VTT.
 *
 * This exporter is only possible because the model is VECTOR. A raster tool has to ship an image and let
 * the GM trace the walls by hand; we already know exactly where every wall, door and light is, because
 * `generation/derive.ts` computed them from the floor geometry. The whole conversion is a scale factor.
 *
 * THE GOTCHA, and it is the one thing implementations get wrong: **every UVTT coordinate is in GRID
 * SQUARES (floats), not pixels.** `pixels_per_grid` exists to tell the importer how big a square is in
 * the accompanying IMAGE; it does not scale the geometry. Our model is normalized 0..1, so the transform
 * is `square = normalized * squaresAcross` — and a wall at normalized x = 0.5 on a 30-square map exports
 * at x = 15, not x = 0.5 and not x = 1500.
 */

export interface UvttPoint {
	x: number;
	y: number;
}

export interface UvttResolution {
	map_origin: UvttPoint;
	/** Map extent in GRID SQUARES (not pixels). */
	map_size: UvttPoint;
	/** How many image pixels one grid square spans. Describes the IMAGE, never the geometry. */
	pixels_per_grid: number;
}

export interface UvttPortal {
	/** Centre of the portal, in grid squares. */
	position: UvttPoint;
	/** The two ends of the portal's span, in grid squares. */
	bounds: UvttPoint[];
	/** Orientation along the wall, in RADIANS. */
	rotation: number;
	closed: boolean;
	/** True for a door with no wall either side of it (a standalone gate). Derived doors sit on walls. */
	freestanding: boolean;
}

export interface UvttEnvironment {
	/** Is the lighting already burned into the image? When true, a VTT will not re-light the scene. */
	baked_lighting: boolean;
	/** Hex RGBA. */
	ambient_light: string;
}

export interface UvttLight {
	position: UvttPoint;
	/** Reach in GRID SQUARES. */
	range: number;
	intensity: number;
	/** Hex RGB. */
	color: string;
	shadows: boolean;
}

/** The `.uvtt` / `.dd2vtt` document, format 0.3. Field names and casing are the format's, not ours. */
export interface UvttDocument {
	format: number;
	resolution: UvttResolution;
	/** Wall polylines, in grid squares. These ARE the line-of-sight occluders. */
	line_of_sight: UvttPoint[][];
	/** Furniture/objects that block sight, kept separate so a VTT can toggle them independently. */
	objects_line_of_sight: UvttPoint[][];
	portals: UvttPortal[];
	environment: UvttEnvironment;
	lights: UvttLight[];
	/** Base64 PNG/WEBP of the rendered map, WITHOUT a `data:` prefix. Empty when no image was supplied. */
	image: string;
}

export interface UvttExportOptions {
	/** `pixels_per_grid` — how many image pixels one grid square spans. Default 100. */
	gridSize?: number;
	/**
	 * The rendered map image, as a data URL or bare base64. The `data:image/png;base64,` prefix is
	 * stripped: UVTT wants the raw base64 payload, and an importer handed the prefix rejects the file.
	 */
	imageDataUrl?: string;
	/** Is the lighting already burned into that image? Default false — we ship dynamic lights. */
	bakedLighting?: boolean;
	/** Hex RGBA. Default `ffffffff` (fully lit); use a dark value for a dungeon that needs torches. */
	ambientLight?: string;
	/**
	 * Override the map's square count. Normally derived from `map.overlay.gridSize` (cells across the
	 * normalized width) and cross-checked against `map.scale`.
	 */
	squaresAcross?: number;
}

const DEFAULT_SQUARES_ACROSS = 30;

/**
 * How many grid squares span the map. Normalized space is 0..1 on BOTH axes, so this one number is both
 * the width and the height.
 *
 * `overlay.gridSize` is the authored answer (its own docs: "grid cells across the normalized map
 * width"). `scale` is the fallback: a 200-foot map at 5 feet per cell is 40 squares across, which is the
 * same statement made in world units, and using it means a map whose grid was never configured still
 * exports at the right size rather than at a silent default.
 */
function squaresAcross(map: MapEntity, options?: UvttExportOptions): number {
	const override = options?.squaresAcross;
	if (typeof override === 'number' && Number.isFinite(override) && override > 0) return override;

	const gridSize = map.overlay?.gridSize;
	if (typeof gridSize === 'number' && Number.isFinite(gridSize) && gridSize > 0) return gridSize;

	const unitsPerCell = map.overlay?.unitsPerCell;
	if (
		map.scale &&
		Number.isFinite(map.scale.unitsPerMap) &&
		map.scale.unitsPerMap > 0 &&
		typeof unitsPerCell === 'number' &&
		unitsPerCell > 0
	) {
		return map.scale.unitsPerMap / unitsPerCell;
	}
	return DEFAULT_SQUARES_ACROSS;
}

/** Every feature on the map, in layer order then content order. Deterministic; no Set/Map iteration. */
function allFeatures(map: MapEntity): MapFeature[] {
	const layers = [...map.layers].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
	const features: MapFeature[] = [];
	for (const layer of layers) features.push(...layer.content);
	return features;
}

function readNumber(feature: MapFeature, key: string, fallback: number): number {
	const value = feature.props?.[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readString(feature: MapFeature, key: string, fallback: string): string {
	const value = feature.props?.[key];
	return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** Strip a data-URL prefix. UVTT's `image` is the raw base64 payload; the prefix makes importers choke. */
function toBase64(imageDataUrl: string | undefined): string {
	if (!imageDataUrl) return '';
	const comma = imageDataUrl.indexOf(',');
	if (imageDataUrl.startsWith('data:') && comma >= 0) return imageDataUrl.slice(comma + 1);
	return imageDataUrl;
}

/**
 * Export a map to a UVTT document. Pure: no clock, no RNG, no mutation of the map.
 *
 * Walls become `line_of_sight` polylines, doors become `portals`, lights become `lights[]` — the
 * irreducible triple every modern VTT wants (research §8.4). A wall explicitly flagged
 * `blocksSight: false` (a window, a rail) is omitted rather than exported as a solid occluder, and a
 * wall flagged `los: 'object'` is routed to `objects_line_of_sight` so the importing VTT can toggle
 * furniture separately from architecture.
 */
export function exportUvtt(map: MapEntity, options?: UvttExportOptions): UvttDocument {
	const squares = squaresAcross(map, options);
	// The one transform in this file. `norm` keeps the emitted floats byte-identical across platforms.
	const toSquare = (p: { x: number; y: number }): UvttPoint => ({
		x: norm(p.x * squares),
		y: norm(p.y * squares),
	});

	const lineOfSight: UvttPoint[][] = [];
	const objectsLineOfSight: UvttPoint[][] = [];
	const portals: UvttPortal[] = [];
	const lights: UvttLight[] = [];

	for (const feature of allFeatures(map)) {
		switch (feature.kind) {
			case 'wall': {
				if (feature.props?.blocksSight === false) continue;
				if (feature.points.length < 2) continue;
				const polyline = feature.points.map(toSquare);
				if (feature.props?.los === 'object') objectsLineOfSight.push(polyline);
				else lineOfSight.push(polyline);
				break;
			}
			case 'door': {
				if (feature.points.length < 2) continue;
				const a = toSquare(feature.points[0]!);
				const b = toSquare(feature.points[1]!);
				const state = readString(feature, 'state', 'closed');
				portals.push({
					position: { x: norm((a.x + b.x) / 2), y: norm((a.y + b.y) / 2) },
					bounds: [a, b],
					// RADIANS, not degrees. A degrees-valued rotation imports as a door lying at a wild angle
					// across the room, which is the classic UVTT bug report.
					rotation: norm(Math.atan2(b.y - a.y, b.x - a.x)),
					closed: state !== 'open',
					freestanding: feature.props?.freestanding === true,
				});
				break;
			}
			case 'light': {
				if (feature.points.length < 1) continue;
				// UVTT carries ONE reach per light. Use the dim radius when we have it — that is the extent a
				// VTT should draw, with the bright radius merely brighter inside it.
				const radius = readNumber(feature, 'radius', 0.05);
				const range = readNumber(feature, 'dimRadius', radius);
				lights.push({
					position: toSquare(feature.points[0]!),
					range: norm(range * squares),
					intensity: norm(readNumber(feature, 'intensity', 1)),
					color: readString(feature, 'color', 'ffd6aa'),
					shadows: feature.props?.shadows !== false,
				});
				break;
			}
			default:
				break;
		}
	}

	return {
		format: 0.3,
		resolution: {
			map_origin: { x: 0, y: 0 },
			map_size: { x: norm(squares), y: norm(squares) },
			pixels_per_grid: options?.gridSize ?? 100,
		},
		line_of_sight: lineOfSight,
		objects_line_of_sight: objectsLineOfSight,
		portals,
		environment: {
			baked_lighting: options?.bakedLighting ?? false,
			ambient_light: options?.ambientLight ?? 'ffffffff',
		},
		lights,
		image: toBase64(options?.imageDataUrl),
	};
}

/** Serialize to the exact bytes a `.uvtt` / `.dd2vtt` file carries. */
export function exportUvttJson(map: MapEntity, options?: UvttExportOptions): string {
	return JSON.stringify(exportUvtt(map, options));
}
