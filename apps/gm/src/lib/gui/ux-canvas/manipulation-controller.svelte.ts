/**
 * Canvas manipulation controller (UX-CANVAS-002/003/004/005/006/009/012/015). The reactive shell that
 * owns the editor-side canvas state — current selection, grid/snap settings, the undo/redo history — and
 * turns every manipulation intent (place, select, move, resize, rotate, align, distribute, z-order,
 * delete, undo, redo) into the SAME processing-core command a pointer drag would dispatch, recording a
 * reversible {@link UndoEntry} for each. It holds no shadow copy of the scene: it reads the current
 * (viewer-filtered) widget list through an injected accessor and dispatches through an injected sink, so
 * the processing core stays the single source of truth and the controller is unit-testable with fakes.
 *
 * NO-LEAK (actor safety): the controller only ever sees the widget list the host passes in, which on the
 * scene route is the viewer-FILTERED set. A DM-only widget is therefore never selectable, never a
 * marquee/select-all target, never moved/aligned, and never named in an announcement for a player.
 *
 * Pure geometry/history live in the sibling modules (`selection`, `transform`, `alignment`, `z-order`,
 * `undo-stack`); this class only wires them to `$state` + dispatch + the live announcer.
 */

import { SvelteSet, SvelteMap } from 'svelte/reactivity';
import type { SceneVisibility, WidgetBinding } from '@dndtools/core';
import type { Bounds } from '$lib/canvas-runtime/viewport';
import { visibilityToggle, type WidgetBindingState } from './widget-chrome';
import { boundAnnouncement, UNBOUND_ANNOUNCEMENT } from './binding-inspector';
import {
	applyBatchSelection,
	applySelection,
	marqueeHits,
	marqueeRect,
	selectAllIds,
	selectionAnnouncement,
	selectionBounds,
	type SelectionMode,
} from './selection';
import {
	MOVE_STEP,
	MOVE_STEP_LARGE,
	MOVE_STEP_NUDGE,
	RESIZE_STEP,
	RESIZE_STEP_LARGE,
	clampSize,
	snapRotation,
} from './transform';
import {
	alignAnnouncement,
	alignWidgets,
	distributeAnnouncement,
	distributeWidgets,
	snapToGrid,
	type AlignEdge,
	type DistributeAxis,
	type PositionChange,
	DEFAULT_GRID,
} from './alignment';
import { resolveZOrder, zOrderAnnouncement, type ZOrderOp } from './z-order';
import { UndoStack, undoneAnnouncement, redoneAnnouncement, type UndoEntry } from './undo-stack';

/** A dispatch-ready layout command (the controller never builds permission/actor envelope itself). */
export interface LayoutCommand {
	type: string;
	payload: Record<string, unknown>;
}

/** The editor-side view of one widget the controller manipulates (already viewer-filtered). */
export interface ManipWidget {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
	z: number;
	type: string;
	label: string;
	rotation: number;
	configuration: Record<string, unknown>;
	/** Declared player-visibility (UX-CANVAS-011). */
	visibility: SceneVisibility;
	/** Whether the widget's content is collapsed (UX-CANVAS-007). */
	collapsed: boolean;
	/** Current data binding (UX-CANVAS-008), or null when unbound. */
	binding: WidgetBinding | null;
	/** Per-actor binding-resolution state for the chain-link indicator (UX-CANVAS-007/008). */
	bindingState: WidgetBindingState;
}

export interface ManipulationHost {
	sceneId: string;
	/** Current viewer-filtered widgets, read fresh on every operation (no shadow state). */
	widgets: () => ManipWidget[];
	/** Dispatch a batch of layout commands; resolves true when ALL were accepted. */
	dispatch: (commands: LayoutCommand[]) => Promise<boolean>;
	/** Polite live-region announcement (already visibility-safe text). */
	announce?: (message: string) => void;
}

export class CanvasManipulationController {
	readonly #host: ManipulationHost;
	readonly #stack = new UndoStack<LayoutCommand>();

