/**
 * Viewport controller (UX-CANVAS-001/014/016): the reusable, reactive pan/zoom runtime that every
 * spatial surface drives — Command Center, Scenes, maps, and player views consume this one controller
 * rather than re-implementing pan/zoom per surface (the foundational-canvas mandate). It is a thin
 * reactive shell over the pure math modules (`viewport`, `virtualize`, `perf`, `gestures`): all
 * geometry and all performance decisions live in those pure, unit-tested functions, while this class
 * holds the `$state`, mirrors the perf readings, tracks the ≤100 ms acknowledgement of every hot
 * interaction, and exposes a small command API (`zoomIn`, `zoomOut`, `zoomToFit`, `zoomToSelection`,
 * `panBy`, the pinch handlers, the keyboard resolver). Honouring the renderer-abstraction boundary
 * (architecture-decisions §4), nothing here assumes a DOM/Canvas/GPU backend — it only computes a
 * transform that the surface applies however it renders.
 */

import {
	IDENTITY_VIEWPORT,
	centerOnWorld,
	clampZoom,
	fitBounds,
	nextZoomStop,
	panByScreen,
	prevZoomStop,
	resolveViewportKey,
	unionBounds,
	zoomByFactor,
	zoomPercent,
	zoomToScale,
	type Bounds,
	type Rect,
	type Size,
	type Vec2,
	type Viewport,
	type ViewportKeyAction,
} from './viewport';
import { cullToViewport, type RectItem } from './virtualize';
import {
	DEGRADE_FRAME_MS,
	FrameMonitor,
	InteractionTracker,
	widgetCountWarning,
} from './perf';
import { pinchSample, resolvePinch, type PinchSample, type TouchPointInput } from './gestures';

function nowMs(): number {
	return typeof performance !== 'undefined' && typeof performance.now === 'function'
		? performance.now()
		: Date.now();
}

export class ViewportController {
	#viewport = $state<Viewport>({ ...IDENTITY_VIEWPORT });
	#size = $state<Size>({ w: 0, h: 0 });
	#contentBounds = $state<Bounds | null>(null);
	#widgetCount = $state(0);
	#reducedMotion = $state(false);

	// --- Perf mirrors (driven by the pure FrameMonitor / InteractionTracker) -----------------------
	#fps = $state(60);
	#frameMs = $state(16.7);
	#posterFrame = $state(false);
	#lastAckMs = $state<number | null>(null);
	#ackWithinBudget = $state(true);

	readonly #frames = new FrameMonitor();
	readonly #interactions = new InteractionTracker();

	// In-flight pinch baseline (UX-CANVAS-016). Null when no two-finger gesture is active.
	#pinch: PinchSample | null = null;

	/**
	 * Optional screen-space insets reserved for floating chrome (Command Center board §3): when set,
	 * zoom-to-fit fits content into the inset-reduced area and offsets it below/inside the chrome,
	 * so the default view never hides content under the floating control groups.
	 */
	#fitInsets: { top: number; right: number; bottom: number; left: number } | null = null;

	get viewport(): Viewport {
		return this.#viewport;
	}

	get size(): Size {
		return this.#size;
	}

