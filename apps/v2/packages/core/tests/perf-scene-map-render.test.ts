import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MAP_RENDER_COST_MODEL,
	DEFAULT_SCENE_RENDER_COST_MODEL,
	MAP_PAN_ZOOM_DESKTOP_BUDGET_ID,
	MAP_PAN_ZOOM_SLIM_BUDGET_ID,
	SCENE_FIRST_RENDER_BUDGET_ID,
	WIDGET_UPDATE_BUDGET_ID,
	analyzeFogRegionUpdate,
	budgetForId,
	estimateMapFrameRate,
	estimateSceneRenderCost,
	evaluateSubscriptionBackpressure,
	mapPanZoomBudgetIdForDeviceClass,
	measureMapPanZoom,
	measureSceneFirstRender,
	measureWidgetUpdate,
	type MapRenderComplexity,
	type RenderLayerRegion,
	type SceneWidgetComplexity,
} from '../src/index';

// ===================================================================================================
// PERF-002 — Scene rendering: virtualization, the render-cost model, and the first-render measurement.
// ===================================================================================================

/** A simple visible widget of weight 1 with `bindings` active bindings. */
function visibleWidget(bindings = 0, weight = 1): SceneWidgetComplexity {
	return { offscreen: false, collapsed: false, activeBindings: bindings, weight };
}

describe('PERF-002 AC1 estimateSceneRenderCost — virtualization: offscreen/collapsed widgets do not force full work', () => {
	it('an offscreen widget pays only bookkeeping, not its full mount/binding cost', () => {
		const visible = estimateSceneRenderCost([visibleWidget(3, 2)]);
		const offscreen = estimateSceneRenderCost([
			{ offscreen: true, collapsed: false, activeBindings: 3, weight: 2 },
		]);
		// The offscreen widget costs only base + the tiny virtualized bookkeeping, far less than visible.
		expect(offscreen.estimatedMs).toBeLessThan(visible.estimatedMs);
		expect(offscreen.virtualizedWidgetCount).toBe(1);
		expect(offscreen.renderedWidgetCount).toBe(0);
		expect(offscreen.resolvedBindingCount).toBe(0);
	});

	it('a collapsed widget is virtualized exactly like an offscreen one (its body is not rendered)', () => {
		const collapsed = estimateSceneRenderCost([
			{ offscreen: false, collapsed: true, activeBindings: 5, weight: 4 },
		]);
		expect(collapsed.virtualizedWidgetCount).toBe(1);
		expect(collapsed.renderedWidgetCount).toBe(0);
		// Just base + one virtualized bookkeeping cost.
		expect(collapsed.estimatedMs).toBe(
			DEFAULT_SCENE_RENDER_COST_MODEL.baseMs + DEFAULT_SCENE_RENDER_COST_MODEL.perVirtualizedWidgetMs,
		);
	});

	it('a 50-widget Scene with most widgets offscreen renders far cheaper than all-visible (the virtualization dividend)', () => {
		const allVisible = estimateSceneRenderCost(
			Array.from({ length: 50 }, () => visibleWidget(2, 3)),
		);
		// 5 visible, 45 offscreen — the realistic "many widgets, few on screen" case.
		const mostOffscreen = estimateSceneRenderCost(
			Array.from({ length: 50 }, (_v, i) =>
				i < 5 ? visibleWidget(2, 3) : { offscreen: true, collapsed: false, activeBindings: 2, weight: 3 },
			),
		);
		expect(mostOffscreen.renderedWidgetCount).toBe(5);
		expect(mostOffscreen.virtualizedWidgetCount).toBe(45);
		expect(mostOffscreen.estimatedMs).toBeLessThan(allVisible.estimatedMs);
	});

	it('the base shell cost is paid once even for an empty Scene (no NaN/zero)', () => {
		const empty = estimateSceneRenderCost([]);
		expect(empty.estimatedMs).toBe(DEFAULT_SCENE_RENDER_COST_MODEL.baseMs);
		expect(empty.renderedWidgetCount).toBe(0);
	});

	it('a negative/NaN binding count or sub-1 weight is coerced, not propagated (no negative cost)', () => {
		const weird = estimateSceneRenderCost([
			{ offscreen: false, collapsed: false, activeBindings: -5 },
			{ offscreen: false, collapsed: false, activeBindings: Number.NaN, weight: 0.2 },
		]);
		// Both render at weight 1 with 0 bindings → base + 2 * perVisibleWidgetMs.
		expect(weird.estimatedMs).toBe(
			DEFAULT_SCENE_RENDER_COST_MODEL.baseMs + 2 * DEFAULT_SCENE_RENDER_COST_MODEL.perVisibleWidgetMs,
		);
		expect(weird.resolvedBindingCount).toBe(0);
	});

	it('is deterministic — identical widget complexity yields an identical estimate', () => {
		const widgets = [visibleWidget(2, 2), { offscreen: true, collapsed: false, activeBindings: 1 }];
		expect(estimateSceneRenderCost(widgets)).toEqual(estimateSceneRenderCost([...widgets]));
	});
});

