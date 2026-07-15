/**
 * MAP-021 — the map editor's central state hook.
 *
 * This is the single contract every editor panel binds to. It owns:
 *   - the actor-filtered, player-safe read path (view + layers, exactly as the old builder read them —
 *     reads NEVER bypass `getMapViewForActor` / `queryMapLayers`, so a rebuilt editor cannot leak a
 *     dm-only artifact to a player);
 *   - the write path: one re-entrancy-guarded `run()` that dispatches a command, and on acceptance
 *     pushes the command's INVERSE onto a local undo stack (via core's pure `buildMapInverse`);
 *   - undo/redo over that stack — LOCAL and NON-DURABLE by design: undo history must never sync (a
 *     co-DM undoing your brush stroke from across the table is not a feature) and must never enter the
 *     op log;
 *   - the editor UI state the panels share: active tool, active layer, multi-selection, viewport,
 *     per-tool options, and which dock panel is open.
 *
 * App-side id minting (`nextId`) is deliberate: every `create-*` command is given an explicit id so
 * that (a) its inverse can target it and (b) an undo→redo cycle reuses the same id instead of minting a
 * fresh one each time. Entropy is drawn from the runtime/platform seam (`runtime.newId()`), not from
 * `crypto` directly — this hook is GUI code and must respect the PLAT-006 boundary; the ids are app glue
 * (undo/redo targeting), never part of the deterministic core's replayable output.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { CoreCommand, MapLayerCategory, SceneVisibility } from '@dndtools/core';
import {
	buildMapInverse,
	deliveredMapIdsForActor,
	getMapViewForActor,
	queryMapLayers,
} from '@dndtools/core';
import { useRuntime } from '../../runtime/RuntimeContext';
import type { ToolId } from './tools';
import { GROUP_OF_TOOL } from './tools';

export type FogMode = 'reveal' | 'conceal';
export type FogShape = 'rect' | 'polygon' | 'stroke';
export type DockPanel = 'inspector' | 'layers' | 'assets' | 'history';

/** One entry on the undo or redo stack: the command that reverses a step, plus its human label. */
export interface HistoryEntry {
	/** The inverse command to dispatch to undo this step. */
	inverse: CoreCommand;
	/** The forward command, kept so redo can re-apply and re-derive a fresh inverse. */
	forward: CoreCommand;
	/** Human label for the History panel ("Painted 12 features", "Generated cave"). */
	label: string;
}

/** Per-tool options, remembered per tool (users expect brush size to persist per tool, not globally). */
export interface ToolOptions {
	// Terrain / paint
	terrainStyle: string;
	brushSize: number; // normalized-ish 5..200, converted to a radius at dispatch
	// Fog
	fogMode: FogMode;
	fogShape: FogShape;
	fogFeather: number; // 0..0.2
	// Structure
	doorKind: 'door' | 'secret' | 'archway' | 'portcullis';
	waterKind: 'river' | 'lake';
	// Light
	lightColor: string;
	lightRadius: number;
	// Object
	stampAsset: string;
	scatterObject: string;
	scatterDensity: number;
	// Snapping (Ctrl momentarily overrides — handled in the canvas)
	snapGrid: boolean;
	snapAngle: boolean;
	snapObject: boolean;
	// Placement default visibility for new POIs/tokens/etc.
	newVisibility: SceneVisibility;
}

const DEFAULT_TOOL_OPTIONS: ToolOptions = {
	terrainStyle: 'terrain:grass',
	brushSize: 24,
	fogMode: 'reveal',
	fogShape: 'rect',
	fogFeather: 0,
	doorKind: 'door',
	waterKind: 'river',
	lightColor: '#ffd6aa',
	lightRadius: 0.08,
	stampAsset: 'prop:crate',
	scatterObject: 'trees',
	scatterDensity: 0.5,
	snapGrid: true,
	snapAngle: false,
	snapObject: true,
	newVisibility: 'dm-only',
};

/** A cap so a runaway session cannot grow the undo stack without bound. 200 is generous for a scene. */
const MAX_HISTORY = 200;

export interface MapEditorApi {
	// Identity / role
	actorId: string;
	isDm: boolean;
	mapId: string;

