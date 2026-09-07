import type { ToolId } from './tools';

/**
 * Android's preservation-safe map surface deliberately exposes only the tools that are dependable on
 * a touch screen. Precision geometry remains in the map model and renderer; quick mode simply never
 * offers a command that rewrites or drops it.
 */
export const QUICK_MAP_TOOL_IDS = [
	'pan',
	'select',
	'token',
	'poi',
	'fog',
	'generate',
] as const satisfies readonly ToolId[];

export type QuickMapToolId = (typeof QUICK_MAP_TOOL_IDS)[number];

const QUICK_MAP_TOOLS = new Set<ToolId>(QUICK_MAP_TOOL_IDS);

export function isQuickMapTool(tool: ToolId): tool is QuickMapToolId {
	return QUICK_MAP_TOOLS.has(tool);
}

/** Navigation is the fail-safe default whenever a desktop-only tool reaches Android. */
export function normalizeQuickMapTool(tool: ToolId): QuickMapToolId {
	return isQuickMapTool(tool) ? tool : 'pan';
}

export interface PinchViewportInput {
	startZoom: number;
	startCenter: { x: number; y: number };
	startCentroid: { x: number; y: number };
	centroid: { x: number; y: number };
	startDistance: number;
	distance: number;
	width: number;
	height: number;
}