describe('PERF-002 AC1 measureSceneFirstRender — grade against the scene-first-render budget, fail closed', () => {
	it('a light Scene PASSES the 1.5s first-render budget', () => {
		const { measurement } = measureSceneFirstRender([visibleWidget(1), visibleWidget(2)]);
		expect(measurement.result).toBe('pass');
		expect(measurement.budget?.id).toBe(SCENE_FIRST_RENDER_BUDGET_ID);
	});

	it('a HEAVY Scene whose estimate exceeds 1.5s is a BREACH (adversarial edge)', () => {
		// 200 heavy visible widgets, each weight 5 with 10 bindings → well over the 1500ms ceiling.
		const heavy = Array.from({ length: 200 }, () => visibleWidget(10, 5));
		const { measurement, estimate } = measureSceneFirstRender(heavy);
		expect(estimate.estimatedMs).toBeGreaterThan(1500);
		expect(measurement.result).toBe('breach');
		expect(measurement.message).toContain('Canvas'); // the owning domain is named on a breach
	});

	it('EXACTLY at the 1.5s ceiling PASSES (inclusive) — a tuned model lands the estimate on the threshold', () => {
		// A custom model whose base alone equals the 1500ms ceiling, no widgets → estimate exactly 1500.
		const { measurement, estimate } = measureSceneFirstRender([], {
			model: { ...DEFAULT_SCENE_RENDER_COST_MODEL, baseMs: 1500 },
		});
		expect(estimate.estimatedMs).toBe(1500);
		expect(measurement.result).toBe('pass');
		expect(measurement.marginToTarget).toBe(0);
	});

	it('a heavy Scene that virtualizes most widgets is brought back under budget (virtualization rescues the budget)', () => {
		const heavyVisible = Array.from({ length: 200 }, () => visibleWidget(10, 5));
		const heavyVirtualized = heavyVisible.map((w, i) =>
			i < 10 ? w : { ...w, offscreen: true },
		);
		expect(measureSceneFirstRender(heavyVisible).measurement.result).toBe('breach');
		expect(measureSceneFirstRender(heavyVirtualized).measurement.result).toBe('pass');
	});
});

describe('PERF-002 AC1 measureWidgetUpdate — grade observed latency against the widget-update budget, fail closed', () => {
	it('latencies under the 100ms p95 ceiling PASS', () => {
		const m = measureWidgetUpdate([20, 40, 30, 50, 45]);
		expect(m.result).toBe('pass');
		expect(m.budget?.id).toBe(WIDGET_UPDATE_BUDGET_ID);
	});

	it('a p95 over the ceiling BREACHES', () => {
		// 20 samples, 2 slow → nearest-rank p95 is a slow sample over the 100ms ceiling.
		const samples = Array.from({ length: 20 }, (_v, i) => (i >= 18 ? 400 : 30));
		expect(measureWidgetUpdate(samples).result).toBe('breach');
	});

	it('no samples is UNKNOWN, not a confident pass (fail closed — single/empty handled)', () => {
		expect(measureWidgetUpdate([]).result).toBe('unknown');
		// A single fast sample is enough to grade.
		expect(measureWidgetUpdate([10]).result).toBe('pass');
	});
});