	// Player-safe reads (never bypass these)
	view: ReturnType<typeof getMapViewForActor> extends infer R ? R : never;
	/** The actor-filtered view when available, else null. */
	map: NonNullable<ReturnType<typeof mapViewOrNull>>;
	layers: ReturnType<typeof queryMapLayers>['layers'];

	// Tool + layer state
	tool: ToolId;
	setTool: (tool: ToolId) => void;
	activeLayerId: string | null;
	setActiveLayerId: (id: string | null) => void;

	// Selection (multi)
	selection: readonly string[];
	setSelection: (ids: readonly string[]) => void;
	toggleSelection: (id: string, additive: boolean) => void;
	clearSelection: () => void;

	// Viewport
	zoom: number;
	setZoom: (z: number) => void;
	center: { x: number; y: number };
	setCenter: (c: { x: number; y: number }) => void;

	// Per-tool options
	options: ToolOptions;
	setOption: <K extends keyof ToolOptions>(key: K, value: ToolOptions[K]) => void;

	// Dock
	dock: DockPanel;
	setDock: (panel: DockPanel) => void;

	// Write path
	busy: boolean;
	notice: string | null;
	setNotice: (message: string | null) => void;
	/** Dispatch a command; on acceptance, records the inverse on the undo stack. */
	run: (command: CoreCommand, options?: { undoable?: boolean }) => Promise<boolean>;
	/** Mint a stable, app-side id for a create command (so undo/redo can target it). */
	nextId: (prefix?: string) => string;

	// Undo / redo
	history: readonly HistoryEntry[];
	redoStack: readonly HistoryEntry[];
	canUndo: boolean;
	canRedo: boolean;
	undo: () => Promise<void>;
	redo: () => Promise<void>;
}

function mapViewOrNull(result: ReturnType<typeof getMapViewForActor>) {
	return result.kind === 'available' ? result : null;
}

