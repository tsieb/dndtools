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
