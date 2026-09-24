export type Pt = { x: number; y: number };

export const DRAWING_TOOLS = new Set([
	'brush',
	'fill',
	'erase',
	'room',
	'wall',
	'door',
	'water',
	'light',
	'stamp',
	'scatter',
	'text',
	'measure',
	'marquee',
	'generate',
	// 'route' was missing here, so the interaction overlay that owns the click-to-add-vertex
	// gesture never mounted for it: the Route tool showed its "Click to add points" hint, then
	// dropped every click through to MapCanvas (which maps route -> pan). Its whole finish path
	// (map.create-route below) already existed and was simply unreachable.
	'route',
]);

/** Tools whose gesture is a persistent click-to-add-vertex path finished with Enter/double-click. */
export const PATH_TOOLS = new Set(['wall', 'water', 'route']);

export type Gesture =
	| { kind: 'stroke'; pts: Pt[] }
	| { kind: 'rect'; start: Pt; cur: Pt; square: boolean }
	| { kind: 'measure'; start: Pt; cur: Pt }
	| { kind: 'pan'; sx: number; sy: number; c0: Pt }
	| null;
