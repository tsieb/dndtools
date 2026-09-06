import { useEffect, useMemo, useRef } from 'react';
import { type MapFeature, type MapLayerQueryEntry } from '@dndtools/core';
import { CATEGORY_VAR } from '../mapVisibility';
import { terrainColor } from '../mapVocab';
import { rectOf } from './geometry';

/**
 * RC-MAP-3.3 — the canvas-2d bake layer for dense static fills.
 *
 * A generated world is mostly *fill*: biome polygons, kingdom territories, lakes and rivers. Those
 * carry no interaction and no semantics — they are the paper the map is printed on — yet as SVG they
 * are the overwhelming majority of the nodes the compositor walks on every pan and zoom frame. The
 * `world.continent` generator's densest output is 324 features carrying 17,917 vertices, and 204 of
 * those features (about 15,000 vertices) are exactly that inert paper.
 *
 * So above a threshold those fills are painted ONCE into a `<canvas>` that sits UNDER the interactive
 * SVG, and the SVG keeps only what a person can point at or a screen reader must reach: POIs, tokens,
 * props, doors, lights, text, roads, walls, routes and the whole fog stack. Nothing about hit-testing
 * or accessibility moves: the feature SVG in `MapSvgLayers.tsx` is already `pointerEvents: 'none'`
 * and the real hit targets are the absolutely-positioned marker divs in `MapMarkers.tsx`, so the
 * canvas is `aria-hidden` decoration by construction.
 *
 * The split, the draw ops and the painting are three separate pure-ish steps ({@link planBake},
 * {@link bakeOps}, {@link paintBake}) so the perf sample can grade a plan without a browser, and so
 * the ops stay a faithful transcription of `FeatureShape.tsx` — a baked map must look identical to
 * an unbaked one, or the threshold becomes a visible mode switch.
 */

/** One layer's visible features, as `MapCanvas` already groups them for the SVG renderer. */
export interface BakeGroup {
	layer: MapLayerQueryEntry;
	features: MapFeature[];
}

/**
 * Feature counts at which baking starts to pay for itself. EITHER trigger fires, because the two
 * measure different costs: a map can be a handful of features carrying thousands of vertices (a
 * generated coastline) or many small ones (a stamped dungeon floor), and both are expensive.
 */
export const BAKE_FEATURE_THRESHOLD = 120;
export const BAKE_VERTEX_THRESHOLD = 4000;

/**
 * Whether a feature is inert static fill. These four kinds have no popover, no drag handle and no
 * entry in the screen-reader inventory — every other kind stays on the SVG where those live.
 */
export function isBakeable(feature: MapFeature): boolean {
	switch (feature.kind) {
		case 'fill':
		case 'room':
		case 'polygon':
		case 'water':
			return true;
		default:
			return false;
	}
}

/** How a map's visible features divide between the bake canvas and the interactive SVG. */
export interface BakePlan {
	/** True when the map crossed a threshold and the fills were moved to the canvas. */
	active: boolean;
	/** Groups the canvas paints. Empty when the plan is inactive. */
	baked: BakeGroup[];
	/** Groups `MapSvgLayers` still renders. The input groups verbatim when the plan is inactive. */
	svg: BakeGroup[];
	bakedFeatures: number;
	bakedVertices: number;
	svgFeatures: number;
	svgVertices: number;
}

function countVertices(features: readonly MapFeature[]): number {
	let total = 0;
	for (const f of features) total += f.points.length;
	return total;
}

/**
 * Split the visible layer groups into a baked half and an SVG half — or leave them alone.
 *
 * Fail-quiet by design: below both thresholds the plan is inactive and `svg` is the input array
 * itself, so a small map takes the exact code path it took before this file existed and pays nothing
 * for the feature (not even a new array identity, which would defeat `MapSvgLayers`' memoization).
 */
export function planBake(
	groups: BakeGroup[],
	thresholds: { features?: number; vertices?: number } = {},
): BakePlan {
	const featureFloor = thresholds.features ?? BAKE_FEATURE_THRESHOLD;
	const vertexFloor = thresholds.vertices ?? BAKE_VERTEX_THRESHOLD;

	let bakeableFeatures = 0;
	let bakeableVertices = 0;
	for (const g of groups) {
		for (const f of g.features) {
			if (!isBakeable(f)) continue;
			bakeableFeatures += 1;
			bakeableVertices += f.points.length;
		}
	}

	if (bakeableFeatures < featureFloor && bakeableVertices < vertexFloor) {
		const svgFeatures = groups.reduce((n, g) => n + g.features.length, 0);
		return {
			active: false,
			baked: [],
			svg: groups,
			bakedFeatures: 0,
			bakedVertices: 0,
			svgFeatures,
			svgVertices: groups.reduce((n, g) => n + countVertices(g.features), 0),
		};
	}

	const baked: BakeGroup[] = [];
	const svg: BakeGroup[] = [];
	let svgFeatures = 0;
	let svgVertices = 0;
	for (const g of groups) {
		const bakedHere: MapFeature[] = [];
		const svgHere: MapFeature[] = [];
		for (const f of g.features) (isBakeable(f) ? bakedHere : svgHere).push(f);
		// Both halves keep their layer entry even when empty on one side: the SVG half must preserve
		// the layer's render ORDER and opacity, and the baked half must preserve its category tint.
		if (bakedHere.length > 0) baked.push({ layer: g.layer, features: bakedHere });
		svg.push({ layer: g.layer, features: svgHere });
		svgFeatures += svgHere.length;
		svgVertices += countVertices(svgHere);
	}

	return {
		active: true,
		baked,
		svg,
		bakedFeatures: bakeableFeatures,
		bakedVertices: bakeableVertices,
		svgFeatures,
		svgVertices,
	};
}