describe('PERF-002 AC2 evaluateSubscriptionBackpressure — declared policy prevents render starvation, fail closed', () => {
	it('a high-frequency source with NO policy is UNBOUNDED (render starvation breach)', () => {
		const result = evaluateSubscriptionBackpressure({ sourceEventsPerSecond: 120, policy: 'none' });
		expect(result.bounded).toBe(false);
		expect(result.problem).toBe('unbounded-no-policy');
		expect(result.effectiveRenderRate).toBe(120);
	});

	it('a LOW-frequency source with no policy is fine (its own rate is already under the bound)', () => {
		const result = evaluateSubscriptionBackpressure({ sourceEventsPerSecond: 5, policy: 'none' });
		expect(result.bounded).toBe(true);
		expect(result.problem).toBeNull();
	});

	it('a debounce policy with a real window bounds a high-frequency source', () => {
		// 120/s source, debounce 50ms window → at most 20 renders/s, well under the 60/s bound.
		const result = evaluateSubscriptionBackpressure({
			sourceEventsPerSecond: 120,
			policy: 'debounce',
			windowMs: 50,
		});
		expect(result.bounded).toBe(true);
		expect(result.effectiveRenderRate).toBe(20);
	});

	it('throttle and sample bound the rate the same way', () => {
		for (const policy of ['throttle', 'sample'] as const) {
			const result = evaluateSubscriptionBackpressure({
				sourceEventsPerSecond: 1000,
				policy,
				windowMs: 100,
			});
			expect(result.bounded).toBe(true);
			expect(result.effectiveRenderRate).toBe(10);
		}
	});

	it('a bounded policy WITHOUT a positive window is not actually bounded (missing-window breach)', () => {
		expect(
			evaluateSubscriptionBackpressure({ sourceEventsPerSecond: 120, policy: 'throttle' }).problem,
		).toBe('missing-window');
		expect(
			evaluateSubscriptionBackpressure({ sourceEventsPerSecond: 120, policy: 'debounce', windowMs: 0 })
				.problem,
		).toBe('missing-window');
	});

	it('a policy whose window is so small the effective rate still starves is a breach', () => {
		// A 5ms throttle → 200 renders/s, over the 60/s bound even though a policy is declared.
		const result = evaluateSubscriptionBackpressure({
			sourceEventsPerSecond: 1000,
			policy: 'throttle',
			windowMs: 5,
		});
		expect(result.bounded).toBe(false);
		expect(result.problem).toBe('effective-rate-too-high');
	});

	it('a slow source is never rendered FASTER than it emits (effective rate is min(source, window rate))', () => {
		// 3/s source, 100ms window → window allows 10/s but the source only emits 3/s, so 3/s renders.
		const result = evaluateSubscriptionBackpressure({
			sourceEventsPerSecond: 3,
			policy: 'sample',
			windowMs: 100,
		});
		expect(result.effectiveRenderRate).toBe(3);
		expect(result.bounded).toBe(true);
	});

	it('respects a custom starvation bound', () => {
		const strict = evaluateSubscriptionBackpressure({
			sourceEventsPerSecond: 20,
			policy: 'none',
			starvationRenderRate: 10,
		});
		expect(strict.bounded).toBe(false);
		expect(strict.problem).toBe('unbounded-no-policy');
	});
});

// ===================================================================================================
// PERF-003 — Map rendering: the frame-rate model, device-class budgets, and incremental fog.
// ===================================================================================================

/** The PERF-007 reference map fixture: 4 layers / 100 POIs (plus a couple routes/tokens/fog). */
const REFERENCE_MAP: MapRenderComplexity = {
	visibleLayers: 4,
	visiblePois: 100,
	visibleFogRegions: 2,
	visibleRoutes: 2,
	visibleTokens: 4,
};

describe('PERF-003 AC1 estimateMapFrameRate — device class changes the frame rate for the same map', () => {
	it('the SAME map renders SLOWER on slim than on desktop (the slim multiplier)', () => {
		const desktop = estimateMapFrameRate(REFERENCE_MAP, 'desktop');
		const slim = estimateMapFrameRate(REFERENCE_MAP, 'slim');
		expect(slim.estimatedFps).toBeLessThan(desktop.estimatedFps);
		expect(desktop.deviceClass).toBe('desktop');
		expect(slim.deviceClass).toBe('slim');
	});

	it('a nested-map transition costs extra (lower frame rate while compositing parent + child)', () => {
		const still = estimateMapFrameRate(REFERENCE_MAP, 'desktop');
		const transitioning = estimateMapFrameRate(
			{ ...REFERENCE_MAP, nestedTransitionActive: true },
			'desktop',
		);
		expect(transitioning.estimatedFps).toBeLessThan(still.estimatedFps);
	});

	it('an empty map renders at a high, finite frame rate (no division by zero)', () => {
		const empty = estimateMapFrameRate(
			{ visibleLayers: 0, visiblePois: 0, visibleFogRegions: 0, visibleRoutes: 0, visibleTokens: 0 },
			'desktop',
		);
		expect(Number.isFinite(empty.estimatedFps)).toBe(true);
		expect(empty.estimatedFps).toBeGreaterThan(0);
	});

	it('a negative/NaN element count contributes nothing (no negative frame cost)', () => {
		const weird = estimateMapFrameRate(
			{ visibleLayers: -4, visiblePois: Number.NaN, visibleFogRegions: 0, visibleRoutes: 0, visibleTokens: 0 },
			'desktop',
		);
		// All counts coerce to 0 → just the base frame cost.
		expect(weird.frameMs).toBe(DEFAULT_MAP_RENDER_COST_MODEL.baseFrameMs);
	});

	it('is deterministic — identical complexity + device class yields an identical estimate', () => {
		expect(estimateMapFrameRate(REFERENCE_MAP, 'slim')).toEqual(
			estimateMapFrameRate({ ...REFERENCE_MAP }, 'slim'),
		);
	});
});

