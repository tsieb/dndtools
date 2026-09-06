import { type MapFeature } from '@dndtools/core';
import { type NormPoint } from '../../mapGeometry';

/* The canvas's small geometry vocabulary. Extracted from MapBuilder.tsx unchanged (RC-STB-2.6);
 * `clamp01` now comes from ../mapVocab, which already carried a byte-identical copy. */

export interface Point {
	x: number;
	y: number;
}

export type DragState =
	| { kind: 'fog'; start: Point; cur: Point }
	| { kind: 'brush'; points: NormPoint[] }
	| { kind: 'pan'; px: number; py: number; c0: Point }
	| { kind: 'poi' | 'token'; id: string; pos: Point; sx: number; sy: number; moved: boolean };

/** A rect from `room`/`fill`'s two corner points, as an `x,y,w,h` tuple in the 0–100 viewBox. */
export function rectOf(feature: MapFeature): { x: number; y: number; w: number; h: number } {
	const a = feature.points[0] ?? { x: 0, y: 0 };
	const b = feature.points[1] ?? a;
	const x = Math.min(a.x, b.x) * 100;
	const y = Math.min(a.y, b.y) * 100;
	return { x, y, w: Math.abs(b.x - a.x) * 100, h: Math.abs(b.y - a.y) * 100 };
}