// ── Draw ops ───────────────────────────────────────────────────────────────────────────────────

/**
 * A colour as a semantic token NAME (`--layer-water`) plus an alpha. Never a literal: the canvas
 * resolves the token against its own computed style at paint time, so a theme switch repaints to the
 * new palette exactly as the SVG's `var(--…)` references do.
 */
export interface BakePaint {
	token: string;
	alpha: number;
}

/**
 * One drawing instruction in the SVG's 0–100 viewBox space. `scaledStroke` mirrors SVG's
 * `vectorEffect="non-scaling-stroke"`: false means the width is CSS pixels regardless of zoom (what
 * every `FeatureShape` outline uses), true means it is viewBox units and grows with the map (what a
 * river's width does, because a wide river IS wide on the ground).
 */
export type BakeOp =
	| {
			shape: 'rect';
			x: number;
			y: number;
			w: number;
			h: number;
			fill?: BakePaint;
			stroke?: BakePaint;
			strokeWidth: number;
			scaledStroke: boolean;
	  }
	| {
			shape: 'polygon' | 'polyline';
			points: readonly { x: number; y: number }[];
			fill?: BakePaint;
			stroke?: BakePaint;
			strokeWidth: number;
			scaledStroke: boolean;
			round?: boolean;
	  };

/** `var(--layer-water)` and `--layer-water` both name the same token; ops always carry the bare name. */
function tokenOf(color: string): string {
	const match = /var\(\s*(--[\w-]+)/.exec(color);
	return match ? match[1]! : color;
}

function pointsOf(feature: MapFeature): { x: number; y: number }[] {
	return feature.points.map((p) => ({ x: p.x * 100, y: p.y * 100 }));
}

/**
 * Transcribe the baked groups into draw ops. Every branch mirrors the matching case in
 * `FeatureShape.tsx` — same tint rules, same opacities, same stroke widths — because the only
 * acceptable difference between a baked map and an unbaked one is the frame rate.
 */
export function bakeOps(groups: readonly BakeGroup[]): BakeOp[] {
	const ops: BakeOp[] = [];
	for (const { layer, features } of groups) {
		const category = tokenOf(CATEGORY_VAR[layer.category] ?? '--layer-custom');
		// A layer's own opacity multiplies into every op's alpha, the way the SVG `<g opacity>` does.
		const layerAlpha = typeof layer.opacity === 'number' ? layer.opacity : 1;
		const paintAt = (token: string, alpha: number): BakePaint => ({
			token,
			alpha: alpha * layerAlpha,
		});
		for (const feature of features) {
			const props = feature.props ?? {};
			switch (feature.kind) {
				case 'fill':
				case 'room': {
					const paint = tokenOf(terrainColor(feature.style) ?? category);
					const r = rectOf(feature);
					ops.push({
						shape: 'rect',
						x: r.x,
						y: r.y,
						w: r.w,
						h: r.h,
						fill: paintAt(paint, 0.3),
						stroke: paintAt(paint, 1),
						strokeWidth: 1.4,
						scaledStroke: false,
					});
					break;
				}
				case 'polygon': {
					const isHole = props.hole === true;
					ops.push({
						shape: 'polygon',
						points: pointsOf(feature),
						fill: isHole ? paintAt('--map-canvas-bg', 0.9) : paintAt(category, 0.32),
						stroke: paintAt(category, 1),
						strokeWidth: 1.2,
						scaledStroke: false,
						round: true,
					});
					break;
				}
				default: {
					// 'water' — a river is a flowing polyline, a lake is a filled ring. Distinguished by
					// style/props exactly as FeatureShape does, never by vertex count.
					const isRiver =
						feature.style.includes('river') || props.biome === 'river' || props.flow !== undefined;
					if (isRiver) {
						const width = typeof props.width === 'number' ? Math.max(0.4, props.width * 100) : 1.6;
						ops.push({
							shape: 'polyline',
							points: pointsOf(feature),
							stroke: paintAt('--layer-water', 1),
							strokeWidth: width,
							scaledStroke: true,
							round: true,
						});
					} else {
						ops.push({
							shape: 'polygon',
							points: pointsOf(feature),
							fill: paintAt('--layer-water', 0.45),
							stroke: paintAt('--layer-water', 1),
							strokeWidth: 1,
							scaledStroke: false,
						});
					}
					break;
				}
			}
		}
	}
	return ops;
}

// ── Painting ───────────────────────────────────────────────────────────────────────────────────

/** The largest backing-store multiplier we will allocate. Beyond this the memory costs more than the
 * sharpness buys: a 1200×800 well at 4× is already a 15 M-pixel buffer. */
const MAX_RESOLUTION = 3;

/**
 * Paint the ops into the canvas at its current CSS size. Resolves each token against the canvas's own
 * computed style, so the palette follows the theme without this module knowing a single colour.
 *
 * Returns false when there is nothing to paint into (zero-sized canvas, or a runtime with no 2d
 * context — jsdom). Fail-quiet is right here: the SVG above is still a complete map, so a missing
 * canvas costs frame rate, never correctness.
 */
export function paintBake(canvas: HTMLCanvasElement, ops: readonly BakeOp[], zoom = 1): boolean {
	const cssWidth = canvas.clientWidth;
	const cssHeight = canvas.clientHeight;
	if (cssWidth <= 0 || cssHeight <= 0) return false;
	const ctx = canvas.getContext('2d');
	if (!ctx) return false;

	const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
	// The canvas lives inside the zoomed map div, so at zoom 3 a CSS pixel is drawn 3× larger. Growing
	// the backing store with the zoom keeps a baked coastline as crisp as the SVG one beside it.
	const resolution = Math.min(dpr * Math.max(1, zoom), MAX_RESOLUTION);
	const pixelWidth = Math.round(cssWidth * resolution);
	const pixelHeight = Math.round(cssHeight * resolution);
	if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
		canvas.width = pixelWidth;
		canvas.height = pixelHeight;
	}

	const styles = getComputedStyle(canvas);
	const resolved = new Map<string, string>();
	const colorOf = (token: string): string => {
		const hit = resolved.get(token);
		if (hit !== undefined) return hit;
		const value = styles.getPropertyValue(token).trim() || 'transparent';
		resolved.set(token, value);
		return value;
	};

	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, pixelWidth, pixelHeight);
	// `preserveAspectRatio="none"`: the 0–100 box stretches to the well on each axis independently,
	// exactly as the SVG beside it does.
	const sx = pixelWidth / 100;
	const sy = pixelHeight / 100;
	ctx.setTransform(sx, 0, 0, sy, 0, 0);
	// One unit of "CSS pixel" once the transform is applied — the non-scaling-stroke equivalent.
	const pixelStroke = resolution / Math.min(sx, sy);

	for (const op of ops) {
		ctx.beginPath();
		if (op.shape === 'rect') {
			ctx.rect(op.x, op.y, op.w, op.h);
		} else {
			const [first, ...rest] = op.points;
			if (!first) continue;
			ctx.moveTo(first.x, first.y);
			for (const p of rest) ctx.lineTo(p.x, p.y);
			if (op.shape === 'polygon') ctx.closePath();
		}
		if (op.fill) {
			ctx.globalAlpha = op.fill.alpha;
			ctx.fillStyle = colorOf(op.fill.token);
			ctx.fill();
		}
		if (op.stroke && op.strokeWidth > 0) {
			ctx.globalAlpha = op.stroke.alpha;
			ctx.strokeStyle = colorOf(op.stroke.token);
			ctx.lineWidth = op.scaledStroke ? op.strokeWidth : op.strokeWidth * pixelStroke;
			ctx.lineJoin = op.shape !== 'rect' && op.round ? 'round' : 'miter';
			ctx.lineCap = op.shape === 'polyline' && op.round ? 'round' : 'butt';
			ctx.stroke();
		}
	}
	ctx.globalAlpha = 1;
	return true;
}

/**
 * The baked fills, as a decorative canvas sized to the scaled map space. Mounted UNDER
 * `MapSvgLayers` so every vector layer, marker and the fog mask still cover it.
 */
export function BakeLayer({ groups, zoom = 1 }: { groups: readonly BakeGroup[]; zoom?: number }) {
	const ref = useRef<HTMLCanvasElement | null>(null);
	const ops = useMemo(() => bakeOps(groups), [groups]);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		paintBake(canvas, ops, zoom);
		// The well resizes with the layout (rail collapse, rotation, window drag) and the canvas has no
		// intrinsic layout of its own, so a repaint is owed on every size change.
		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(() => paintBake(canvas, ops, zoom));
		observer.observe(canvas);
		return () => observer.disconnect();
	}, [ops, zoom]);

	return (
		<canvas
			ref={ref}
			data-testid="map-bake-layer"
			aria-hidden="true"
			role="presentation"
			style={{
				position: 'absolute',
				inset: 0,
				width: '100%',
				height: '100%',
				pointerEvents: 'none',
			}}
		/>
	);
}