export interface QuickMapViewport {
	zoom: number;
	center: { x: number; y: number };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Pinch around the gesture centroid, including centroid translation (two-finger pan). Keeping this
 * pure makes the touch geometry deterministic and emulator-testable.
 */
export function viewportForPinch(input: PinchViewportInput): QuickMapViewport {
	const width = Math.max(1, input.width);
	const height = Math.max(1, input.height);
	const startDistance = Math.max(1, input.startDistance);
	const zoom = clamp(input.startZoom * (Math.max(1, input.distance) / startDistance), 0.4, 6);
	const startFx = input.startCentroid.x / width;
	const startFy = input.startCentroid.y / height;
	const fx = input.centroid.x / width;
	const fy = input.centroid.y / height;
	const anchorX = (startFx - 0.5) / input.startZoom + input.startCenter.x;
	const anchorY = (startFy - 0.5) / input.startZoom + input.startCenter.y;
	return {
		zoom: +zoom.toFixed(3),
		center: {
			x: clamp(anchorX - (fx - 0.5) / zoom, 0, 1),
			y: clamp(anchorY - (fy - 0.5) / zoom, 0, 1),
		},
	};
}

// ── RC-MAP-4.3 — touch gesture model ──────────────────────────────────────────────────────────
// Pure geometry for the three touch gestures the editor owns beyond the pinch above: a double-tap
// zoom step anchored under the finger, and the momentum glide a released pan decays through. Kept
// here beside `viewportForPinch` for the same reason it is: touch maths is worth testing without a
// browser.

/** A tap counts as the second half of a double tap inside this window. */
export const DOUBLE_TAP_MS = 300;
/** …and only if the finger landed this close to the first tap, so a quick pan is never a double tap. */
export const DOUBLE_TAP_SLOP_PX = 28;
/** One double tap is one zoom step in. Past the ceiling it wraps back to the floor. */
export const DOUBLE_TAP_ZOOM_FACTOR = 2;

export interface AnchoredZoomInput {
	zoom: number;
	center: { x: number; y: number };
	factor: number;
	/** Point to hold still, in pixels within the canvas. */
	anchor: { x: number; y: number };
	width: number;
	height: number;
}

/**
 * Zoom by `factor` while the map point under `anchor` stays under `anchor` — the wheel-to-cursor
 * behaviour, reused so a double tap zooms the spot the DM tapped rather than the screen centre.
 */
export function viewportForAnchoredZoom(input: AnchoredZoomInput): QuickMapViewport {
	const width = Math.max(1, input.width);
	const height = Math.max(1, input.height);
	const zoom = clamp(+(input.zoom * input.factor).toFixed(3), 0.4, 6);
	const fx = input.anchor.x / width;
	const fy = input.anchor.y / height;
	const mapX = (fx - 0.5) / input.zoom + input.center.x;
	const mapY = (fy - 0.5) / input.zoom + input.center.y;
	return {
		zoom,
		center: {
			x: clamp(mapX - (fx - 0.5) / zoom, 0, 1),
			y: clamp(mapY - (fy - 0.5) / zoom, 0, 1),
		},
	};
}

/**
 * The next zoom a double tap should land on. Zooming in has to be reversible with the same gesture
 * on a screen with no modifier keys, so at the ceiling the step wraps back to 1× rather than
 * becoming a dead tap.
 */
export function nextDoubleTapZoom(zoom: number): number {
	const stepped = +(zoom * DOUBLE_TAP_ZOOM_FACTOR).toFixed(3);
	return stepped > 6 ? 1 : stepped;
}

export interface TouchSample {
	x: number;
	y: number;
	t: number;
}

/** Samples older than this are stale: a finger that paused before lifting must not fling. */
const VELOCITY_WINDOW_MS = 90;
/** Map units per millisecond. ~1.2 map widths per second, so a hard fling stays readable. */
const MAX_PAN_SPEED = 0.0012;
/** Below this the glide is invisible; stop rather than trickle. */
const MIN_PAN_SPEED = 0.00002;
/** Fraction of the remaining velocity kept per millisecond (≈0.92 across one 16 ms frame). */
const PAN_DECAY_PER_MS = 0.9948;

/**
 * Velocity of a released touch pan in normalized map units per millisecond, from the trailing
 * samples of the finger (or of the two-finger centroid). Pixels are divided by the zoomed canvas
 * because the same finger speed covers less map the further in you are.
 */
export function panVelocityFromSamples(
	samples: readonly TouchSample[],
	view: { zoom: number; width: number; height: number },
): { x: number; y: number } {
	if (samples.length < 2) return { x: 0, y: 0 };
	const last = samples[samples.length - 1]!;
	const first = samples.find((sample) => last.t - sample.t <= VELOCITY_WINDOW_MS) ?? samples[0]!;
	const dt = last.t - first.t;
	if (dt <= 0) return { x: 0, y: 0 };
	const zoom = Math.max(0.0001, view.zoom);
	const vx = -(last.x - first.x) / dt / (Math.max(1, view.width) * zoom);
	const vy = -(last.y - first.y) / dt / (Math.max(1, view.height) * zoom);
	const speed = Math.hypot(vx, vy);
	if (speed < MIN_PAN_SPEED) return { x: 0, y: 0 };
	if (speed > MAX_PAN_SPEED) {
		const scale = MAX_PAN_SPEED / speed;
		return { x: vx * scale, y: vy * scale };
	}
	return { x: vx, y: vy };
}

export interface InertialPanStep {
	center: { x: number; y: number };
	velocity: { x: number; y: number };
	done: boolean;
}

/**
 * One frame of the momentum glide. `done` is the caller's stop signal: the glide has slowed below
 * perception, or it has pushed the centre into the edge clamp on both axes and is going nowhere.
 */
export function inertialPanStep(input: {
	center: { x: number; y: number };
	velocity: { x: number; y: number };
	dtMs: number;
}): InertialPanStep {
	const dt = clamp(input.dtMs, 1, 64);
	const wanted = {
		x: input.center.x + input.velocity.x * dt,
		y: input.center.y + input.velocity.y * dt,
	};
	const center = { x: clamp(wanted.x, 0, 1), y: clamp(wanted.y, 0, 1) };
	const decay = PAN_DECAY_PER_MS ** dt;
	const velocity = { x: input.velocity.x * decay, y: input.velocity.y * decay };
	const stuck = center.x === input.center.x && center.y === input.center.y;
	return { center, velocity, done: stuck || Math.hypot(velocity.x, velocity.y) < MIN_PAN_SPEED };
}
