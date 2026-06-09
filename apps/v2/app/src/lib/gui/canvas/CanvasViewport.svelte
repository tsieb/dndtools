<script lang="ts">
	/**
	 * Reusable spatial canvas viewport (UX-CANVAS-001/014/016) — the foundational pan/zoom surface every
	 * later spatial route (Command Center, Scenes, maps, player views) embeds. It is the DOM/CSS render
	 * baseline mandated by the canvas-renderer decision (architecture-decisions §4), built behind the
	 * `ViewportController` so a GPU backend could replace the rendering without changing this component's
	 * props or the controller API.
	 *
	 * Every Must-have viewport action is reachable THREE ways so none is gesture-only, pointer-only, or
	 * desktop-only (UX-CANVAS-016 / acceptance bar):
	 *   • Keyboard: arrow keys pan (Shift = far), +/− zoom one stop, 0 fit, Shift+0 fit-selection,
	 *     1 = 100%, 2 = 200%, 5 = 50% (resolved through the shared a11y arrow matcher).
	 *   • On-screen (non-gesture) pointer: always-visible zoom −/+/fit/100% buttons (≥44×44), an editable
	 *     zoom-percent field, and a draggable minimap.
	 *   • Gesture: wheel zoom-to-pointer, drag-to-pan, two-finger pinch (zoom about the midpoint).
	 *
	 * Perceived performance (UX-CANVAS-014): off-screen tiles are virtualized away, hot interactions
	 * acknowledge synchronously (latency surfaced in diagnostics), data-pending tiles show layout-matched
	 * skeletons, and a frame-budget monitor drops to a calm poster-frame indicator under sustained jank.
	 * All animation is reduced-motion aware (durations collapse via the motion tokens; inertia is gated).
	 */
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		ViewportController,
		easeOutCubic,
		inertiaDisplacement,
		unionBounds,
		visibleWorldRect,
		type Bounds,
		type Vec2,
	} from '$lib/canvas-runtime';
	import { useMotion } from '$lib/platform/motion.svelte';
	import { useLiveAnnouncer } from '$lib/gui/a11y/live-announcer.svelte';
	import type { CanvasTile, MinimapMode } from './types';

	interface Props {
		tiles: CanvasTile[];
		/** Accessible name for the canvas application region. */
		label?: string;
		/** Minimap presentation for the active platform profile (UX-CANVAS-001 §Minimap). */
		minimap?: MinimapMode;
		/** Force the data-pending skeleton state on every tile (initial load / rebind / sync). */
		loading?: boolean;
		/** Optional externally-owned controller, so a host route can drive the same viewport. */
		controller?: ViewportController;
		/** World-space bounds of the current selection (Shift+0 zoom-to-selection target). */
		selectionBounds?: Bounds | null;
	}

	let {
		tiles,
		label = 'Scene canvas',
		minimap = 'persistent',
		loading = false,
		controller: providedController,
		selectionBounds = null,
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	// The controller is captured once: a host either owns it (and re-mounts to change it) or this
	// component creates a stable instance for the surface's lifetime.
	const controller = providedController ?? new ViewportController();
	const motion = useMotion();
	const announcer = useLiveAnnouncer();

	let surfaceEl = $state<HTMLDivElement | null>(null);
	// svelte-ignore state_referenced_locally
	// `minimap` only seeds the initial visibility; the mode itself does not change after mount.
	let minimapVisible = $state(minimap === 'persistent');
	let skeletonDemo = $state(false);
	let perfMode = $state(false);

	// Reduced motion comes from the resolved motion preference (never a raw media query — that probe is
	// owned by the platform layer). It gates inertia and zeroes transition durations via the tokens.
	const reduced = $derived(motion.resolvedMotion === 'reduced');
	$effect(() => controller.setReducedMotion(reduced));

	// Keep the controller's content bounds + widget count in step with the supplied tiles.
	$effect(() => controller.setContentRects(tiles));

	// Only the tiles within the viewport + one-viewport bleed are rendered (UX-CANVAS-014 virtualization).
	const visibleTiles = $derived(controller.cull(tiles));

	// --- Pointer / gesture state -------------------------------------------------------------------
	const pointers = new SvelteMap<number, Vec2>();
	let panning = $state(false);
	let panVelocity: Vec2 = { x: 0, y: 0 };
	let lastPanPoint: Vec2 = { x: 0, y: 0 };
	let lastPanTime = 0;
	let inertiaRaf = 0;
	let minimapDragging = false;

	/** The two active touch points for a pinch, or `null` when fewer than two are down. */
	function twoPointers(): [Vec2, Vec2] | null {
		const pts = [...pointers.values()];
		return pts.length >= 2 && pts[0] && pts[1] ? [pts[0], pts[1]] : null;
	}

	function surfacePoint(event: { clientX: number; clientY: number }): Vec2 {
		const rect = surfaceEl?.getBoundingClientRect();
		return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
	}

	function cancelInertia() {
		if (inertiaRaf) {
			cancelAnimationFrame(inertiaRaf);
			inertiaRaf = 0;
		}
	}

	function startInertia() {
		if (reduced) return;
		if (Math.hypot(panVelocity.x, panVelocity.y) < 0.05) return;
		const dispX = inertiaDisplacement(panVelocity.x);
		const dispY = inertiaDisplacement(panVelocity.y);
		const t0 = performance.now();
		let appliedX = 0;
		let appliedY = 0;
		const tick = (t: number) => {
			const u = Math.min(1, (t - t0) / 400);
			const ease = easeOutCubic(u);
			const ex = dispX * ease;
			const ey = dispY * ease;
			controller.panBy(ex - appliedX, ey - appliedY);
			controller.recordFrame(t);
			appliedX = ex;
			appliedY = ey;
			if (u < 1 && pointers.size === 0) {
				inertiaRaf = requestAnimationFrame(tick);
			} else {
				inertiaRaf = 0;
				controller.posterFrameRecover();
			}
		};
		inertiaRaf = requestAnimationFrame(tick);
	}

	function isControl(target: EventTarget | null): boolean {
		return target instanceof HTMLElement && !!target.closest('[data-canvas-no-pan]');
	}

	function onPointerDown(event: PointerEvent) {
		if (isControl(event.target)) return;
		cancelInertia();
		(event.target as HTMLElement)?.setPointerCapture?.(event.pointerId);
		const p = surfacePoint(event);
		pointers.set(event.pointerId, p);
		const pair = twoPointers();
		if (pair) {
			controller.beginPinch(pair[0], pair[1]);
			panning = false;
		} else if (pointers.size === 1) {
			panning = true;
			lastPanPoint = p;
			lastPanTime = performance.now();
			panVelocity = { x: 0, y: 0 };
		}
	}

	function onPointerMove(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return;
		const p = surfacePoint(event);
		pointers.set(event.pointerId, p);
		const pair = twoPointers();
		if (pair) {
			controller.updatePinch(pair[0], pair[1]);
			return;
		}
		if (!panning) return;
		const dx = p.x - lastPanPoint.x;
		const dy = p.y - lastPanPoint.y;
		controller.panBy(dx, dy);
		controller.recordFrame(performance.now());
		const now = performance.now();
		const dt = Math.max(1, now - lastPanTime);
		// Only touch flicks carry inertia (pen/mouse drags stop on release).
		if (event.pointerType === 'touch') {
			panVelocity = { x: dx / dt, y: dy / dt };
		}
		lastPanPoint = p;
		lastPanTime = now;
	}

	function endPointer(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return;
		pointers.delete(event.pointerId);
		if (pointers.size < 2) controller.endPinch();
		if (pointers.size === 0) {
			if (panning) startInertia();
			panning = false;
			controller.posterFrameRecover();
		}
	}

	function onWheel(event: WheelEvent) {
		if (isControl(event.target)) return;
		event.preventDefault();
		cancelInertia();
		// Scroll wheel / trackpad pinch zooms toward the pointer (UX-CANVAS-001 §Input; AC1 zoom-to-pointer).
		const factor = Math.exp(-event.deltaY * 0.0015);
		controller.zoomByFactorAt(factor, surfacePoint(event));
		controller.recordFrame(performance.now());
	}

	function onKeydown(event: KeyboardEvent) {
		// Shortcuts only when the canvas region itself is focused, never while typing in a control.
		if (isControl(event.target) && event.target !== event.currentTarget) return;
		const handled = controller.handleKey(event.key, event.shiftKey, selectionBounds);
		if (handled) {
			event.preventDefault();
			cancelInertia();
		}
	}

	// --- On-screen (non-gesture) controls ----------------------------------------------------------
	function commitZoomField() {
		const value = Number.parseFloat(zoomFieldValue);
		if (Number.isFinite(value)) controller.setZoomPercent(value);
	}

	function onZoomFieldKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitZoomField();
		}
	}

	// The editable zoom field is a writable derived of the controller zoom: it reflects the canonical
	// zoom %, and typing reassigns it (committed on Enter/blur). Since it depends only on the zoom %
	// (which changes on commit, not per keystroke), in-progress typing is not overwritten.
	let zoomFieldValue = $derived(String(controller.zoomPercent));

	// Debounced (500 ms) polite zoom announcement (UX-CANVAS-001 accessibility).
	let lastAnnouncedZoom = controller.zoomPercent;
	let announceTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const pct = controller.zoomPercent;
		if (pct === lastAnnouncedZoom) return;
		clearTimeout(announceTimer);
		announceTimer = setTimeout(() => {
			lastAnnouncedZoom = pct;
			announcer?.announce(`Zoom ${pct} percent.`, 'polite');
		}, 500);
	});

	// --- Minimap geometry --------------------------------------------------------------------------
	const MINIMAP_W = 160;
	const MINIMAP_H = 120;

	// The world frame the minimap depicts: content bounds unioned with the current visible rect, padded.
	const minimapFrame = $derived.by<Bounds>(() => {
		const visible = visibleWorldRect(controller.viewport, controller.size);
		const content = controller.contentBounds;
		const frame = content
			? unionBounds([
					{ x: content.minX, y: content.minY, w: content.maxX - content.minX, h: content.maxY - content.minY },
					{ x: visible.minX, y: visible.minY, w: visible.maxX - visible.minX, h: visible.maxY - visible.minY },
				])!
			: visible;
		const padX = (frame.maxX - frame.minX) * 0.1 || 100;
		const padY = (frame.maxY - frame.minY) * 0.1 || 100;
		return {
			minX: frame.minX - padX,
			minY: frame.minY - padY,
			maxX: frame.maxX + padX,
			maxY: frame.maxY + padY,
		};
	});

	const minimapScale = $derived.by(() => {
		const fw = Math.max(1, minimapFrame.maxX - minimapFrame.minX);
		const fh = Math.max(1, minimapFrame.maxY - minimapFrame.minY);
		return Math.min(MINIMAP_W / fw, MINIMAP_H / fh);
	});

	function worldToMinimap(wx: number, wy: number): Vec2 {
		return {
			x: (wx - minimapFrame.minX) * minimapScale,
			y: (wy - minimapFrame.minY) * minimapScale,
		};
	}

	// The minimap viewport rectangle (the currently visible world area).
	const minimapRect = $derived.by(() => {
		const visible = visibleWorldRect(controller.viewport, controller.size);
		const tl = worldToMinimap(visible.minX, visible.minY);
		const br = worldToMinimap(visible.maxX, visible.maxY);
		return { left: tl.x, top: tl.y, width: Math.max(4, br.x - tl.x), height: Math.max(4, br.y - tl.y) };
	});

	function minimapPointToWorld(event: { clientX: number; clientY: number }, el: HTMLElement): Vec2 {
		const rect = el.getBoundingClientRect();
		const mx = event.clientX - rect.left;
		const my = event.clientY - rect.top;
		return {
			x: minimapFrame.minX + mx / minimapScale,
			y: minimapFrame.minY + my / minimapScale,
		};
	}

	function onMinimapPointerDown(event: PointerEvent) {
		minimapDragging = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		controller.panToWorldPoint(minimapPointToWorld(event, event.currentTarget as HTMLElement));
	}
	function onMinimapPointerMove(event: PointerEvent) {
		if (!minimapDragging) return;
		controller.panToWorldPoint(minimapPointToWorld(event, event.currentTarget as HTMLElement));
	}
	function onMinimapPointerUp(event: PointerEvent) {
		minimapDragging = false;
		(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
	}
	function onMinimapKeydown(event: KeyboardEvent) {
		// Keyboard parity for the minimap: Enter/Space recenters by fitting all content.
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			controller.zoomToFit();
		}
	}

	// --- Sizing + initial fit ----------------------------------------------------------------------
	onMount(() => {
		if (!surfaceEl) return;
		const measure = () => {
			if (!surfaceEl) return;
			controller.setSize({ w: surfaceEl.clientWidth, h: surfaceEl.clientHeight });
		};
		measure();
		controller.zoomToFit();
		const observer = new ResizeObserver(measure);
		observer.observe(surfaceEl);
		return () => {
			observer.disconnect();
			cancelInertia();
			clearTimeout(announceTimer);
		};
	});

	// Tiles are presentational on the spatial canvas; the keyboard/screen-reader path is the Scene
	// Outline + widget cards (UX-CANVAS-015), so a tile shows a skeleton only when its data is pending.
	function tilePending(tile: CanvasTile): boolean {
		return loading || skeletonDemo || tile.state === 'pending';
	}
	function tilePlaceholder(tile: CanvasTile): string | null {
		switch (tile.state) {
			case 'missing':
				return 'Binding missing';
			case 'conflicted':
				return 'Binding conflicted';
			case 'unbound':
				return 'Needs a data source';
			default:
				return null;
		}
	}

	const transform = $derived(
		`translate(${controller.viewport.tx}px, ${controller.viewport.ty}px) scale(${controller.viewport.scale})`,
	);
	const renderedCount = $derived(visibleTiles.length);