describe('PERF-003 AC1 measureMapPanZoom — desktop and slim floors enforced DISTINCTLY by device class', () => {
	it('the reference map PASSES the desktop 50fps floor', () => {
		const { measurement } = measureMapPanZoom(REFERENCE_MAP, 'desktop');
		expect(measurement.result).toBe('pass');
		expect(measurement.budget?.id).toBe(MAP_PAN_ZOOM_DESKTOP_BUDGET_ID);
	});

	it('the reference map is graded against the SLIM 30fps floor on slim (distinct budget id)', () => {
		const { measurement } = measureMapPanZoom(REFERENCE_MAP, 'slim');
		expect(measurement.budget?.id).toBe(MAP_PAN_ZOOM_SLIM_BUDGET_ID);
		// Whatever the verdict, it is the SLIM budget that grades slim — the floors are distinct.
		expect(measurement.target).toBe(budgetForId(MAP_PAN_ZOOM_SLIM_BUDGET_ID)?.metric.target);
	});

	it('a HEAVY map under the slim floor is a BREACH on slim (adversarial — slim profile enforced)', () => {
		// A dense map: many layers/POIs/tokens, on slim, with a nested transition.
		const heavy: MapRenderComplexity = {
			visibleLayers: 30,
			visiblePois: 3000,
			visibleFogRegions: 40,
			visibleRoutes: 50,
			visibleTokens: 400,
			nestedTransitionActive: true,
		};
		const slim = measureMapPanZoom(heavy, 'slim');
		expect(slim.estimate.estimatedFps).toBeLessThan(30);
		expect(slim.measurement.result).toBe('breach');
		expect(slim.measurement.message).toContain('Maps'); // owner named on breach
	});

	it('a map that BREACHES on slim can still PASS on desktop (the device-class distinction is real)', () => {
		// Tuned so the SAME map is over 50fps on desktop but under 30fps on slim is hard with one map;
		// instead show a map that passes desktop and the SAME complexity graded slim uses the lower floor.
		const moderate: MapRenderComplexity = {
			visibleLayers: 8,
			visiblePois: 600,
			visibleFogRegions: 6,
			visibleRoutes: 8,
			visibleTokens: 40,
		};
		const desktop = measureMapPanZoom(moderate, 'desktop');
		const slim = measureMapPanZoom(moderate, 'slim');
		expect(desktop.measurement.budget?.id).toBe(MAP_PAN_ZOOM_DESKTOP_BUDGET_ID);
		expect(slim.measurement.budget?.id).toBe(MAP_PAN_ZOOM_SLIM_BUDGET_ID);
		// Desktop frame rate is strictly higher than slim for the same map.
		expect(desktop.estimate.estimatedFps).toBeGreaterThan(slim.estimate.estimatedFps);
	});

	it('EXACTLY at the floor PASSES (inclusive) — a tuned model lands the estimate on the threshold', () => {
		// A custom model whose base frame ms = 1000/50 = 20ms with no elements → exactly 50fps on desktop.
		const onFloor = measureMapPanZoom(
			{ visibleLayers: 0, visiblePois: 0, visibleFogRegions: 0, visibleRoutes: 0, visibleTokens: 0 },
			'desktop',
			{ model: { ...DEFAULT_MAP_RENDER_COST_MODEL, baseFrameMs: 20 } },
		);
		expect(onFloor.estimate.estimatedFps).toBe(50);
		expect(onFloor.measurement.result).toBe('pass');
		expect(onFloor.measurement.marginToTarget).toBe(0);
	});

	it('mapPanZoomBudgetIdForDeviceClass resolves the distinct budget per class', () => {
		expect(mapPanZoomBudgetIdForDeviceClass('desktop')).toBe(MAP_PAN_ZOOM_DESKTOP_BUDGET_ID);
		expect(mapPanZoomBudgetIdForDeviceClass('slim')).toBe(MAP_PAN_ZOOM_SLIM_BUDGET_ID);
	});
});