	get zoomPercent(): number {
		return zoomPercent(this.#viewport.scale);
	}

	get contentBounds(): Bounds | null {
		return this.#contentBounds;
	}

	get reducedMotion(): boolean {
		return this.#reducedMotion;
	}

	/** Whether a pinch gesture is currently in progress (suppresses inertia / pan handlers). */
	get pinching(): boolean {
		return this.#pinch !== null;
	}

	// --- Perf readings (read-only mirrors) ---------------------------------------------------------
	get fps(): number {
		return this.#fps;
	}
	get frameMs(): number {
		return this.#frameMs;
	}
	get posterFrame(): boolean {
		return this.#posterFrame;
	}
	get lastAckMs(): number | null {
		return this.#lastAckMs;
	}
	get ackWithinBudget(): boolean {
		return this.#ackWithinBudget;
	}

	/** Soft over-budget advisory string, or `null` (UX-CANVAS-014 §150-widget warning). */
	get widgetWarning(): string | null {
		return widgetCountWarning(this.#widgetCount);
	}

	/** The screen-centre anchor, used when no pointer/pinch anchor is supplied (Mobile zoom buttons). */
	get centerAnchor(): Vec2 {
		return { x: this.#size.w / 2, y: this.#size.h / 2 };
	}

	// --- Configuration -----------------------------------------------------------------------------
	setSize(size: Size): void {
		this.#size = { w: Math.max(0, size.w), h: Math.max(0, size.h) };
	}

	setReducedMotion(reduced: boolean): void {
		this.#reducedMotion = reduced;
	}

	/** Update the content bounding box + widget count from the current widget rects. */
	setContentRects(rects: readonly Rect[]): void {
		this.#contentBounds = unionBounds(rects);
		this.#widgetCount = rects.length;
	}

	/** Cull a set of world-positioned items to the visible viewport + one-viewport bleed margin. */
	cull<T extends RectItem>(items: readonly T[]): T[] {
		return cullToViewport(items, this.#viewport, this.#size);
	}

	// --- Hot interactions (each acknowledges within budget; ack latency is recorded) ----------------
	#apply(next: Viewport): void {
		const start = nowMs();
		this.#interactions.start(start);
		this.#viewport = { ...next, scale: clampZoom(next.scale) };
		const ms = this.#interactions.acknowledge(nowMs());
		if (ms !== null) {
			this.#lastAckMs = ms;
			this.#ackWithinBudget = this.#interactions.withinBudget;
		}
	}

	zoomInAt(anchor: Vec2 = this.centerAnchor): void {
		this.#apply(zoomToScale(this.#viewport, nextZoomStop(this.#viewport.scale), anchor));
	}

	zoomOutAt(anchor: Vec2 = this.centerAnchor): void {
		this.#apply(zoomToScale(this.#viewport, prevZoomStop(this.#viewport.scale), anchor));
	}

	/** Continuous zoom by a factor anchored at a screen point (wheel / trackpad pinch). */
	zoomByFactorAt(factor: number, anchor: Vec2): void {
		this.#apply(zoomByFactor(this.#viewport, factor, anchor));
	}

	/** Set an absolute scale anchored at a screen point (defaults to the viewport centre). */
	zoomToScaleAt(scale: number, anchor: Vec2 = this.centerAnchor): void {
		this.#apply(zoomToScale(this.#viewport, scale, anchor));
	}

	/** Set zoom from a typed/menu percentage, anchored on the viewport centre (UX-CANVAS-001 indicator). */
	setZoomPercent(percent: number): void {
		if (!Number.isFinite(percent)) return;
		this.zoomToScaleAt(percent / 100);
	}

	zoomTo100(): void {
		this.zoomToScaleAt(1);
	}

	/** Reserve screen-space chrome clearance applied by every zoom-to-fit (board hosts). */
	setFitInsets(insets: { top: number; right: number; bottom: number; left: number } | null): void {
		this.#fitInsets = insets;
	}

	/** Zoom-to-fit all content with padding (UX-CANVAS-001 §zoom-to-fit; key `0`). */
	zoomToFit(): void {
		const insets = this.#fitInsets;
		if (!insets) {
			this.#apply(fitBounds(this.#contentBounds, this.#size));
			return;
		}
		const inner = {
			w: Math.max(1, this.#size.w - insets.left - insets.right),
			h: Math.max(1, this.#size.h - insets.top - insets.bottom),
		};
		const fitted = fitBounds(this.#contentBounds, inner, 0);
		this.#apply({ ...fitted, tx: fitted.tx + insets.left, ty: fitted.ty + insets.top });
	}

	/** Zoom-to-selection: fit a selection bounding box with padding (key `Shift+0`). */
	zoomToSelection(bounds: Bounds | null): void {
		this.#apply(fitBounds(bounds ?? this.#contentBounds, this.#size));
	}

	/** Pan by a screen-space delta (arrow keys, minimap, scroll). */
	panBy(dx: number, dy: number): void {
		this.#apply(panByScreen(this.#viewport, dx, dy));
	}

	/** Centre the viewport on a world point (minimap drag — a non-gesture pointer pan alternative). */
	panToWorldPoint(point: Vec2): void {
		this.#apply(centerOnWorld(point, this.#size, this.#viewport.scale));
	}

	reset(): void {
		this.#apply({ ...IDENTITY_VIEWPORT });
	}

	// --- Keyboard ----------------------------------------------------------------------------------
	/** Resolve a key to a viewport action without applying it (pure passthrough, for testing). */
	resolveKey(key: string, shiftKey: boolean): ViewportKeyAction | null {
		return resolveViewportKey(key, shiftKey);
	}

	/**
	 * Apply a resolved viewport key action. Returns `true` when an action was handled (so the surface
	 * can `preventDefault`), `false` for an unrelated key. Zoom keys anchor on the viewport centre.
	 */
	applyKey(action: ViewportKeyAction | null, selectionBounds: Bounds | null = null): boolean {
		if (!action) return false;
		switch (action.kind) {
			case 'pan':
				this.panBy(action.dx, action.dy);
				return true;
			case 'zoom-in':
				this.zoomInAt();
				return true;
			case 'zoom-out':
				this.zoomOutAt();
				return true;
			case 'zoom-fit':
				this.zoomToFit();
				return true;
			case 'zoom-selection':
				this.zoomToSelection(selectionBounds);
				return true;
			case 'zoom-to':
				this.zoomToScaleAt(action.scale);
				return true;
		}
	}

	/** Resolve + apply a keyboard event in one call (returns whether it was handled). */
	handleKey(key: string, shiftKey: boolean, selectionBounds: Bounds | null = null): boolean {
		return this.applyKey(this.resolveKey(key, shiftKey), selectionBounds);
	}

	// --- Multi-touch pinch (UX-CANVAS-016) ---------------------------------------------------------
	beginPinch(a: TouchPointInput, b: TouchPointInput): void {
		this.#pinch = pinchSample(a, b);
		this.#frames.reset();
	}

	updatePinch(a: TouchPointInput, b: TouchPointInput): void {
		if (!this.#pinch) {
			this.beginPinch(a, b);
			return;
		}
		const next = pinchSample(a, b);
		this.#apply(resolvePinch(this.#viewport, this.#pinch, next));
		this.#pinch = next;
		// A pinch is an active gesture: monitor its frame budget for poster-frame degradation.
		this.recordFrame();
	}

	endPinch(): void {
		this.#pinch = null;
		this.posterFrameRecover();
	}

	// --- Performance instrumentation ---------------------------------------------------------------
	/** Record a frame during an active gesture; mirrors fps / frameMs / poster-frame into `$state`. */
	recordFrame(now: number = nowMs()): void {
		this.#frames.frame(now);
		const reading = this.#frames.reading;
		this.#fps = reading.fps;
		this.#frameMs = reading.frameMs;
		this.#posterFrame = reading.degraded;
	}

	/** Leave poster-frame mode (gesture ended / budget recovered). */
	posterFrameRecover(): void {
		this.#frames.recover();
		this.#posterFrame = false;
	}

	/**
	 * Diagnostics hook (UX-CANVAS-014): feed the FrameMonitor a run of synthetic slow frames so the
	 * poster-frame affordance can be exercised deterministically without real jank. Returns the
	 * resulting poster-frame state.
	 */
	simulateJank(): boolean {
		this.#frames.reset();
		let t = nowMs();
		for (let i = 0; i < 6; i += 1) {
			t += DEGRADE_FRAME_MS + 12; // each synthetic frame exceeds the slow-frame threshold
			this.recordFrame(t);
		}
		return this.#posterFrame;
	}
}
