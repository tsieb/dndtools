/**
 * PERF-002 / PERF-003 — SCENE + MAP RENDER COST MODEL + MEASUREMENT (Architecture Contract 1
 * Processing/Display decoupling; Contract 4 Scene and Widget contract; Vision Performance; Feature
 * Inventory I9 map risks / I20 virtualization). This is the SCENE AND MAP RENDERING half of the PERF
 * capability branch. It COMPOSES the PERF-001 budget registry + PERF-007 measurement
 * ({@link ./budget-registry}, {@link ./measurement}) rather than inventing a parallel grader: a Scene
 * first-render estimate, a widget-update latency, and a map pan/zoom frame rate are graded by the SAME
 * deterministic {@link measureBudget} against the budgets the registry ALREADY owns
 * (`scene-first-render`, `widget-update`, `map-pan-zoom-desktop`, `map-pan-zoom-slim`). There is
 * exactly one measurement API in the codebase, and exactly one set of declared budgets.
 *
 * It adds the things PERF-002/003 need ON TOP of generic measurement:
 *
 *   PERF-002 — SCENE RENDERING (virtualization + bounded subscriptions + backpressure):
 *     1. A pure RENDER-COST MODEL ({@link estimateSceneRenderCost}) that turns a Scene's widget
 *        complexity into a deterministic estimated first-render duration. The model is the executable
 *        form of VIRTUALIZATION: an OFFSCREEN or COLLAPSED widget contributes only a tiny bookkeeping
 *        cost, NOT its full render cost, so a Scene with many widgets where most are offscreen/collapsed
 *        does not pay full rendering work (PERF-002 AC1). {@link measureSceneFirstRender} grades that
 *        estimate against `scene-first-render`.
 *     2. A BACKPRESSURE / DEBOUNCE policy evaluator ({@link evaluateSubscriptionBackpressure}) for a
 *        high-frequency event subscription: a subscription that declares a debounce/throttle/sample
 *        policy is bounded (its effective render rate is capped); one that declares `none` against a
 *        high-frequency source is UNBOUNDED and would starve rendering (PERF-002 AC2 — fail closed).
 *     3. {@link measureWidgetUpdate} grades an observed widget-update latency against `widget-update`.
 *
 *   PERF-003 — MAP RENDERING (explicit frame budgets + incremental fog):
 *     1. A pure MAP RENDER-COST MODEL ({@link estimateMapFrameRate}) that turns a map's visible
 *        complexity (layers, POIs, fog ops, routes, tokens) into a deterministic estimated frame rate
 *        for a device class. {@link measureMapPanZoom} grades it against the desktop OR slim budget,
 *        chosen by device class, so the SLIM frame floor is enforced DISTINCTLY from desktop (PERF-003
 *        AC1, both profiles).
 *     2. An INCREMENTAL FOG analysis ({@link analyzeFogRegionUpdate}): a committed fog op updates ONLY
 *        the affected render regions (the layers whose content overlaps the op's region) where the
 *        renderer supports region invalidation; a renderer that cannot invalidate by region falls back
 *        to a full repaint (PERF-003 AC2 — fail closed to a full repaint, never a silent stale frame).
 *
 * FAIL CLOSED, EVERYWHERE. An unmeasured Scene/map render budget is `unknown` (un-proven), never a
 * confident pass — inherited directly from {@link measureBudget}. A heavy Scene over its budget is a
 * breach; a heavy map under its frame floor is a breach. An unbounded high-frequency subscription is a
 * backpressure breach. A renderer that cannot invalidate by region falls back to a full repaint rather
 * than skipping the update. Exactly-at-threshold passes (the registry budgets are inclusive).
 *
 * Pure + deterministic: every complexity input and every sample is an EXPLICIT input. No DOM, no
 * Canvas/WebGL, no `requestAnimationFrame`, no clock, no entropy. Per ADR-014 the live raf/GPU TIMING
 * CAPTURE is deferred (the canvas runtime feeds real frame timings in later); this owns the declared
 * budgets, the deterministic render-cost MODEL that estimates render work from complexity, and the
 * measurement that grades both estimates and captured samples — exactly as {@link measureBudget} takes
 * sample timings as explicit inputs.
 */

