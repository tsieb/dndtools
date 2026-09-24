/** Shared editor API, tool defaults and local undo entry types. */

import type {
	CoreCommand,
	SceneVisibility,
	SessionPartyLocation,
	TravelPace,
	TravelPaceKey,
} from '@dndtools/core';
import { DEFAULT_TRAVEL_PACE, getMapViewForActor, queryMapLayers } from '@dndtools/core';
import type { MessageKey, MessageValues } from '../../i18n';
import type { ToolId } from './tools';

export type FogMode = 'reveal' | 'conceal';

export type FogShape = 'rect' | 'polygon' | 'stroke';

export type DockPanel = 'inspector' | 'layers' | 'assets' | 'graph' | 'history';

/** Skin the editor's notice banner wears. `warning` is the default because every notice the hook
 *  itself writes is a rejection or a thrown error. */
export type MapNoticeTone = 'warning' | 'info' | 'success';

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
	/** RC-MAP-3.1 — placement options for the next stamp: whole degrees, and a multiplier applied on
	 *  top of the catalogue entry's own `defaultScale`. Both land in the feature's `props`. */
	stampRotation: number;
	stampScale: number;
	scatterObject: string;
	scatterDensity: number;
	/**
	 * Text for the Label tool. This used to be smuggled through `stampAsset` behind a `text:`
	 * prefix, so typing a label overwrote the Stamp tool's armed asset (and arming an asset wiped
	 * the label). They are separate tools and now own separate option keys.
	 */
	labelText: string;
	// Combat areas of effect (RC-MAP-2.2)
	/** The next template's defining size in TABLE UNITS — a sphere's radius, a cone/line's length,
	 *  a cube's side. Stepped by one cell so it always lands on a rulebook number. */
	templateSize: number;
	/** Which way the next template points, in whole degrees clockwise from north. A sphere ignores it. */
	templateRotation: number;
	// Route (RC-MAP-3.7)
	/** The name the next drawn route is created with; empty falls back to `ROUTE_DEFAULT_NAME`. */
	routeName: string;
	/** The pace the status bar's travel readout measures a route at. A read-side lens, never stored. */
	travelPace: TravelPaceKey;
	// Snapping (Ctrl momentarily overrides — handled in the canvas)
	snapGrid: boolean;
	snapAngle: boolean;
	snapObject: boolean;
	// Placement default visibility for new POIs/tokens/etc.
	newVisibility: SceneVisibility;
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
	terrainStyle: 'terrain:grass',
	brushSize: 24,
	fogMode: 'reveal',
	fogShape: 'rect',
	fogFeather: 0,
	doorKind: 'door',
	waterKind: 'river',
	// Authored light pigment for the native color input and durable map features, not UI chrome.
	// eslint-disable-next-line dsn/no-raw-style-values
	lightColor: '#ffd6aa',
	lightRadius: 0.08,
	stampAsset: 'prop:crate',
	stampRotation: 0,
	stampScale: 1,
	scatterObject: 'trees',
	scatterDensity: 0.5,
	labelText: '',
	templateSize: 20,
	templateRotation: 0,
	routeName: '',
	travelPace: DEFAULT_TRAVEL_PACE,
	snapGrid: true,
	snapAngle: false,
	snapObject: true,
	newVisibility: 'dm-only',
};

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
	/** The active tool's name in the reader's language (RC-UX-1.2), for anything that has to say
	 * which tool is armed without importing the tool table and the catalog itself. */
	toolLabel: string;
	/** The message-catalog reader shared by canvas gestures and their operation announcements. */
	t: (key: MessageKey, values?: MessageValues) => string;
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
	/** RC-MAP-3.7 — the travel paces the ACTIVE system package offers, fast to slow. */
	travelPaces: readonly TravelPace[];

	// Dock
	dock: DockPanel;
	setDock: (panel: DockPanel) => void;

	// Write path
	busy: boolean;
	notice: string | null;
	/** Tone of the current notice. Every hook-written notice is a rejection or a thrown error, so it
	 *  defaults to `warning`; a caller reporting SUCCESS or plain information must say so, because the
	 *  banner used to hard-code the warning skin and painted "Projected to 3 players." in yellow with a
	 *  warning triangle. */
	noticeTone: MapNoticeTone;
	setNotice: (message: string | null, tone?: MapNoticeTone) => void;
	/** Dispatch a command; on acceptance, records the inverse on the undo stack. */
	run: (command: CoreCommand, options?: { undoable?: boolean }) => Promise<boolean>;
	/** Mint a stable, app-side id for a create command (so undo/redo can target it). */
	nextId: (prefix?: string) => string;

	// RC-MAP-2.5 — the party's atlas mark, scoped to this map (null when the party is elsewhere or
	// has never been marked).
	partyLocation: SessionPartyLocation | null;
	/** Dispatch `session.mark-party` for this map at a normalized point (DM only). */
	markPartyHere: (point: { x: number; y: number }) => Promise<boolean>;

	// Undo / redo
	history: readonly HistoryEntry[];
	redoStack: readonly HistoryEntry[];
	canUndo: boolean;
	canRedo: boolean;
	undo: () => Promise<void>;
	redo: () => Promise<void>;
}

export function mapViewOrNull(result: ReturnType<typeof getMapViewForActor>) {
	return result.kind === 'available' ? result : null;
}
