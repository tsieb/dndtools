/**
 * Shared types for the reusable canvas viewport surface (UX-CANVAS-001/014/016). A `CanvasTile` is the
 * visibility-FILTERED, render-ready descriptor of one widget on the spatial canvas: the caller resolves
 * widget bindings through the Processing Core and supplies only what may be drawn for the active actor,
 * so the viewport never receives DM-only content for a player view (no-leak boundary). The tile carries
 * its world-space rect, a glanceable title/type, a non-color visibility signal, and an optional data
 * state so the viewport can render the right skeleton / placeholder (UX-CANVAS-014 perceived perf).
 */

import type { Rect } from '$lib/canvas-runtime/viewport';

/** Per-widget data resolution state the viewport renders as content / skeleton / placeholder. */
export type CanvasTileState = 'ready' | 'pending' | 'missing' | 'conflicted' | 'unbound';

/** Visibility classification used for the redundant (non-color) player-boundary badge. */
export type CanvasTileVisibility = 'dm-only' | 'shared' | 'player-visible';

export interface CanvasTile extends Rect {
	id: string;
	/** Glanceable title (already visibility-safe). */
	title: string;
	/** Widget type label / icon key. */
	type: string;
	visibility: CanvasTileVisibility;
	/** Data resolution state (drives skeleton vs. placeholder vs. content). Defaults to `ready`. */
	state?: CanvasTileState;
	/** Z-order (stacking) value; higher renders on top. Defaults to 0. */
	z?: number;
	/** Rotation in degrees (UX-CANVAS-004), applied as a CSS rotate transform. Defaults to 0. */
	rotation?: number;
}

/** Minimap presentation per platform profile (UX-CANVAS-001 §Minimap). */
export type MinimapMode = 'persistent' | 'toggle' | 'hidden';