import type { PerformanceBudget } from './budget-registry';
import {
	measureBudget,
	type BudgetMeasurement,
} from './measurement';

// ---------------------------------------------------------------------------------------------------
// The registry ids this module grades against. Kept as consts so the model, the measurement, and the
// tests share ONE source of truth and never drift from the budget-registry's declared ids.
// ---------------------------------------------------------------------------------------------------

/** The registry id of the Scene first-render budget (`< 1.5s to interactive`, PERF-002/PERF-007). */
export const SCENE_FIRST_RENDER_BUDGET_ID = 'scene-first-render' as const;
/** The registry id of the widget-update latency budget (`< 100ms p95`, PERF-002/PERF-007). */
export const WIDGET_UPDATE_BUDGET_ID = 'widget-update' as const;
/** The registry id of the DESKTOP map pan/zoom frame budget (`>= 50fps p95`, PERF-003/PERF-007). */
export const MAP_PAN_ZOOM_DESKTOP_BUDGET_ID = 'map-pan-zoom-desktop' as const;
/** The registry id of the SLIM map pan/zoom frame budget (`>= 30fps p95`, PERF-003/PERF-007). */
export const MAP_PAN_ZOOM_SLIM_BUDGET_ID = 'map-pan-zoom-slim' as const;

/**
 * The render device class a measurement is taken on. The map frame budget is enforced DISTINCTLY per
 * class: `desktop` grades against the 50fps floor, `slim` (the mobile/tablet slim profile) against the
 * 30fps floor. This is the model's notion of device class, mapped to the registry budget id by
 * {@link mapPanZoomBudgetIdForDeviceClass}.
 */
export type RenderDeviceClass = 'desktop' | 'slim';

/** Resolve the map pan/zoom budget id for a device class so the SLIM floor is enforced separately. */
export function mapPanZoomBudgetIdForDeviceClass(deviceClass: RenderDeviceClass): string {
	return deviceClass === 'slim' ? MAP_PAN_ZOOM_SLIM_BUDGET_ID : MAP_PAN_ZOOM_DESKTOP_BUDGET_ID;
}

// ===================================================================================================
// PERF-002 — SCENE RENDER COST MODEL (virtualization) + WIDGET UPDATE MEASUREMENT.
// ===================================================================================================

/**
 * The render complexity of ONE widget on a Scene, as the cost model sees it. This is the minimal,
 * presentation-agnostic shape the Processing Core can derive from a {@link WidgetInstance} +
 * its actor-resolved bindings WITHOUT touching the DOM — `offscreen`/`collapsed` come from the layout
 * + viewport, `activeBindings` from the widget's resolved bindings, `weight` from the widget type's
 * declared render weight. The model never reads a real widget; the caller maps the Scene to this.
 */
export interface SceneWidgetComplexity {
	/** Whether the widget is outside the current viewport (virtualized — not rendered yet). */
	readonly offscreen: boolean;
	/** Whether the widget is collapsed to a header/placeholder (its body is not rendered). */
	readonly collapsed: boolean;
	/** How many ACTIVE data bindings the widget resolves on first render (each costs work). Non-negative. */
	readonly activeBindings: number;
	/**
	 * A coarse per-widget render weight (>= 1), e.g. a simple text card is `1`, a character sheet `3`,
	 * a map widget `5`. Lets a heavy widget cost more than a light one without the model knowing widget
	 * internals. Defaults to 1 when omitted.
	 */
	readonly weight?: number;
}

