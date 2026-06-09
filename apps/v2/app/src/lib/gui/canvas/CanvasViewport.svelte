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
	import { onMount, type Snippet } from 'svelte';
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
		/**
		 * UX-CANVAS-005/003/004: opt-in editor interactivity. When set, single-pointer drag on empty
		 * canvas marquee-selects, a tile pointer-down selects + drag-moves, and the primary selection
		 * grows pointer resize + rotation handles. The keyboard / non-gesture paths live OUTSIDE this
		 * presentational (aria-hidden) world layer — the Scene Outline, selection toolbar, transform panel
		 * and the canvas-region shortcut handler — so the canvas chrome stays out of the a11y tree.
		 */
		interactive?: boolean;
		/** Ids of the currently-selected widgets (drives the selection rings + handles). */
		selectedIds?: ReadonlySet<string>;
		/** The primary (most-recent) selection id — the one that shows resize + rotation handles. */
		primaryId?: string | null;
		/** Select a tile (plain or toggle via Shift/Ctrl). */
		onSelectTile?: (id: string, mode: 'replace' | 'toggle') => void;
		/** A marquee drag finished: world-space start/end corners + whether Shift (additive). A
		 *  zero-area marquee (a click on empty canvas) clears the selection. */
		onMarquee?: (start: Vec2, end: Vec2, additive: boolean) => void;
		/** A tile move-drag committed: new world top-left. */
		onMoveCommit?: (id: string, x: number, y: number) => void;
		/** A corner resize-drag committed: new world size. */
		onResizeCommit?: (id: string, w: number, h: number) => void;
		/** A rotation-drag committed: absolute degrees (caller snaps). `free` = Shift held (1°). */
		onRotateCommit?: (id: string, deg: number, free: boolean) => void;
		/** Manipulation key handler given first crack at canvas keys; returns true when it handled one. */
		onManipulationKey?: (event: KeyboardEvent) => boolean;
		/**
		 * UX-CANVAS-008 §Show bindings overlay: when true, each bound tile shows its binding label as a
		 * persistent on-canvas chip so a DM can audit every binding at a glance.
		 */
		showBindings?: boolean;
		/** Pointer path for the tile collapse chevron (UX-CANVAS-007); keyboard path is the chrome panel + `C`. */
		onToggleCollapse?: (id: string) => void;
		/** Pointer path for the tile `⋯` actions trigger (UX-CANVAS-007); selects + opens the chrome panel. */
		onOpenActions?: (id: string) => void;
		/** "Rebind" recovery action shown in a missing/conflicted binding placeholder (UX-CANVAS-007 AC4). */
		onRebind?: (id: string) => void;
		/** Teaching empty state (UX-CANVAS-013) rendered over the canvas when there are no tiles. */
		emptyState?: Snippet;
	}

	let {
		tiles,
		label = 'Scene canvas',
		minimap = 'persistent',
		loading = false,
		controller: providedController,
		selectionBounds = null,
		interactive = false,
		selectedIds,
		primaryId = null,
		onSelectTile,
		onMarquee,
		onMoveCommit,
		onResizeCommit,
		onRotateCommit,
		onManipulationKey,
		showBindings = false,
		onToggleCollapse,
		onOpenActions,
		onRebind,
		emptyState,
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

	// --- Editor interaction (UX-CANVAS-005/003/004), all pointer-only on the aria-hidden world ---------
	type Corner = 'nw' | 'ne' | 'sw' | 'se';
	interface MoveInteraction {
		kind: 'move';
		id: string;
		startWorld: Vec2;
		originX: number;
		originY: number;
		moved: boolean;
	}
	interface ResizeInteraction {
		kind: 'resize';
		id: string;
		corner: Corner;
		startWorld: Vec2;
		rect: { x: number; y: number; w: number; h: number };
	}
	interface RotateInteraction {
		kind: 'rotate';
		id: string;
		center: Vec2;
		free: boolean;
	}
	interface MarqueeInteraction {
		kind: 'marquee';
		startWorld: Vec2;
		additive: boolean;
	}
	type Interaction = MoveInteraction | ResizeInteraction | RotateInteraction | MarqueeInteraction;

	let interaction = $state<Interaction | null>(null);
	// Live drag preview offsets (screen-independent world deltas) for the active move/resize/marquee.
	let dragDelta = $state<Vec2>({ x: 0, y: 0 });
	let resizePreview = $state<{ w: number; h: number } | null>(null);
	let marqueePreview = $state<{ x: number; y: number; w: number; h: number } | null>(null);

	function worldPoint(event: { clientX: number; clientY: number }): Vec2 {
		const sp = surfacePoint(event);
		const w = screenToWorldPt(sp);
		return w;
	}
	function screenToWorldPt(sp: Vec2): Vec2 {
		const v = controller.viewport;
		return { x: (sp.x - v.tx) / v.scale, y: (sp.y - v.ty) / v.scale };
	}

	function tileById(id: string): CanvasTile | undefined {
		return tiles.find((t) => t.id === id);
	}

	function beginTileMove(event: PointerEvent, id: string) {
		const tile = tileById(id);
		if (!tile) return;
		const mode: 'replace' | 'toggle' = event.shiftKey || event.ctrlKey || event.metaKey ? 'toggle' : 'replace';
		onSelectTile?.(id, mode);
		interaction = { kind: 'move', id, startWorld: worldPoint(event), originX: tile.x, originY: tile.y, moved: false };
		dragDelta = { x: 0, y: 0 };
	}

	function beginResize(event: PointerEvent, id: string, corner: Corner) {
		const tile = tileById(id);
		if (!tile) return;
		event.stopPropagation();
		interaction = {
			kind: 'resize',
			id,
			corner,
			startWorld: worldPoint(event),
			rect: { x: tile.x, y: tile.y, w: tile.w, h: tile.h },
		};
		resizePreview = { w: tile.w, h: tile.h };
		(event.target as HTMLElement)?.setPointerCapture?.(event.pointerId);
	}

	function beginRotate(event: PointerEvent, id: string) {
		const tile = tileById(id);
		if (!tile) return;
		event.stopPropagation();
		interaction = {
			kind: 'rotate',
			id,
			center: { x: tile.x + tile.w / 2, y: tile.y + tile.h / 2 },
			free: event.shiftKey,
		};
		(event.target as HTMLElement)?.setPointerCapture?.(event.pointerId);
	}

	function updateInteraction(event: PointerEvent) {
		if (!interaction) return;
		const wp = worldPoint(event);
		switch (interaction.kind) {
			case 'move': {
				const dx = wp.x - interaction.startWorld.x;
				const dy = wp.y - interaction.startWorld.y;
				dragDelta = { x: dx, y: dy };
				if (Math.abs(dx) > 1 || Math.abs(dy) > 1) interaction.moved = true;
				break;
			}
			case 'resize': {
				const dx = wp.x - interaction.startWorld.x;
				const dy = wp.y - interaction.startWorld.y;
				const east = interaction.corner === 'ne' || interaction.corner === 'se';
				const south = interaction.corner === 'sw' || interaction.corner === 'se';
				const w = interaction.rect.w + (east ? dx : -dx);
				const h = interaction.rect.h + (south ? dy : -dy);
				resizePreview = { w: Math.max(40, Math.round(w)), h: Math.max(40, Math.round(h)) };
				break;
			}
			case 'rotate': {
				const deg = (Math.atan2(wp.x - interaction.center.x, -(wp.y - interaction.center.y)) * 180) / Math.PI;
				rotatePreview = deg < 0 ? deg + 360 : deg;
				break;
			}
			case 'marquee': {
				const x = Math.min(interaction.startWorld.x, wp.x);
				const y = Math.min(interaction.startWorld.y, wp.y);
				marqueePreview = {
					x,
					y,
					w: Math.abs(wp.x - interaction.startWorld.x),
					h: Math.abs(wp.y - interaction.startWorld.y),
				};
				break;
			}
		}
	}

	let rotatePreview = $state<number | null>(null);

	function finishInteraction(event: PointerEvent) {
		const active = interaction;
		if (!active) return;
		switch (active.kind) {
			case 'move': {
				if (active.moved) {
					onMoveCommit?.(active.id, Math.round(active.originX + dragDelta.x), Math.round(active.originY + dragDelta.y));
				}
				break;
			}
			case 'resize': {
				if (resizePreview) onResizeCommit?.(active.id, resizePreview.w, resizePreview.h);
				break;
			}
			case 'rotate': {
				if (rotatePreview !== null) onRotateCommit?.(active.id, rotatePreview, active.free);
				break;
			}
			case 'marquee': {
				const end = worldPoint(event);
				onMarquee?.(active.startWorld, end, active.additive);
				break;
			}
		}
		interaction = null;
		dragDelta = { x: 0, y: 0 };
		resizePreview = null;
		rotatePreview = null;
		marqueePreview = null;
	}

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
		// Editor interaction (UX-CANVAS-005/003): a single primary pointer on a tile drag-moves it; on
		// empty canvas it marquee-selects. Resize/rotation handles run their own handlers (they
		// stopPropagation before this fires). A second pointer falls through to the pan/pinch model.
		if (interactive && pointers.size === 0 && event.isPrimary && !interaction) {
			const targetEl = event.target as HTMLElement | null;
			if (targetEl?.closest('[data-resize-corner]') || targetEl?.closest('[data-rotate-handle]')) {
				// Handles already began the interaction in their own pointerdown.
			} else {
				const tileEl = targetEl?.closest('[data-tile-id]') as HTMLElement | null;
				targetEl?.setPointerCapture?.(event.pointerId);
				pointers.set(event.pointerId, surfacePoint(event));
				if (tileEl) {
					event.stopPropagation();
					beginTileMove(event, tileEl.getAttribute('data-tile-id')!);
				} else {
					const start = worldPoint(event);
					interaction = { kind: 'marquee', startWorld: start, additive: event.shiftKey };
					marqueePreview = { x: start.x, y: start.y, w: 0, h: 0 };
				}
				return;
			}
		}
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
		// An active editor interaction (move/resize/rotate/marquee) takes priority over pan/pinch.
		if (interaction) {
			updateInteraction(event);
			return;
		}
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
		if (interaction) {
			finishInteraction(event);
			pointers.delete(event.pointerId);
			panning = false;
			return;
		}
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
		// The host's manipulation handler gets first crack (UX-CANVAS-015): undo/redo, select-all,
		// group, delete, and selection-aware arrow-key MOVE (which must win over arrow-key pan when a
		// widget is selected). Only unhandled keys fall through to the viewport pan/zoom model.
		if (onManipulationKey?.(event)) {
			event.preventDefault();
			cancelInertia();
			return;
		}
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

	// UX-CANVAS-007/008: when a binding is missing/conflicted/hidden, the content area shows an explicit
	// placeholder — never a zero/stale value that could read as real data (the hidden no-leak rule).
	function bindingPlaceholder(tile: CanvasTile): string | null {
		const state = tile.binding?.state;
		if (state === 'missing') return 'Binding missing';
		if (state === 'conflicted') return 'Binding conflicted';
		if (state === 'hidden') return 'Hidden in this view';
		return null;
	}

	const transform = $derived(
		`translate(${controller.viewport.tx}px, ${controller.viewport.ty}px) scale(${controller.viewport.scale})`,
	);
	const renderedCount = $derived(visibleTiles.length);

	// Effective tile rect/rotation, accounting for any in-flight drag preview (move/resize/rotate).
	function effectiveRect(tile: CanvasTile): { x: number; y: number; w: number; h: number } {
		let { x, y, w, h } = tile;
		if (interaction?.kind === 'move' && interaction.id === tile.id) {
			x += dragDelta.x;
			y += dragDelta.y;
		}
		if (interaction?.kind === 'resize' && interaction.id === tile.id && resizePreview) {
			w = resizePreview.w;
			h = resizePreview.h;
		}
		return { x, y, w, h };
	}
	function effectiveRotation(tile: CanvasTile): number {
		if (interaction?.kind === 'rotate' && interaction.id === tile.id && rotatePreview !== null) {
			return rotatePreview;
		}
		return tile.rotation ?? 0;
	}
	function tileStyle(tile: CanvasTile): string {
		const r = effectiveRect(tile);
		const rot = effectiveRotation(tile);
		return `transform: translate(${r.x}px, ${r.y}px) rotate(${rot}deg); width: ${r.w}px; height: ${r.h}px; z-index: ${tile.z ?? 0};`;
	}
	function isSelected(tile: CanvasTile): boolean {
		return interactive && (selectedIds?.has(tile.id) ?? false);
	}
	function isPrimary(tile: CanvasTile): boolean {
		return interactive && primaryId === tile.id;
	}
	const RESIZE_CORNERS: ReadonlyArray<{ corner: Corner; label: string; cls: string }> = [
		{ corner: 'nw', label: 'top-left', cls: 'nw' },
		{ corner: 'ne', label: 'top-right', cls: 'ne' },
		{ corner: 'sw', label: 'bottom-left', cls: 'sw' },
		{ corner: 'se', label: 'bottom-right', cls: 'se' },
	];
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
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="canvas-tile"
					class:is-skeleton={tilePending(tile)}
					class:is-selected={isSelected(tile)}
					class:is-collapsed={tile.collapsed}
					class:is-dragging={interaction !== null && 'id' in interaction && interaction.id === tile.id}
					data-testid={`canvas-tile-${tile.id}`}
					data-tile-id={interactive ? tile.id : undefined}
					data-selected={isSelected(tile)}
					data-collapsed={tile.collapsed ? 'true' : undefined}
					data-visibility={tile.visibility}
					style={tileStyle(tile)}
				>
					{#if isSelected(tile)}
						<span class="canvas-tile-ring" aria-hidden="true"></span>
					{/if}
					{#if isPrimary(tile)}
						<!-- Pointer resize handles (UX-CANVAS-003) — the gesture path; the keyboard/numeric
						     alternative is the transform panel + selection toolbar (non-aria-hidden). -->
						{#each RESIZE_CORNERS as h (h.corner)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span
								class={`canvas-resize-handle ${h.cls}`}
								data-resize-corner={h.corner}
								data-testid={`canvas-resize-${h.corner}-${tile.id}`}
								title={`Resize ${h.label}`}
								onpointerdown={(e) => beginResize(e, tile.id, h.corner)}
								onpointermove={updateInteraction}
								onpointerup={finishInteraction}
							></span>
						{/each}
						<!-- Rotation handle (UX-CANVAS-004) — gesture path; keyboard/numeric is the panel. -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<span
							class="canvas-rotate-handle"
							data-rotate-handle
							data-testid={`canvas-rotate-${tile.id}`}
							title="Rotate"
							onpointerdown={(e) => beginRotate(e, tile.id)}
							onpointermove={updateInteraction}
							onpointerup={finishInteraction}
						></span>
					{/if}
					<div class="canvas-tile-head">
						<span class="canvas-tile-type">{tile.type}</span>
						<span class="canvas-tile-chrome">
							{#if tile.visibility === 'dm-only'}
								<span class="canvas-tile-badge" data-testid={`canvas-tile-dm-${tile.id}`}>
									<span class="canvas-tile-badge-stripe" aria-hidden="true"></span>DM Only
								</span>
							{:else}
								<span
									class="canvas-tile-badge is-player"
									data-badge-visibility={tile.visibility}
									data-testid={`tile-players-${tile.id}`}
								>
									<span class="canvas-tile-eye" aria-hidden="true"></span>
									{tile.visibility === 'shared' ? 'Shared' : 'Players'}
								</span>
							{/if}
							{#if interactive}
								<!-- Collapse chevron + `⋯` actions: pointer affordances in the aria-hidden world; the
								     keyboard / screen-reader path is the chrome panel + the C / F2 shortcuts. -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<span
									class="canvas-tile-control"
									data-canvas-no-pan
									data-testid={`tile-collapse-${tile.id}`}
									title={tile.collapsed ? 'Expand widget' : 'Collapse widget'}
									onpointerdown={(e) => {
										e.stopPropagation();
										onToggleCollapse?.(tile.id);
									}}
								>{tile.collapsed ? '▸' : '▾'}</span>
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<span
									class="canvas-tile-control"
									data-canvas-no-pan
									data-testid={`tile-actions-${tile.id}`}
									title="Widget actions"
									onpointerdown={(e) => {
										e.stopPropagation();
										onOpenActions?.(tile.id);
									}}
								>⋯</span>
							{/if}
						</span>
					</div>
					{#if !tile.collapsed}
						{#if tilePending(tile)}
							<div class="canvas-tile-skeleton" data-testid={`canvas-skeleton-${tile.id}`}>
								<span class="skeleton-line"></span>
								<span class="skeleton-line short"></span>
							</div>
						{:else if bindingPlaceholder(tile)}
							<div class="canvas-tile-binding-missing" data-testid={`tile-binding-placeholder-${tile.id}`}>
								<p class="canvas-tile-placeholder">{bindingPlaceholder(tile)}</p>
								{#if interactive && tile.binding && (tile.binding.state === 'missing' || tile.binding.state === 'conflicted')}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<span
										class="canvas-tile-rebind"
										data-canvas-no-pan
										data-testid={`tile-rebind-${tile.id}`}
										title="Rebind this widget to a data source"
										onpointerdown={(e) => {
											e.stopPropagation();
											onRebind?.(tile.id);
										}}
									>Rebind</span>
								{/if}
							</div>
						{:else if tilePlaceholder(tile)}
							<p class="canvas-tile-placeholder">{tilePlaceholder(tile)}</p>
						{:else}
							<p class="canvas-tile-title">{tile.title}</p>
						{/if}
					{/if}
					{#if tile.binding && tile.binding.state !== 'none'}
						<!-- Link/binding indicator (UX-CANVAS-007 §Link indicator). The chain-link is a redundant,
						     non-colour-only signal: a data attribute + glyph + title accompany the colour. -->
						<span
							class="canvas-tile-link"
							data-binding-state={tile.binding.state}
							data-testid={`tile-binding-link-${tile.id}`}
							title={tile.binding.ariaLabel}
							aria-hidden="true"
						>🔗</span>
						{#if showBindings}
							<span class="canvas-tile-binding-chip" data-testid={`tile-binding-chip-${tile.id}`}>
								{tile.binding.label}
							</span>
						{/if}
					{/if}
				</div>
			{/each}

			{#if interactive && marqueePreview}
				<span
					class="canvas-marquee"
					aria-hidden="true"
					data-testid="canvas-marquee"
					style={`transform: translate(${marqueePreview.x}px, ${marqueePreview.y}px); width: ${marqueePreview.w}px; height: ${marqueePreview.h}px;`}
				></span>
			{/if}
		</div>

		{#if emptyState && tiles.length === 0}
			<!-- UX-CANVAS-013: the atmospheric teaching state, rendered over the canvas only while empty.
			     It disappears the moment the first tile exists (this block stops rendering). -->
			<div class="canvas-empty" data-testid="canvas-empty-state">
				{@render emptyState()}
			</div>
		{/if}

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
	.canvas-tile-badge.is-player {
		background: var(--color-status-success-subtle);
		border-color: var(--color-status-success);
		color: var(--color-text-primary);
	}
	.canvas-tile-eye {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		border: 2px solid var(--color-status-success);
	}
	.canvas-tile-badge.is-player[data-badge-visibility='shared'] {
		border-color: var(--color-status-info);
	}
	.canvas-tile-badge.is-player[data-badge-visibility='shared'] .canvas-tile-eye {
		border-style: dashed;
		border-color: var(--color-status-info);
	}

	.canvas-tile-chrome {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	/* Pointer-only chrome controls (collapse / actions / rebind). Muted until the tile is hovered or
	   selected (UX-CANVAS-007 §Chrome opacity); the keyboard path lives in the chrome panel. */
	.canvas-tile-control,
	.canvas-tile-rebind {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		min-height: 20px;
		padding: 0 var(--space-0-5);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		cursor: pointer;
	}
	.canvas-tile-rebind {
		min-width: auto;
		padding: 0 var(--space-1);
		font-size: var(--text-2xs);
		color: var(--color-status-warning-text);
		margin-top: var(--space-1);
	}
	.canvas-tile-binding-missing {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-0-5);
	}
	.canvas-tile-link {
		position: absolute;
		left: var(--space-1);
		bottom: var(--space-1);
		font-size: var(--text-2xs);
		filter: grayscale(1);
		opacity: 0.7;
	}
	.canvas-tile-link[data-binding-state='active'] {
		filter: none;
		opacity: 1;
	}
	.canvas-tile-link[data-binding-state='missing'],
	.canvas-tile-link[data-binding-state='conflicted'] {
		filter: none;
		opacity: 1;
		color: var(--color-status-warning-text);
	}
	.canvas-tile-binding-chip {
		position: absolute;
		right: var(--space-1);
		bottom: var(--space-1);
		max-width: 70%;
		padding: 0 var(--space-1);
		font-size: var(--text-2xs);
		color: var(--color-text-secondary);
		background: var(--color-surface-overlay);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* Chrome recedes when the widget is inactive, becomes full-opacity on hover/selection
	   (UX-CANVAS-007 §Chrome opacity; FigJam-style muted-until-active). */
	.canvas-tile:not(:hover):not(.is-selected) .canvas-tile-control {
		opacity: 0.4;
	}

	.canvas-empty {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		z-index: 1;
	}
	.canvas-empty :global(*) {
		pointer-events: auto;
	}

	/* Editor selection chrome (UX-CANVAS-005). The ring is a high-contrast outline (WCAG 1.4.11) plus a
	   data attribute so selection is conveyed by more than colour alone. */
	.canvas-tile.is-selected {
		border-color: var(--color-accent);
	}
	.canvas-tile-ring {
		position: absolute;
		inset: -3px;
		border: 2px solid var(--color-accent);
		border-radius: var(--radius-sm);
		pointer-events: none;
	}
	.canvas-tile.is-dragging {
		opacity: 0.85;
	}
	/* Collapsed: only the title bar chrome remains (UX-CANVAS-007 §Collapse toggle). */
	.canvas-tile.is-collapsed {
		height: auto !important;
		min-height: 0;
	}
	.canvas-tile[data-tile-id] {
		cursor: grab;
	}

	/* Pointer resize handles (UX-CANVAS-003): 12px visible target inside a 44px hit area via padding. */
	.canvas-resize-handle {
		position: absolute;
		width: 14px;
		height: 14px;
		background: var(--color-surface-raised);
		border: 2px solid var(--color-accent);
		border-radius: 50%;
		z-index: 2;
		touch-action: none;
	}
	.canvas-resize-handle.nw {
		top: -7px;
		left: -7px;
		cursor: nwse-resize;
	}
	.canvas-resize-handle.ne {
		top: -7px;
		right: -7px;
		cursor: nesw-resize;
	}
	.canvas-resize-handle.sw {
		bottom: -7px;
		left: -7px;
		cursor: nesw-resize;
	}
	.canvas-resize-handle.se {
		bottom: -7px;
		right: -7px;
		cursor: nwse-resize;
	}
	.canvas-rotate-handle {
		position: absolute;
		top: -28px;
		left: 50%;
		width: 14px;
		height: 14px;
		margin-left: -7px;
		background: var(--color-accent);
		border: 2px solid var(--color-surface-raised);
		border-radius: 50%;
		z-index: 2;
		cursor: grab;
		touch-action: none;
	}

	.canvas-marquee {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
		border: 1px dashed var(--color-accent);
		background: var(--color-interactive-selected);
		opacity: 0.4;
		pointer-events: none;
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