</script>

<!-- UX-CANVAS-015: the spatial canvas is a keyboard-operable `role="application"` region with an
     accessible name and roledescription. The element is intentionally focusable and wired to keyboard
     + pointer handlers so every viewport action has a keyboard path; the structural screen-reader path
     is the Scene Outline, so this is not a missing-affordance case. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
	class="canvas-viewport"
	class:is-poster-frame={controller.posterFrame}
	role="application"
	aria-label={label}
	aria-roledescription="Spatial canvas"
	tabindex="0"
	data-testid="canvas-viewport"
	data-perf-mode={perfMode}
	data-reduced-motion={reduced}
	onkeydown={onKeydown}
	onwheel={onWheel}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={endPointer}
	onpointercancel={endPointer}
>
	<div class="canvas-surface" data-canvas-surface bind:this={surfaceEl}>
		<div class="canvas-world" data-animating={!panning && !controller.pinching} style={`transform: ${transform};`} aria-hidden="true">
			{#each visibleTiles as tile (tile.id)}
				<div
					class="canvas-tile"
					class:is-skeleton={tilePending(tile)}
					data-testid={`canvas-tile-${tile.id}`}
					data-visibility={tile.visibility}
					style={`transform: translate(${tile.x}px, ${tile.y}px); width: ${tile.w}px; height: ${tile.h}px;`}
				>
					<div class="canvas-tile-head">
						<span class="canvas-tile-type">{tile.type}</span>
						{#if tile.visibility === 'dm-only'}
							<span class="canvas-tile-badge" data-testid={`canvas-tile-dm-${tile.id}`}>
								<span class="canvas-tile-badge-stripe" aria-hidden="true"></span>DM Only
							</span>
						{/if}
					</div>
					{#if tilePending(tile)}
						<div class="canvas-tile-skeleton" data-testid={`canvas-skeleton-${tile.id}`}>
							<span class="skeleton-line"></span>
							<span class="skeleton-line short"></span>
						</div>
					{:else if tilePlaceholder(tile)}
						<p class="canvas-tile-placeholder">{tilePlaceholder(tile)}</p>
					{:else}
						<p class="canvas-tile-title">{tile.title}</p>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Poster-frame degradation indicator (UX-CANVAS-014): a calm thin line + one polite
		     announcement per episode, never a blocking spinner. -->
		<p
			class="canvas-rendering"
			role="status"
			aria-live="polite"
			data-testid="canvas-poster-frame"
			data-active={controller.posterFrame}
		>
			{#if controller.posterFrame}Canvas rendering, please wait.{/if}
		</p>
	</div>

	<!-- On-screen zoom controls — the always-available non-gesture pointer alternatives (UX-CANVAS-016). -->
	<div class="canvas-controls" role="toolbar" aria-label="Canvas zoom controls" data-canvas-no-pan data-testid="canvas-controls">
		<button type="button" class="canvas-btn" aria-label="Zoom out" data-testid="canvas-zoom-out" onclick={() => controller.zoomOutAt()}>−</button>
		<label class="canvas-zoom-field">
			<span class="sr-only">Zoom percent — type a number and press Enter</span>
			<input
				type="text"
				inputmode="numeric"
				aria-label="Zoom percent"
				data-testid="canvas-zoom-input"
				bind:value={zoomFieldValue}
				onkeydown={onZoomFieldKeydown}
				onblur={commitZoomField}
			/>
			<span aria-hidden="true">%</span>
		</label>
		<button type="button" class="canvas-btn" aria-label="Zoom in" data-testid="canvas-zoom-in" onclick={() => controller.zoomInAt()}>+</button>
		<button type="button" class="canvas-btn" aria-label="Zoom to fit" data-testid="canvas-zoom-fit" onclick={() => controller.zoomToFit()}>Fit</button>
		<button type="button" class="canvas-btn" aria-label="Zoom to 100 percent" data-testid="canvas-zoom-100" onclick={() => controller.zoomTo100()}>1:1</button>
		{#if minimap === 'toggle'}
			<button
				type="button"
				class="canvas-btn"
				aria-pressed={minimapVisible}
				aria-label="Toggle minimap"
				data-testid="canvas-minimap-toggle"
				onclick={() => (minimapVisible = !minimapVisible)}>Map</button
			>
		{/if}
	</div>

	{#if minimap !== 'hidden' && minimapVisible}
		<button
			type="button"
			class="canvas-minimap"
			data-canvas-no-pan
			data-testid="canvas-minimap"
			aria-label="Canvas overview — drag to navigate, Enter to fit all"
			onpointerdown={onMinimapPointerDown}
			onpointermove={onMinimapPointerMove}
			onpointerup={onMinimapPointerUp}
			onpointercancel={onMinimapPointerUp}
			onkeydown={onMinimapKeydown}
		>
			<span
				class="canvas-minimap-rect"
				aria-hidden="true"
				style={`left:${minimapRect.left}px;top:${minimapRect.top}px;width:${minimapRect.width}px;height:${minimapRect.height}px;`}
			></span>
		</button>
	{/if}

	<!-- Canvas diagnostics (UX-CANVAS-014 instrumentation): observable perceived-performance evidence
	     plus the skeleton / performance-mode demonstrations and the poster-frame exerciser. -->
	<details class="canvas-diagnostics" data-canvas-no-pan data-testid="canvas-diagnostics">
		<summary>Canvas diagnostics</summary>
		<dl class="canvas-perf" data-testid="canvas-perf">
			<dt>Zoom</dt>
			<dd data-testid="canvas-perf-zoom">{controller.zoomPercent}%</dd>
			<dt>Frame</dt>
			<dd>{controller.fps} fps</dd>
			<dt>Acknowledge</dt>
			<dd data-testid="canvas-perf-ack">
				{controller.lastAckMs === null ? '—' : `${controller.lastAckMs.toFixed(1)} ms`}
				{controller.ackWithinBudget ? '✓ ≤100ms' : '⚠ over budget'}
			</dd>
			<dt>Rendered</dt>
			<dd data-testid="canvas-perf-rendered">{renderedCount} / {tiles.length}</dd>
			<dt>Poster-frame</dt>
			<dd data-testid="canvas-perf-poster">{controller.posterFrame ? 'active' : 'idle'}</dd>
		</dl>
		{#if controller.widgetWarning}
			<p class="canvas-warning" role="status" data-testid="canvas-widget-warning">{controller.widgetWarning}</p>
		{/if}
		<div class="canvas-diag-controls">
			<label class="canvas-diag-toggle">
				<input type="checkbox" data-testid="canvas-skeleton-toggle" bind:checked={skeletonDemo} />
				<span>Show data-loading skeletons</span>
			</label>
			<label class="canvas-diag-toggle">
				<input type="checkbox" data-testid="canvas-perf-mode-toggle" bind:checked={perfMode} />
				<span>Performance mode (reduce chrome)</span>
			</label>
			<button type="button" class="canvas-btn" data-testid="canvas-simulate-jank" onclick={() => controller.simulateJank()}>
				Simulate slow frames
			</button>
		</div>
	</details>
</section>

<style>
	.canvas-viewport {
		position: relative;
		width: 100%;
		height: clamp(320px, 56vh, 640px);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-surface-sunken);
		/* Subtle grid texture for spatial orientation — low contrast per Apple HIG (research §3.2). */
		background-image:
			linear-gradient(to right, var(--color-border) 1px, transparent 1px),
			linear-gradient(to bottom, var(--color-border) 1px, transparent 1px);
		background-size: 32px 32px;
		overflow: hidden;
		touch-action: none;
		outline-offset: -2px;
	}

	.canvas-surface {
		position: absolute;
		inset: 0;
		cursor: grab;
	}

	.canvas-world {
		position: absolute;
		inset: 0;
		transform-origin: 0 0;
		will-change: transform;
	}
	.canvas-world[data-animating='true'] {
		/* Discrete zoom / fit transitions; durations collapse to 0 under reduced motion via the tokens. */
		transition: transform var(--duration-fast) var(--easing-decelerate);
	}

	.canvas-tile {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}
	.canvas-tile[data-visibility='dm-only'] {
		border-color: var(--color-dm-only-badge);
		background-image: repeating-linear-gradient(
			135deg,
			var(--color-hidden-content-stripe),
			var(--color-hidden-content-stripe) 6px,
			transparent 6px,
			transparent 12px
		);
	}
	.canvas-tile-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.canvas-tile-type {
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
	}
	.canvas-tile-title {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-primary);
	}
	.canvas-tile-placeholder {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-status-warning-text);
	}
	.canvas-tile-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-2xs);
		font-weight: var(--font-weight-bold);
		color: var(--color-text-primary);
		background: var(--color-dm-only-subtle);
		border: 1px solid var(--color-dm-only-badge);
		border-radius: var(--radius-full);
		padding: 0 var(--space-1-5);
	}
	.canvas-tile-badge-stripe {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-sm);
		background: repeating-linear-gradient(
			45deg,
			var(--color-dm-only-badge),
			var(--color-dm-only-badge) 2px,
			transparent 2px,
			transparent 4px
		);
	}

	/* Performance mode (UX-CANVAS-014): hide tile chrome to recover frame budget. */
	[data-perf-mode='true'] .canvas-tile-head,
	[data-perf-mode='true'] .canvas-tile-title {
		display: none;
	}

	/* Skeleton state — layout-matched, not a generic spinner (UX-CANVAS-014). Shimmer uses the motion
	   tokens, so it is suppressed under reduced motion (no media query needed). */
	.canvas-tile-skeleton {
		display: flex;
		flex-direction: column;
		gap: var(--space-1-5);
		padding-top: var(--space-1);
	}
	.skeleton-line {
		height: var(--space-3);
		border-radius: var(--radius-sm);
		background: linear-gradient(
			90deg,
			var(--color-surface-overlay) 25%,
			var(--color-surface-raised) 37%,
			var(--color-surface-overlay) 63%
		);
		background-size: 400% 100%;
		animation: canvas-shimmer var(--duration-crawl) var(--easing-linear) infinite;
	}
	.skeleton-line.short {
		width: 60%;
	}
	:global([data-motion='reduced']) .skeleton-line,
	:global([data-motion='none']) .skeleton-line {
		animation: none;
	}
	@keyframes canvas-shimmer {
		from {
			background-position: 100% 0;
		}
		to {
			background-position: 0 0;
		}
	}

	.canvas-rendering {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		margin: 0;
		padding: var(--space-0-5) var(--space-2);
		font-size: var(--text-2xs);
		color: var(--color-text-secondary);
		background: var(--color-surface-overlay);
		border-top: 2px solid var(--color-accent);
		opacity: 0;
		pointer-events: none;
	}
	.canvas-rendering[data-active='true'] {
		opacity: 1;
	}

	.canvas-controls {
		position: absolute;
		top: var(--space-2);
		left: var(--space-2);
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1);
		background: var(--color-surface-overlay);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
	}
	.canvas-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: var(--touch-target-min);
		min-height: var(--touch-target-min);
		padding: 0 var(--space-2);
		background: var(--color-surface-raised);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.canvas-btn:hover {
		background: var(--color-interactive-hover);
	}
	.canvas-zoom-field {
		display: inline-flex;
		align-items: center;
		gap: var(--space-0-5);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.canvas-zoom-field input {
		width: 3.5rem;
		min-height: var(--touch-target-min);
		text-align: right;
		background: var(--color-surface-raised);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-1);
	}

	.canvas-minimap {
		position: absolute;
		right: var(--space-2);
		bottom: var(--space-2);
		width: 160px;
		height: 120px;
		padding: 0;
		background: var(--color-surface-overlay);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-md);
		cursor: pointer;
		overflow: hidden;
	}
	.canvas-minimap-rect {
		position: absolute;
		border: 1px solid var(--color-accent);
		background: var(--color-interactive-selected);
		pointer-events: none;
	}

	.canvas-diagnostics {
		position: absolute;
		left: var(--space-2);
		bottom: var(--space-2);
		max-width: min(22rem, 70%);
		padding: var(--space-1) var(--space-2);
		background: var(--color-surface-overlay);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.canvas-diagnostics summary {
		cursor: pointer;
		min-height: var(--touch-target-floor);
		display: flex;
		align-items: center;
	}
	.canvas-perf {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-0-5) var(--space-2);
		margin: var(--space-1) 0;
	}
	.canvas-perf dt {
		color: var(--color-text-tertiary);
	}
	.canvas-perf dd {
		margin: 0;
		color: var(--color-text-primary);
	}
	.canvas-warning {
		margin: var(--space-1) 0;
		color: var(--color-status-warning-text);
	}
	.canvas-diag-controls {
		display: grid;
		gap: var(--space-1);
		margin-top: var(--space-1);
	}
	.canvas-diag-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