/** Tunable per-unit costs for the Scene render model. Explicit so a test can pin them; defaults below. */
export interface SceneRenderCostModel {
	/** Fixed Scene shell/layout cost in ms, paid once regardless of widget count. */
	readonly baseMs: number;
	/** Cost in ms to mount ONE visible widget of weight 1 with no bindings. */
	readonly perVisibleWidgetMs: number;
	/** Cost in ms per ACTIVE binding resolved on a visible widget. */
	readonly perActiveBindingMs: number;
	/**
	 * Tiny bookkeeping cost in ms for a widget that is NOT rendered (offscreen or collapsed). This is
	 * the virtualization dividend: an unrendered widget costs this instead of its full mount cost, so a
	 * Scene with many offscreen/collapsed widgets does not pay full rendering work (PERF-002 AC1).
	 */
	readonly perVirtualizedWidgetMs: number;
}

/** The default Scene render cost model. Provisional per ADR-014 — real timings replace these later. */
export const DEFAULT_SCENE_RENDER_COST_MODEL: SceneRenderCostModel = Object.freeze({
	baseMs: 50,
	perVisibleWidgetMs: 12,
	perActiveBindingMs: 8,
	perVirtualizedWidgetMs: 0.25,
});

/** Whether a widget is actually rendered (it pays full cost) or virtualized (it pays only bookkeeping). */
function isVirtualized(widget: SceneWidgetComplexity): boolean {
	return widget.offscreen || widget.collapsed;
}

/** A breakdown of the estimated Scene first-render cost so a diagnostic shows WHERE the time goes. */
export interface SceneRenderEstimate {
	/** The estimated first-render duration in ms (the value graded against `scene-first-render`). */
	readonly estimatedMs: number;
	/** How many widgets were actually rendered (paid full cost). */
	readonly renderedWidgetCount: number;
	/** How many widgets were virtualized (offscreen/collapsed — paid only bookkeeping). */
	readonly virtualizedWidgetCount: number;
	/** Total active bindings resolved across the RENDERED widgets. */
	readonly resolvedBindingCount: number;
}

/**
 * PERF-002 AC1 — estimate a Scene's FIRST-RENDER cost from its widget complexity, deterministically.
 * VIRTUALIZATION is the core rule: an offscreen or collapsed widget contributes only
 * `perVirtualizedWidgetMs` (a tiny bookkeeping cost), NOT its full mount + binding cost. So a Scene
 * with many widgets where most are offscreen/collapsed renders far cheaper than the same Scene with
 * all widgets visible — "offscreen or collapsed widgets do not force full rendering work".
 *
 * Pure + deterministic: identical widget complexity + model ⇒ identical estimate. The estimate is the
 * input {@link measureSceneFirstRender} grades against the `scene-first-render` budget.
 */
export function estimateSceneRenderCost(
	widgets: readonly SceneWidgetComplexity[],
	model: SceneRenderCostModel = DEFAULT_SCENE_RENDER_COST_MODEL,
): SceneRenderEstimate {
	let estimatedMs = model.baseMs;
	let renderedWidgetCount = 0;
	let virtualizedWidgetCount = 0;
	let resolvedBindingCount = 0;

	for (const widget of widgets) {
		if (isVirtualized(widget)) {
			// The virtualization dividend: pay only bookkeeping, never the full mount/binding cost.
			estimatedMs += model.perVirtualizedWidgetMs;
			virtualizedWidgetCount += 1;
			continue;
		}
		const weight = Number.isFinite(widget.weight) && (widget.weight ?? 0) >= 1 ? widget.weight! : 1;
		const bindings = Number.isFinite(widget.activeBindings) && widget.activeBindings > 0
			? widget.activeBindings
			: 0;
		estimatedMs += model.perVisibleWidgetMs * weight + model.perActiveBindingMs * bindings;
		renderedWidgetCount += 1;
		resolvedBindingCount += bindings;
	}

	return { estimatedMs, renderedWidgetCount, virtualizedWidgetCount, resolvedBindingCount };
}