	// --- Selection (UX-CANVAS-005) -----------------------------------------------------------------
	readonly #selected = new SvelteSet<string>();

	// --- Grid / snap settings (UX-CANVAS-009) ------------------------------------------------------
	gridEnabled = $state(false);
	gridSize = $state(DEFAULT_GRID);
	snapEnabled = $state(true);

	// --- Undo mirror state (so getters stay reactive) ----------------------------------------------
	#canUndo = $state(false);
	#canRedo = $state(false);
	#undoLabel = $state<string | null>(null);
	#redoLabel = $state<string | null>(null);
	#limitReached = $state(false);
	#depth = $state(0);

	constructor(host: ManipulationHost) {
		this.#host = host;
	}

	// --- Selection accessors -----------------------------------------------------------------------
	get selectedIds(): ReadonlySet<string> {
		return this.#selected;
	}
	get selectionCount(): number {
		return this.#selected.size;
	}
	isSelected(id: string): boolean {
		return this.#selected.has(id);
	}
	get primaryId(): string | null {
		// The most-recently-added selected id (last in iteration order).
		let last: string | null = null;
		for (const id of this.#selected) last = id;
		return last;
	}
	get selectionBounds(): Bounds | null {
		return selectionBounds(this.#host.widgets(), this.#selected);
	}

	// --- Undo accessors ----------------------------------------------------------------------------
	get canUndo(): boolean {
		return this.#canUndo;
	}
	get canRedo(): boolean {
		return this.#canRedo;
	}
	get undoLabel(): string | null {
		return this.#undoLabel;
	}
	get redoLabel(): string | null {
		return this.#redoLabel;
	}
	get undoLimitReached(): boolean {
		return this.#limitReached;
	}
	get historyDepth(): number {
		return this.#depth;
	}

	#announce(message: string): void {
		this.#host.announce?.(message);
	}

	#widget(id: string): ManipWidget | undefined {
		return this.#host.widgets().find((w) => w.id === id);
	}

