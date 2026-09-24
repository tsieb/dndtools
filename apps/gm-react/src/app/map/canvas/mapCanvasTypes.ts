import {
	type MapFogRegion,
	type MapLayerQueryEntry,
	type MapPoiView,
	type MapView,
} from '@dndtools/core';
import { type CSSProperties, type ReactNode } from 'react';
import { type FogShape, type MapTool } from '../mapVisibility';
import { type Point } from './geometry';

/**
 * MapCanvas — the engine-free SVG/absolute-div geometry renderer shared by the Atlas preview and
 * the map editor (ADR-014: the core's map model is already geometric, so no raster/pixel engine).
 * Reads come from the actor-filtered `getMapViewForActor` / `queryMapLayers`, so the same renderer
 * is player-safe when the Atlas renders a non-DM actor's view. Every authoring gesture reports the
 * REAL drawn geometry to its `on*` prop; the consumer owns the dispatch. Extracted from
 * MapBuilder.tsx unchanged (RC-STB-2.6).
 */

export interface MapCanvasProps {
	/** The actor-filtered map view (already player-safe). Null renders an empty well. */
	view: MapView | null;
	/** Actor-filtered layer entries (carries the painted `content` features). */
	layers?: MapLayerQueryEntry[];
	isDm: boolean;
	zoom?: number;
	/** Normalized view center (pan). Fixed {.5,.5} for the Atlas preview. */
	center?: Point;
	tool?: MapTool;
	fogMode?: 'reveal' | 'conceal';
	/** Which fog sub-tool is active: drag-rect, click-vertex polygon, or swept brush. */
	fogShape?: FogShape;
	/** Normalized brush radius (0..0.5) for the fog brush sub-tool. */
	fogBrushRadius?: number;
	/**
	 * Content-addressed raster asset id rendered as the base `<image>` layer under the vector
	 * geometry. Null/absent ⇒ pure geometry well. Missing bytes render an honest placeholder.
	 */
	rasterAssetId?: string | null;
	/** Enables authoring gestures (builder). The Atlas preview passes false → select/inspect only. */
	editable?: boolean;
	/** Draw dashed per-op fog outlines (DM authoring aid). */
	showFogOutlines?: boolean;
	height?: number | string;
	selectedPoiId?: string | null;
	selectedTokenId?: string | null;
	onSelectPoi?: (poiId: string | null) => void;
	onSelectToken?: (tokenId: string | null) => void;
	/** Click with the poi/token tool → normalized position. */
	onPlace?: (position: Point) => void;
	/** A completed fog gesture (rect drag, closed polygon, or brush sweep) → the shaped region. */
	onFogRegion?: (region: MapFogRegion) => void;
	/** Live vertex count of the in-progress fog polygon (0 when none is being drawn). */
	onPolygonVertexCount?: (count: number) => void;
	onMovePoi?: (poiId: string, position: Point) => void;
	onMoveToken?: (tokenId: string, position: Point) => void;
	onPan?: (center: Point) => void;
	/** Renders the POI popover at the marker's visual anchor (consumer owns the actions). */
	renderPoiPopover?: (
		poi: MapPoiView,
		anchor: { x: string; y: string },
		placement: 'top' | 'bottom',
	) => ReactNode;
	/**
	 * RC-MAP-2.3 — suppress the read-only combat overlay. The map editor sets this: it draws its own
	 * INTERACTIVE combat layer over the canvas and must not have a second, inert copy underneath.
	 */
	hideCombatOverlay?: boolean;
	/** Small surfaces (the session stage preview) draw combat tokens without their name plates. */
	compactCombat?: boolean;
	/** HUD overlays (title card, zoom cluster, minimap…) — pointer events are isolated from the map. */
	children?: ReactNode;
	style?: CSSProperties;
}