/**
 * PERF-002 AC1 — measure a Scene's estimated first-render cost against the `scene-first-render` budget,
 * fail closed. Builds the estimate with {@link estimateSceneRenderCost}, then grades the estimated ms
 * through the SAME {@link measureBudget} as every other PERF measurement (a `duration-ms` ceiling — a
 * single slow render breaches; exactly at 1.5s passes). An empty Scene (no widgets) still pays the base
 * shell cost, so it is graded normally rather than reported `unknown`.
 *
 * `budgets` defaults to the canonical registry; pass a custom set to grade against a test budget.
 */
export function measureSceneFirstRender(
	widgets: readonly SceneWidgetComplexity[],
	options?: { model?: SceneRenderCostModel; budgets?: readonly PerformanceBudget[] },
): { readonly measurement: BudgetMeasurement; readonly estimate: SceneRenderEstimate } {
	const estimate = estimateSceneRenderCost(widgets, options?.model);
	const measurement = measureBudget(
		SCENE_FIRST_RENDER_BUDGET_ID,
		[estimate.estimatedMs],
		options?.budgets,
	);
	return { measurement, estimate };
}

/**
 * PERF-002 AC1 / Contract 4 — measure an OBSERVED widget-update latency against the `widget-update`
 * budget (`< 100ms p95`), fail closed. This grades REAL captured samples (the latency from an accepted
 * command to a visible widget update); an empty sample set is `unknown` (un-proven), never a confident
 * pass — inherited from {@link measureBudget}. Kept here, beside the Scene render model, so all Scene
 * rendering measurements compose the one registry/grader.
 */
export function measureWidgetUpdate(
	latencyMsSamples: readonly number[],
	budgets?: readonly PerformanceBudget[],
): BudgetMeasurement {
	return measureBudget(WIDGET_UPDATE_BUDGET_ID, latencyMsSamples, budgets);
}

// ---------------------------------------------------------------------------------------------------
// PERF-002 AC2 — BOUNDED SUBSCRIPTIONS + BACKPRESSURE for high-frequency events.
// ---------------------------------------------------------------------------------------------------

/**
 * The declared debounce/backpressure policy of a widget event subscription (Contract 4: "event
 * subscriptions must declare debounce/backpressure policy where high-frequency events are possible").
 *
 *   - `none`     — no policy; every event drives a render. UNBOUNDED against a high-frequency source.
 *   - `debounce` — collapse a burst, render once after `windowMs` of quiet. Bounded.
 *   - `throttle` — render at most once per `windowMs`. Bounded (the effective render rate is capped).
 *   - `sample`   — render the latest value once per `windowMs`. Bounded.
 */
export type BackpressurePolicyKind = 'none' | 'debounce' | 'throttle' | 'sample';

/** A widget event subscription's declared policy against a source's expected event rate. */
export interface SubscriptionBackpressure {
	/** The expected SOURCE event rate in events/second (e.g. a cursor stream at 120/s). Non-negative. */
	readonly sourceEventsPerSecond: number;
	/** The declared backpressure policy. */
	readonly policy: BackpressurePolicyKind;
	/** The debounce/throttle/sample window in ms (ignored for `none`). Must be > 0 for a bounded policy. */
	readonly windowMs?: number;
	/**
	 * The render rate (renders/second) above which this subscription is considered to STARVE rendering
	 * — the bound the effective render rate must stay at or under. Defaults to {@link DEFAULT_RENDER_STARVATION_RATE}.
	 */
	readonly starvationRenderRate?: number;
}

/**
 * The default render rate (renders/second) above which an unthrottled subscription is treated as
 * render-starving. ~60/s is one render per frame at 60fps; sustaining MORE than that from a single
 * high-frequency source leaves no frame budget for anything else.
 */
export const DEFAULT_RENDER_STARVATION_RATE = 60 as const;