	#syncHistory(): void {
		this.#canUndo = this.#stack.canUndo;
		this.#canRedo = this.#stack.canRedo;
		this.#undoLabel = this.#stack.nextUndoLabel;
		this.#redoLabel = this.#stack.nextRedoLabel;
		this.#limitReached = this.#stack.limitReached;
		this.#depth = this.#stack.depth;
	}

	/** Drop any selected id that is no longer present (e.g. removed by a destroy or actor switch). */
	reconcile(): void {
		const live = new SvelteSet(this.#host.widgets().map((w) => w.id));
		for (const id of [...this.#selected]) if (!live.has(id)) this.#selected.delete(id);
	}

	// --- Selection operations (UX-CANVAS-005) ------------------------------------------------------
	select(id: string, mode: SelectionMode = 'replace'): void {
		const next = applySelection(this.#selected, id, mode);
		this.#replaceSelection(next);
	}

	selectAll(): void {
		const ids = selectAllIds(this.#host.widgets());
		this.#replaceSelection(new SvelteSet(ids));
	}

	clearSelection(): void {
		if (this.#selected.size === 0) return;
		this.#replaceSelection(new SvelteSet());
	}

	/** Resolve a marquee rectangle (world space) to a selection (UX-CANVAS-005 fully-enclosed rule). */
	marquee(start: { x: number; y: number }, end: { x: number; y: number }, additive: boolean): void {
		const rect = marqueeRect(start, end);
		const hits = marqueeHits(this.#host.widgets(), rect);
		const next = applyBatchSelection(additive ? this.#selected : new SvelteSet(), hits, additive ? 'add' : 'replace');
		this.#replaceSelection(next);
	}

	#replaceSelection(next: ReadonlySet<string>): void {
		const before = this.#selected.size;
		this.#selected.clear();
		for (const id of next) this.#selected.add(id);
		if (this.#selected.size !== before || next.size === 0) {
			this.#announce(selectionAnnouncement(this.#selected.size));
		}
	}

	// --- Move (UX-CANVAS-003) ----------------------------------------------------------------------
	/** Move a widget to an absolute world position, recording an inverse-move undo entry. */
	async moveTo(id: string, x: number, y: number): Promise<boolean> {
		const w = this.#widget(id);
		if (!w) return false;
		let nx = x;
		let ny = y;
		if (this.gridEnabled && this.snapEnabled) {
			nx = snapToGrid(nx, this.gridSize);
			ny = snapToGrid(ny, this.gridSize);
		}
		if (nx === w.x && ny === w.y) return false;
		const ok = await this.#commit(
			{
				label: `Move widget ${w.label}`,
				redo: [this.#moveCmd(id, nx, ny)],
				undo: [this.#moveCmd(id, w.x, w.y)],
			},
		);
		if (ok) this.#announce(`${w.label} moved to ${Math.round(nx)}, ${Math.round(ny)}.`);
		return ok;
	}

	/** Keyboard nudge: move the primary selection by a step in a direction. */
	async nudge(direction: 'left' | 'right' | 'up' | 'down', size: 'fine' | 'nudge' | 'large'): Promise<boolean> {
		const id = this.primaryId;
		if (!id) return false;
		const w = this.#widget(id);
		if (!w) return false;
		const step = size === 'fine' ? MOVE_STEP : size === 'nudge' ? MOVE_STEP_NUDGE : MOVE_STEP_LARGE;
		const dx = direction === 'left' ? -step : direction === 'right' ? step : 0;
		const dy = direction === 'up' ? -step : direction === 'down' ? step : 0;
		return this.moveTo(id, Math.max(0, w.x + dx), Math.max(0, w.y + dy));
	}

	// --- Resize (UX-CANVAS-003) --------------------------------------------------------------------
	async resizeTo(id: string, w: number, h: number): Promise<boolean> {
		const widget = this.#widget(id);
		if (!widget) return false;
		const size = clampSize({ w, h });
		if (size.w === widget.w && size.h === widget.h) return false;
		const ok = await this.#commit({
			label: `Resize widget ${widget.label}`,
			redo: [this.#resizeCmd(id, size.w, size.h)],
			undo: [this.#resizeCmd(id, widget.w, widget.h)],
		});
		if (ok) this.#announce(`${widget.label} resized to ${Math.round(size.w)} by ${Math.round(size.h)}.`);
		return ok;
	}

	/** Keyboard resize: grow/shrink the primary selection on one axis by a step. */
	async resizeStep(axis: 'width' | 'height', grow: boolean, large: boolean): Promise<boolean> {
		const id = this.primaryId;
		if (!id) return false;
		const w = this.#widget(id);
		if (!w) return false;
		const step = (large ? RESIZE_STEP_LARGE : RESIZE_STEP) * (grow ? 1 : -1);
		return axis === 'width' ? this.resizeTo(id, w.w + step, w.h) : this.resizeTo(id, w.w, w.h + step);
	}

	// --- Rotation (UX-CANVAS-004) ------------------------------------------------------------------
	/** Set absolute rotation (persisted in `configuration.rotation`); `free` = 1° precision. */
	async rotateTo(id: string, deg: number, free = false): Promise<boolean> {
		const w = this.#widget(id);
		if (!w) return false;
		const angle = snapRotation(deg, free);
		if (angle === w.rotation) return false;
		const ok = await this.#commit({
			label: `Rotate widget ${w.label}`,
			redo: [this.#configCmd(id, { ...w.configuration, rotation: angle })],
			undo: [this.#configCmd(id, { ...w.configuration })],
		});
		if (ok) this.#announce(`${w.label} rotated to ${angle} degrees.`);
		return ok;
	}

	/** Keyboard rotation: ±15° (or ±1° when `free`). */
	async rotateBy(id: string, delta: number, free = false): Promise<boolean> {
		const w = this.#widget(id);
		if (!w) return false;
		return this.rotateTo(id, w.rotation + delta, free);
	}

	async resetRotation(id: string): Promise<boolean> {
		return this.rotateTo(id, 0);
	}

	// --- Z-order (UX-CANVAS-006) -------------------------------------------------------------------
	async zOrder(op: ZOrderOp, id: string = this.primaryId ?? ''): Promise<boolean> {
		const w = this.#widget(id);
		if (!w) return false;
		const zList = this.#host.widgets().map((x) => ({ id: x.id, z: x.z }));
		const next = resolveZOrder(zList, id, op);
		if (next === null) return false;
		const ok = await this.#commit({
			label: `Reorder widget ${w.label}`,
			redo: [this.#layerCmd(id, next)],
			undo: [this.#layerCmd(id, w.z)],
		});
		if (ok) this.#announce(zOrderAnnouncement(w.label, op));
		return ok;
	}

	// --- Align / distribute (UX-CANVAS-009) --------------------------------------------------------
	async align(edge: AlignEdge): Promise<boolean> {
		const widgets = this.#host.widgets();
		const changes = alignWidgets(widgets, this.#selected, edge);
		const ok = await this.#applyPositionChanges(changes, widgets);
		if (ok) this.#announce(alignAnnouncement(changes.length, edge));
		return ok;
	}

	async distribute(axis: DistributeAxis): Promise<boolean> {
		const widgets = this.#host.widgets();
		const changes = distributeWidgets(widgets, this.#selected, axis);
		const ok = await this.#applyPositionChanges(changes, widgets);
		if (ok) this.#announce(distributeAnnouncement(changes.length, axis));
		return ok;
	}

	async #applyPositionChanges(changes: PositionChange[], widgets: ManipWidget[]): Promise<boolean> {
		if (changes.length === 0) return false;
		const byId = new SvelteMap(widgets.map((w) => [w.id, w]));
		const redo: LayoutCommand[] = [];
		const undo: LayoutCommand[] = [];
		for (const change of changes) {
			const w = byId.get(change.id);
			if (!w) continue;
			redo.push(this.#moveCmd(change.id, change.x, change.y));
			undo.push(this.#moveCmd(change.id, w.x, w.y));
		}
		return this.#commit({ label: `Align ${changes.length} widgets`, redo, undo });
	}

	// --- Visibility (UX-CANVAS-011) ----------------------------------------------------------------
	/** Set a widget's player visibility, preserving the rest of its configuration. Undoable. */
	async setVisibility(id: string, next: SceneVisibility): Promise<boolean> {
		const w = this.#widget(id);
		if (!w) return false;
		if (w.visibility === next) return false;
		const prev = w.configuration.visibility;
		const ok = await this.#commit({
			label: `Change visibility of ${w.label}`,
			redo: [this.#configCmd(id, { ...w.configuration, visibility: next })],
			undo: [this.#configCmd(id, { ...w.configuration, visibility: prev })],
		});
		if (ok) this.#announce(visibilityToggle(w.visibility).announce(w.label));
		return ok;
	}

	/** Toggle a `dm-only` widget to `player-visible` and back (the ≤2-interaction path). Undoable. */
	async toggleVisibility(id: string): Promise<boolean> {
		const w = this.#widget(id);
		if (!w) return false;
		return this.setVisibility(id, visibilityToggle(w.visibility).next);
	}

	// --- Collapse (UX-CANVAS-007) ------------------------------------------------------------------
	/** Collapse/expand a widget's content, persisting the flag in configuration. Undoable. */
	async toggleCollapse(id: string): Promise<boolean> {
		const w = this.#widget(id);
		if (!w) return false;
		const next = !w.collapsed;
		const ok = await this.#commit({
			label: `${next ? 'Collapse' : 'Expand'} ${w.label}`,
			redo: [this.#configCmd(id, { ...w.configuration, collapsed: next })],
			undo: [this.#configCmd(id, { ...w.configuration, collapsed: w.collapsed })],
		});
		if (ok) this.#announce(`${w.label} ${next ? 'collapsed' : 'expanded'}.`);
		return ok;
	}

	// --- Binding (UX-CANVAS-008) -------------------------------------------------------------------
	/** Bind a widget to an entity (replaces any existing binding). Undoable. `entityLabel` is DM-safe. */
	async bind(id: string, binding: WidgetBinding, entityLabel: string): Promise<boolean> {
		const w = this.#widget(id);
		if (!w) return false;
		const ok = await this.#commit({
			label: `Bind ${w.label}`,
			redo: [this.#bindingCmd(id, binding)],
			undo: [this.#bindingCmd(id, w.binding)],
		});
		if (ok) this.#announce(boundAnnouncement(entityLabel));
		return ok;
	}

	/** Remove a widget's binding. Undoable. */
	async unbind(id: string): Promise<boolean> {
		const w = this.#widget(id);
		if (!w || !w.binding) return false;
		const ok = await this.#commit({
			label: `Unbind ${w.label}`,
			redo: [this.#bindingCmd(id, null)],
			undo: [this.#bindingCmd(id, w.binding)],
		});
		if (ok) this.#announce(UNBOUND_ANNOUNCEMENT);
		return ok;
	}

	// --- Delete (UX-CANVAS-015 §Delete) ------------------------------------------------------------
	/**
	 * Destroy a widget. Destroy/restore is a LIFECYCLE op whose inverse (re-create with the same id) is
	 * not expressible through the current processing-core command set, so it is dispatched WITHOUT an
	 * undo entry and the caller announces the removal. (See completion notes: a core
	 * restore-with-identity command is the prerequisite for delete-undo and is out of this UX epic.)
	 */
	async destroy(id: string): Promise<boolean> {
		const w = this.#widget(id);
		if (!w) return false;
		const ok = await this.#host.dispatch([
			{ type: 'scene.destroy-widget', payload: { sceneId: this.#host.sceneId, widgetInstanceId: id } },
		]);
		if (ok) {
			this.#selected.delete(id);
			this.#announce(`${w.label} removed.`);
		}
		return ok;
	}

	// --- History (UX-CANVAS-012) -------------------------------------------------------------------
	async undo(): Promise<boolean> {
		if (!this.#stack.canUndo) {
			this.#announce('Nothing to undo.');
			return false;
		}
		const entry = this.#stack.undo()!;
		this.#syncHistory();
		const ok = await this.#host.dispatch(entry.undo);
		if (ok) this.#announce(undoneAnnouncement(entry.label));
		return ok;
	}

	async redo(): Promise<boolean> {
		if (!this.#stack.canRedo) {
			this.#announce('Nothing to redo.');
			return false;
		}
		const entry = this.#stack.redo()!;
		this.#syncHistory();
		const ok = await this.#host.dispatch(entry.redo);
		if (ok) this.#announce(redoneAnnouncement(entry.label));
		return ok;
	}

	/** Dispatch the redo commands once, and on success record the reversible entry. */
	async #commit(entry: UndoEntry<LayoutCommand>): Promise<boolean> {
		const ok = await this.#host.dispatch(entry.redo);
		if (ok) {
			this.#stack.push(entry);
			this.#syncHistory();
		}
		return ok;
	}

	// --- Command builders --------------------------------------------------------------------------
	#moveCmd(id: string, x: number, y: number): LayoutCommand {
		return { type: 'scene.move-widget', payload: { sceneId: this.#host.sceneId, widgetInstanceId: id, x, y } };
	}
	#resizeCmd(id: string, w: number, h: number): LayoutCommand {
		return { type: 'scene.resize-widget', payload: { sceneId: this.#host.sceneId, widgetInstanceId: id, w, h } };
	}
	#layerCmd(id: string, z: number): LayoutCommand {
		return { type: 'scene.layer-widget', payload: { sceneId: this.#host.sceneId, widgetInstanceId: id, z } };
	}
	#configCmd(id: string, configuration: Record<string, unknown>): LayoutCommand {
		return { type: 'scene.configure-widget', payload: { sceneId: this.#host.sceneId, widgetInstanceId: id, configuration } };
	}
	#bindingCmd(id: string, binding: WidgetBinding | null): LayoutCommand {
		return { type: 'scene.configure-widget', payload: { sceneId: this.#host.sceneId, widgetInstanceId: id, binding } };
	}
}
