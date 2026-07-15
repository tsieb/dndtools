/**
 * The geometry kit's shared vocabulary.
 *
 * Every generator in `src/generation/` speaks these four types and nothing else. They are deliberately
 * plain data — no classes, no methods — because a `Point` emitted by a generator is the SAME value that
 * is persisted in a `MapFeature`, replayed on another device, and hashed for the determinism contract.
 * A type with behaviour attached would not survive that round trip.
 */

export interface Point {
	x: number;
	y: number;
}

/**
 * A closed ring. The first point is NOT repeated at the end — the closing edge from the last point back
 * to the first is implicit. Every function here honours that convention; repeating the first point would
 * silently give `ringPerimeter` a zero-length edge and `simplify` a fixed point it refuses to drop.
 */
export type Ring = Point[];

export type Polyline = Point[];

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}