/** Why a subscription's backpressure policy is a breach (fail closed). */
export type BackpressureProblemKind =
	/** A high-frequency source with NO policy — every event renders, unbounded (render starvation). */
	| 'unbounded-no-policy'
	/** A bounded policy declared WITHOUT a positive window — the window is required to bound the rate. */
	| 'missing-window'
	/** Even WITH the policy the effective render rate exceeds the starvation bound. */
	| 'effective-rate-too-high';

export interface BackpressureResult {
	/** Whether the subscription is bounded (its effective render rate stays within the starvation bound). */
	readonly bounded: boolean;
	/** The effective render rate (renders/second) after the policy is applied. */
	readonly effectiveRenderRate: number;
	/** The starvation bound the effective rate was checked against. */
	readonly starvationRenderRate: number;
	/** The breach kind when not bounded; `null` when bounded. */
	readonly problem: BackpressureProblemKind | null;
	/** A non-leaking diagnostic naming the source rate, policy, and effective rate. */
	readonly message: string;
}

/** The effective render rate (renders/sec) a bounded policy yields for a window, capped by the source rate. */
function effectiveRenderRateFor(
	policy: BackpressurePolicyKind,
	sourceEventsPerSecond: number,
	windowMs: number,
): number {
	if (policy === 'none') return sourceEventsPerSecond;
	// debounce/throttle/sample all cap the render rate at one render per window, but never above the
	// source rate (a slow source renders at its own rate, not the window cap).
	const windowRate = 1000 / windowMs;
	return Math.min(sourceEventsPerSecond, windowRate);
}

/**
 * PERF-002 AC2 — evaluate whether a high-frequency event subscription's DECLARED backpressure policy
 * prevents render starvation, FAILING CLOSED. The rules:
 *
 *   - A source at or above the starvation rate with policy `none` is UNBOUNDED — every event renders, so
 *     it would starve rendering (`unbounded-no-policy`). (A LOW-frequency source with `none` is fine: it
 *     cannot starve rendering because its own rate is already under the bound.)
 *   - A bounded policy (`debounce`/`throttle`/`sample`) MUST declare a positive `windowMs`; without one
 *     the rate is not actually bounded (`missing-window`).
 *   - Even with a bounded policy, if the effective render rate still EXCEEDS the starvation bound (an
 *     absurdly small window), it is a breach (`effective-rate-too-high`).
 *
 * Deterministic — the source rate, policy, and window are explicit inputs. Returns a single result;
 * `bounded: true` only when the declared policy provably keeps the effective render rate within bound.
 */
export function evaluateSubscriptionBackpressure(
	subscription: SubscriptionBackpressure,
): BackpressureResult {
	const starvationRenderRate = subscription.starvationRenderRate ?? DEFAULT_RENDER_STARVATION_RATE;
	const sourceRate = Math.max(0, subscription.sourceEventsPerSecond);

	if (subscription.policy === 'none') {
		// With no policy the render rate IS the source rate. Only a high-frequency source starves.
		const bounded = sourceRate <= starvationRenderRate;
		return {
			bounded,
			effectiveRenderRate: sourceRate,
			starvationRenderRate,
			problem: bounded ? null : 'unbounded-no-policy',
			message: bounded
				? `Subscription at ${sourceRate}/s has no policy but stays within the ${starvationRenderRate}/s render bound.`
				: `Subscription at ${sourceRate}/s declares NO backpressure policy; every event renders, starving the ${starvationRenderRate}/s render bound (PERF-002 AC2).`,
		};
	}

	const windowMs = subscription.windowMs;
	if (windowMs === undefined || !Number.isFinite(windowMs) || windowMs <= 0) {
		return {
			bounded: false,
			effectiveRenderRate: sourceRate,
			starvationRenderRate,
			problem: 'missing-window',
			message: `Subscription declares a "${subscription.policy}" policy without a positive window; the render rate is not bounded (PERF-002 AC2).`,
		};
	}

	const effectiveRenderRate = effectiveRenderRateFor(subscription.policy, sourceRate, windowMs);
	const bounded = effectiveRenderRate <= starvationRenderRate;
	return {
		bounded,
		effectiveRenderRate,
		starvationRenderRate,
		problem: bounded ? null : 'effective-rate-too-high',
		message: bounded
			? `Subscription at ${sourceRate}/s with a ${windowMs}ms "${subscription.policy}" window renders at ${effectiveRenderRate}/s, within the ${starvationRenderRate}/s bound.`
			: `Subscription's ${windowMs}ms "${subscription.policy}" window still renders at ${effectiveRenderRate}/s, over the ${starvationRenderRate}/s render bound (PERF-002 AC2).`,
	};
}