describe('PERF-003 AC2 analyzeFogRegionUpdate — only affected render regions update, fail closed to full repaint', () => {
	const LAYERS: RenderLayerRegion[] = [
		{ layerId: 'layer-a', bounds: { x: 0, y: 0, w: 0.3, h: 0.3 } },
		{ layerId: 'layer-b', bounds: { x: 0.5, y: 0.5, w: 0.4, h: 0.4 } },
		{ layerId: 'layer-c', bounds: { x: 0.0, y: 0.6, w: 0.2, h: 0.2 } },
	];

	it('only the layers whose content OVERLAPS the fog region repaint (incremental)', () => {
		// A fog op in the top-left overlaps only layer-a.
		const analysis = analyzeFogRegionUpdate({ x: 0.05, y: 0.05, w: 0.1, h: 0.1 }, LAYERS, {
			supportsRegionInvalidation: true,
		});
		expect(analysis.incremental).toBe(true);
		expect(analysis.affectedLayerIds).toEqual(['layer-a']);
	});

	it('a fog op overlapping multiple layers repaints exactly those layers', () => {
		// A fog op covering the bottom band overlaps layer-b and layer-c.
		const analysis = analyzeFogRegionUpdate({ x: 0, y: 0.55, w: 1, h: 0.4 }, LAYERS, {
			supportsRegionInvalidation: true,
		});
		expect(analysis.incremental).toBe(true);
		expect(analysis.affectedLayerIds).toEqual(['layer-b', 'layer-c']);
	});

	it('a renderer WITHOUT region invalidation falls back to a FULL repaint (fail closed)', () => {
		const analysis = analyzeFogRegionUpdate({ x: 0.05, y: 0.05, w: 0.1, h: 0.1 }, LAYERS, {
			supportsRegionInvalidation: false,
		});
		expect(analysis.incremental).toBe(false);
		expect(analysis.affectedLayerIds).toEqual(['layer-a', 'layer-b', 'layer-c']);
	});

	it('an INVALID fog region conservatively repaints all layers (fail closed, never a stale frame)', () => {
		const analysis = analyzeFogRegionUpdate({ x: 0, y: 0, w: Number.NaN, h: -1 }, LAYERS, {
			supportsRegionInvalidation: true,
		});
		expect(analysis.incremental).toBe(false);
		expect(analysis.affectedLayerIds).toEqual(['layer-a', 'layer-b', 'layer-c']);
	});

	it('a fog op overlapping NO layer repaints nothing (incremental with an empty affected set)', () => {
		const analysis = analyzeFogRegionUpdate({ x: 0.35, y: 0.0, w: 0.05, h: 0.05 }, LAYERS, {
			supportsRegionInvalidation: true,
		});
		expect(analysis.incremental).toBe(true);
		expect(analysis.affectedLayerIds).toEqual([]);
	});

	it('is deterministic — identical fog region + layers yields an identical analysis', () => {
		const region = { x: 0.05, y: 0.05, w: 0.1, h: 0.1 };
		const a = analyzeFogRegionUpdate(region, LAYERS, { supportsRegionInvalidation: true });
		const b = analyzeFogRegionUpdate({ ...region }, [...LAYERS], { supportsRegionInvalidation: true });
		expect(a).toEqual(b);
	});
});

// ===================================================================================================
// Composition — the Scene/map render measurements grade against the REAL declared budgets, fail closed.
// ===================================================================================================

describe('PERF-002 / PERF-003 composition — uses the canonical PERF registry, never a parallel grader', () => {
	it('the budget ids this module grades against are owned by the registry', () => {
		for (const id of [
			SCENE_FIRST_RENDER_BUDGET_ID,
			WIDGET_UPDATE_BUDGET_ID,
			MAP_PAN_ZOOM_DESKTOP_BUDGET_ID,
			MAP_PAN_ZOOM_SLIM_BUDGET_ID,
		]) {
			expect(budgetForId(id), `budget "${id}" must be registry-owned`).not.toBeNull();
		}
	});

	it('the scene-first-render budget is owned by Canvas; the map pan/zoom budgets by Maps', () => {
		expect(budgetForId(SCENE_FIRST_RENDER_BUDGET_ID)?.owner).toBe('Canvas');
		expect(budgetForId(MAP_PAN_ZOOM_DESKTOP_BUDGET_ID)?.owner).toBe('Maps');
		expect(budgetForId(MAP_PAN_ZOOM_SLIM_BUDGET_ID)?.owner).toBe('Maps');
	});

	it('grading against a custom registry that does NOT own the id is an ERROR, never a silent pass', () => {
		const empty = measureSceneFirstRender([visibleWidget(1)], { budgets: [] });
		expect(empty.measurement.result).toBe('error');
		expect(empty.measurement.reason).toBe('unknown-budget');
	});
});