export function useMapEditor(mapId: string, initialTool: ToolId = 'select'): MapEditorApi {
	const runtime = useRuntime();
	const actorId = runtime.defaultActorId;
	const isDm = runtime.state.permissions.actors[actorId]?.role === 'dm';

	const [tool, setToolState] = useState<ToolId>(initialTool);
	const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
	const [selection, setSelection] = useState<readonly string[]>([]);
	const [zoom, setZoom] = useState(1);
	const [center, setCenter] = useState({ x: 0.5, y: 0.5 });
	const [options, setOptions] = useState<ToolOptions>(DEFAULT_TOOL_OPTIONS);
	const [dock, setDock] = useState<DockPanel>('layers');
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
	const [redoStack, setRedoStack] = useState<readonly HistoryEntry[]>([]);

	const busyRef = useRef(false);
	const idCounter = useRef(0);

	// ── Player-safe reads (identical path to the old builder) ──────────────────────────────────
	const delivered = useMemo(
		() => deliveredMapIdsForActor(runtime.state.session, actorId),
		[runtime.state.session, actorId],
	);
	const viewResult = useMemo(
		() =>
			getMapViewForActor(runtime.state.maps, runtime.state.permissions, actorId, mapId, {
				deliveredMapIds: delivered,
			}),
		[runtime.state.maps, runtime.state.permissions, actorId, mapId, delivered],
	);
	const map = mapViewOrNull(viewResult);
	const layerResult = useMemo(
		() => queryMapLayers(runtime.state.maps, runtime.state.permissions, actorId, { mapId }),
		[runtime.state.maps, runtime.state.permissions, actorId, mapId],
	);
	const layers = layerResult.layers;

	const setTool = useCallback(
		(next: ToolId) => {
			setToolState(next);
			// Selecting a tool scopes the active layer to its group's category, the way Foundry scopes the
			// active canvas layer when you pick a control — so newly authored content lands where the user
			// is looking, not on whatever layer happened to be active. Only nudges; never fights an explicit
			// user layer choice within the same category.
			const group = GROUP_OF_TOOL.get(next);
			if (!group) return;
			setActiveLayerId((current) => {
				const stillValid = current && layers.some((l) => l.layerId === current);
				if (stillValid) {
					const cat = layers.find((l) => l.layerId === current)?.category;
					if (cat === group.category) return current;
				}
				const inCategory = layers.find((l) => l.category === group.category);
				return inCategory?.layerId ?? current ?? layers[0]?.layerId ?? null;
			});
		},
		[layers],
	);

	const setOption = useCallback(<K extends keyof ToolOptions>(key: K, value: ToolOptions[K]) => {
		setOptions((prev) => ({ ...prev, [key]: value }));
	}, []);

	const toggleSelection = useCallback((id: string, additive: boolean) => {
		setSelection((prev) => {
			if (!additive) return prev.length === 1 && prev[0] === id ? prev : [id];
			return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
		});
	}, []);
	const clearSelection = useCallback(() => setSelection([]), []);

	const nextId = useCallback(
		(prefix = 'ed') => {
			idCounter.current += 1;
			// Route id entropy through the runtime/platform seam (PLAT-006) rather than touching
			// `crypto` directly from this GUI hook.
			const rand = runtime.newId().replace(/-/g, '').slice(0, 8);
			return `${prefix}-${rand}-${idCounter.current}`;
		},
		[runtime],
	);

	// ── Write path ──────────────────────────────────────────────────────────────────────────────
	const run = useCallback(
		async (command: CoreCommand, opts?: { undoable?: boolean }): Promise<boolean> => {
			if (busyRef.current) return false; // one command in flight at a time — matches the old builder
			busyRef.current = true;
			setBusy(true);
			// Capture the state BEFORE dispatch so the inverse builder reads the pre-command values.
			const stateBefore = runtime.state;
			try {
				const result = await runtime.dispatch(command);
				if (result.status === 'accepted') {
					setNotice(null);
					if (opts?.undoable !== false) {
						const inverse = buildMapInverse(command, stateBefore);
						if (inverse) {
							setHistory((prev) =>
								[
									...prev,
									{ inverse: inverse.command, forward: command, label: inverse.label },
								].slice(-MAX_HISTORY),
							);
							// Any new user action invalidates the redo branch.
							setRedoStack([]);
						}
					}
					return true;
				}
				setNotice(result.rejection.message);
				return false;
			} catch (error) {
				setNotice(error instanceof Error ? error.message : 'The action could not be completed.');
				return false;
			} finally {
				busyRef.current = false;
				setBusy(false);
			}
		},
		[runtime],
	);

	const undo = useCallback(async () => {
		if (busyRef.current) return;
		const entry = history[history.length - 1];
		if (!entry) return;
		busyRef.current = true;
		setBusy(true);
		try {
			const result = await runtime.dispatch(entry.inverse);
			if (result.status === 'accepted') {
				setHistory((prev) => prev.slice(0, -1));
				setRedoStack((prev) => [...prev, entry]);
			} else {
				setNotice(result.rejection.message);
			}
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	}, [history, runtime]);

	const redo = useCallback(async () => {
		if (busyRef.current) return;
		const entry = redoStack[redoStack.length - 1];
		if (!entry) return;
		busyRef.current = true;
		setBusy(true);
		const stateBefore = runtime.state;
		try {
			const result = await runtime.dispatch(entry.forward);
			if (result.status === 'accepted') {
				// Re-derive the inverse against the current state (revisions have moved on since the
				// original forward ran), so a subsequent undo is exact.
				const inverse = buildMapInverse(entry.forward, stateBefore);
				setRedoStack((prev) => prev.slice(0, -1));
				setHistory((prev) =>
					[
						...prev,
						{
							inverse: inverse?.command ?? entry.inverse,
							forward: entry.forward,
							label: entry.label,
						},
					].slice(-MAX_HISTORY),
				);
			} else {
				setNotice(result.rejection.message);
			}
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	}, [redoStack, runtime]);

	return {
		actorId,
		isDm,
		mapId,
		view: viewResult,
		map: map as NonNullable<ReturnType<typeof mapViewOrNull>>,
		layers,
		tool,
		setTool,
		activeLayerId,
		setActiveLayerId,
		selection,
		setSelection,
		toggleSelection,
		clearSelection,
		zoom,
		setZoom,
		center,
		setCenter,
		options,
		setOption,
		dock,
		setDock,
		busy,
		notice,
		setNotice,
		run,
		nextId,
		history,
		redoStack,
		canUndo: history.length > 0,
		canRedo: redoStack.length > 0,
		undo,
		redo,
	};
}

/** The category a tool authors into — re-exported for panels that need it without importing tools.ts. */
export function categoryForTool(tool: ToolId): MapLayerCategory {
	return GROUP_OF_TOOL.get(tool)?.category ?? 'base';
}