// ===================================================================================================
// PERF-003 — MAP RENDER COST MODEL (frame budgets) + INCREMENTAL FOG ANALYSIS.
// ===================================================================================================

/**
 * The visible render complexity of a map AS PROJECTED TO AN ACTOR. This mirrors the actor-filtered
 * {@link MapView} the renderer already consumes (`queries/map-query.ts`): only VISIBLE layers / POIs /
 * fog / routes / tokens count, so a `dm-only` layer a player can't see also costs a player nothing to
 * render (the same non-leak the query enforces also bounds the player's render cost). The caller maps
 * a `MapView` to this shape; the model never reads raw `MapState`.
 */
export interface MapRenderComplexity {
	/** Number of VISIBLE layers composited this frame. Non-negative. */
	readonly visibleLayers: number;
	/** Number of VISIBLE POIs drawn this frame. Non-negative. */
	readonly visiblePois: number;
	/** Number of VISIBLE fog regions composited this frame. Non-negative. */
	readonly visibleFogRegions: number;
	/** Number of VISIBLE routes drawn this frame. Non-negative. */
	readonly visibleRoutes: number;
	/** Number of VISIBLE tokens drawn this frame. Non-negative. */
	readonly visibleTokens: number;
	/**
	 * Whether a nested-map transition (zoom into / out of an embedded child map) is in progress this
	 * frame. A transition composites BOTH the parent and the child for a few frames, so it costs extra.
	 */
	readonly nestedTransitionActive?: boolean;
}

/** Tunable per-element frame costs for the map render model. Explicit so a test can pin them. */
export interface MapRenderCostModel {
	/** Fixed compositor cost in ms per frame, paid once regardless of element count. */
	readonly baseFrameMs: number;
	/** Added ms per visible layer composited. */
	readonly perLayerMs: number;
	/** Added ms per visible POI drawn. */
	readonly perPoiMs: number;
	/** Added ms per visible fog region composited. */
	readonly perFogRegionMs: number;
	/** Added ms per visible route drawn. */
	readonly perRouteMs: number;
	/** Added ms per visible token drawn. */
	readonly perTokenMs: number;
	/** Extra ms while a nested-map transition composites parent + child. */
	readonly nestedTransitionMs: number;
	/**
	 * A device-class throughput multiplier on the per-element costs (a slim device's GPU is slower, so
	 * the SAME map costs MORE ms/frame there). `desktop` is the 1.0 baseline; `slim` > 1 makes the model
	 * yield a lower frame rate on slim for the same map, so the slim 30fps floor is meaningfully distinct
	 * from the desktop 50fps floor.
	 */
	readonly deviceClassMultiplier: Readonly<Record<RenderDeviceClass, number>>;
}

/** The default map render cost model. Provisional per ADR-014 — real frame timings replace these later. */
export const DEFAULT_MAP_RENDER_COST_MODEL: MapRenderCostModel = Object.freeze({
	baseFrameMs: 2,
	perLayerMs: 0.6,
	perPoiMs: 0.03,
	perFogRegionMs: 0.4,
	perRouteMs: 0.15,
	perTokenMs: 0.05,
	nestedTransitionMs: 4,
	deviceClassMultiplier: Object.freeze({ desktop: 1, slim: 2.2 }),
});

/** A frame-cost estimate: the per-frame ms and the frame rate it implies for the device class. */
export interface MapFrameEstimate {
	/** The estimated cost of one frame in ms for the device class. */
	readonly frameMs: number;
	/** The estimated frame rate (fps) — `1000 / frameMs` — the value graded against the pan/zoom budget. */
	readonly estimatedFps: number;
	/** The device class the estimate was computed for. */
	readonly deviceClass: RenderDeviceClass;
}

/** Coerce a complexity count to a non-negative finite number (a NaN/negative count contributes 0). */
function nonNegativeCount(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * PERF-003 AC1 — estimate a map's per-frame cost and frame rate from its VISIBLE complexity for a
 * DEVICE CLASS, deterministically. The per-element costs are scaled by the device-class multiplier, so
 * the SAME map yields a LOWER frame rate on a slim device than on desktop — which is why the slim 30fps
 * floor is enforced distinctly from the desktop 50fps floor. A nested-map transition adds its extra
 * compositing cost while active.
 *
 * Pure + deterministic: identical complexity + device class + model ⇒ identical frame rate. The
 * estimated fps is the input {@link measureMapPanZoom} grades against the device-class pan/zoom budget.
 */
export function estimateMapFrameRate(
	complexity: MapRenderComplexity,
	deviceClass: RenderDeviceClass,
	model: MapRenderCostModel = DEFAULT_MAP_RENDER_COST_MODEL,
): MapFrameEstimate {
	const multiplier = model.deviceClassMultiplier[deviceClass];
	const elementMs =
		model.perLayerMs * nonNegativeCount(complexity.visibleLayers) +
		model.perPoiMs * nonNegativeCount(complexity.visiblePois) +
		model.perFogRegionMs * nonNegativeCount(complexity.visibleFogRegions) +
		model.perRouteMs * nonNegativeCount(complexity.visibleRoutes) +
		model.perTokenMs * nonNegativeCount(complexity.visibleTokens) +
		(complexity.nestedTransitionActive ? model.nestedTransitionMs : 0);
	const frameMs = model.baseFrameMs + elementMs * multiplier;
	// frameMs is always >= baseFrameMs > 0, so the frame rate is always finite and positive.
	const estimatedFps = 1000 / frameMs;
	return { frameMs, estimatedFps, deviceClass };
}

/**
 * PERF-003 AC1 — measure a map's estimated pan/zoom frame rate against the device-class budget, fail
 * closed. Builds the frame estimate with {@link estimateMapFrameRate}, then grades the estimated fps
 * through {@link measureBudget} against the budget chosen by device class
 * ({@link mapPanZoomBudgetIdForDeviceClass}) — the `map-pan-zoom-desktop` 50fps floor for desktop, the
 * `map-pan-zoom-slim` 30fps floor for slim. A frame rate AT the floor passes (the floor is inclusive);
 * below it breaches. The SLIM floor is enforced DISTINCTLY from desktop because a different budget id
 * with a different target grades it.
 *
 * `budgets` defaults to the canonical registry; pass a custom set to grade against a test budget.
 */
export function measureMapPanZoom(
	complexity: MapRenderComplexity,
	deviceClass: RenderDeviceClass,
	options?: { model?: MapRenderCostModel; budgets?: readonly PerformanceBudget[] },
): { readonly measurement: BudgetMeasurement; readonly estimate: MapFrameEstimate } {
	const estimate = estimateMapFrameRate(complexity, deviceClass, options?.model);
	const measurement = measureBudget(
		mapPanZoomBudgetIdForDeviceClass(deviceClass),
		[estimate.estimatedFps],
		options?.budgets,
	);
	return { measurement, estimate };
}

// ---------------------------------------------------------------------------------------------------
// PERF-003 AC2 — INCREMENTAL FOG: only affected render regions update where supported.
// ---------------------------------------------------------------------------------------------------

/** A rectangular region in normalized (0..1) map space — the shape a fog op and a layer bound share. */
export interface RenderRegion {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** A render layer the compositor draws, with the bounding region of its painted content. */
export interface RenderLayerRegion {
	/** The layer id (matches the map's layer id). */
	readonly layerId: string;
	/** The bounding region of the layer's painted content in normalized space. */
	readonly bounds: RenderRegion;
}

/** Whether two normalized regions overlap (touching edges count as overlap — a shared edge repaints). */
function regionsOverlap(a: RenderRegion, b: RenderRegion): boolean {
	return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/** The result of analyzing how a committed fog op invalidates render regions. */
export interface FogRegionUpdateAnalysis {
	/**
	 * Whether the renderer can update INCREMENTALLY (only the affected layers repaint). `false` means it
	 * must fall back to a FULL repaint — fail closed, never a silent stale frame (PERF-003 AC2).
	 */
	readonly incremental: boolean;
	/** The layer ids whose content overlaps the fog op's region (the ones that must repaint). In input order. */
	readonly affectedLayerIds: readonly string[];
	/** A non-leaking diagnostic describing the invalidation. */
	readonly message: string;
}

/**
 * PERF-003 AC2 — analyze how a committed fog op invalidates render regions, FAILING CLOSED to a full
 * repaint. When the renderer SUPPORTS region invalidation (`supportsRegionInvalidation: true`), only
 * the layers whose painted content OVERLAPS the fog op's region need to repaint — "only affected render
 * regions update where the renderer supports it". When the renderer does NOT support it, the result is
 * a FULL repaint (every layer affected) — the requirement's "where the renderer supports it" clause is
 * honored by falling back, never by skipping the update and showing a stale frame.
 *
 * An INVALID fog region (non-finite / negative size) also forces a full repaint: the model cannot
 * prove which regions are affected, so it conservatively repaints everything rather than risk a stale
 * frame. Deterministic — the fog region, layers, and the support flag are explicit inputs.
 */
export function analyzeFogRegionUpdate(
	fogRegion: RenderRegion,
	layers: readonly RenderLayerRegion[],
	options: { supportsRegionInvalidation: boolean },
): FogRegionUpdateAnalysis {
	const allLayerIds = layers.map((layer) => layer.layerId);

	if (!options.supportsRegionInvalidation) {
		return {
			incremental: false,
			affectedLayerIds: allLayerIds,
			message: `Renderer does not support region invalidation; falling back to a FULL repaint of ${allLayerIds.length} layer(s) (PERF-003 AC2 fail-closed).`,
		};
	}

	if (!isFiniteRegion(fogRegion)) {
		return {
			incremental: false,
			affectedLayerIds: allLayerIds,
			message: `Fog region is not a valid normalized rectangle; conservatively repainting all ${allLayerIds.length} layer(s) rather than risk a stale frame (PERF-003 AC2 fail-closed).`,
		};
	}

	const affectedLayerIds = layers
		.filter((layer) => regionsOverlap(fogRegion, layer.bounds))
		.map((layer) => layer.layerId);
	return {
		incremental: true,
		affectedLayerIds,
		message: `Fog op invalidates ${affectedLayerIds.length} of ${allLayerIds.length} layer region(s); only affected regions repaint (PERF-003 AC2).`,
	};
}

/** Whether a region is a valid normalized rectangle (finite, non-negative size). */
function isFiniteRegion(region: RenderRegion): boolean {
	return (
		Number.isFinite(region.x) &&
		Number.isFinite(region.y) &&
		Number.isFinite(region.w) &&
		Number.isFinite(region.h) &&
		region.w >= 0 &&
		region.h >= 0
	);
}
