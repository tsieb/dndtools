import {
	type MapLayerQueryEntry,
	type MapListEntry,
	type MapView,
	type MapViewResult,
	type SceneVisibility,
} from '@dndtools/core';
import { Button, IconButton, POIPopover, VisibilityChip } from '../../ds';
import { T } from '../../app/screen-kit';
import { POI_MARKER_CAT, MapCanvas, VIS_CHIP, dsToVis, visToDs } from '../../app/MapBuilder';

/** The Atlas preview canvas — the real shared geometry renderer plus its overlay chrome (map
 * title, zoom cluster, fog/project actions, POI popover). Read-only; authoring gestures live in
 * the MapBuilder overlay. Extracted from Atlas.tsx unchanged (RC-STB-2.6). */
export function AtlasCanvas({
	view,
	mapView,
	layers,
	isDm,
	busy,
	mapZoom,
	mapCenter,
	rasterAssetId,
	selPoiId,
	selTokenId,
	selectedEntry,
	onSelectPoi,
	onSelectToken,
	onFocusPoi,
	onSetPoiVisibility,
	onCopyPoiLink,
	onDeletePoi,
	onZoom,
	onOpenEditor,
	onOpenFog,
	onProjectToPlayers,
}: {
	view: MapViewResult | null;
	mapView: MapView | null;
	layers: MapLayerQueryEntry[];
	isDm: boolean;
	busy: boolean;
	mapZoom: number;
	mapCenter: { x: number; y: number };
	rasterAssetId: string | null;
	selPoiId: string | null;
	selTokenId: string | null;
	selectedEntry: MapListEntry | null;
	onSelectPoi: (poiId: string | null) => void;
	onSelectToken: (tokenId: string | null) => void;
	onFocusPoi: (position: { x: number; y: number }) => void;
	onSetPoiVisibility: (poiId: string, visibility: SceneVisibility) => void;
	onCopyPoiLink: (poiId: string) => void;
	onDeletePoi: (poiId: string) => void;
	onZoom: (delta?: number, fit?: boolean) => void;
	onOpenEditor: () => void;
	onOpenFog: (mode: 'reveal' | 'conceal') => void;
	onProjectToPlayers: () => void;
}) {
	return (
		<>
			{/* canvas — the REAL shared geometry renderer (grid, layer features, fog mask composed from
				    durable ops, DS POI markers, tokens), actor-filtered. Read-only here; authoring gestures
				    live in the MapBuilder overlay. */}
			<MapCanvas
				view={mapView}
				layers={layers}
				isDm={isDm}
				zoom={mapZoom}
				center={mapCenter}
				height={560}
				rasterAssetId={rasterAssetId}
				selectedPoiId={selPoiId}
				selectedTokenId={selTokenId}
				onSelectPoi={onSelectPoi}
				onSelectToken={onSelectToken}
				renderPoiPopover={(poi, anchor, placement) => (
					<POIPopover
						poi={{
							name: poi.label,
							category: POI_MARKER_CAT[poi.category] ?? 'location',
							categoryLabel: poi.category,
							visibility: visToDs(poi.visibility),
						}}
						anchor={anchor}
						placement={placement}
						readOnly={!isDm}
						onClose={() => onSelectPoi(null)}
						onVisibilityChange={(v: string) => onSetPoiVisibility(poi.id, dsToVis(v))}
						onFocus={() => {
							// Actually focus: pan the preview onto the marker and zoom in enough for it
							// to read, keeping the popover's selection so the DM can see what they hit.
							onFocusPoi(poi.position);
						}}
						onEdit={onOpenEditor}
						onDeepLink={() => onCopyPoiLink(poi.id)}
						onDelete={() => onDeletePoi(poi.id)}
					/>
				)}
			>
				<div
					style={{
						position: 'absolute',
						top: 12,
						left: 14,
						maxWidth: 'calc(100% - 190px)',
						display: 'flex',
						flexDirection: 'column',
						gap: 2,
						padding: '5px 11px',
						borderRadius: 8,
						background: 'color-mix(in oklab, var(--map-canvas-bg) 72%, transparent)',
						backdropFilter: 'blur(2px)',
						border: `1px solid ${T.bd}`,
					}}
				>
					<span
						style={{
							font: `700 16px ${T.disp}`,
							color: T.ink,
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}
					>
						{mapView?.name ?? selectedEntry?.name ?? 'No map selected'}
					</span>
					{selectedEntry && (
						<span
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 7,
								font: `11px ${T.sans}`,
								color: T.sub,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
							}}
						>
							<VisibilityChip level={VIS_CHIP[selectedEntry.visibility] ?? 'dm-only'} />
							{selectedEntry.description || 'No description'}
						</span>
					)}
				</div>
				<div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 }}>
					<IconButton
						icon="zoom-in"
						label="Zoom in"
						variant="outline"
						size="sm"
						onClick={() => onZoom(0.2)}
					/>
					<IconButton
						icon="zoom-out"
						label="Zoom out"
						variant="outline"
						size="sm"
						onClick={() => onZoom(-0.2)}
					/>
					<IconButton
						icon="zoom-fit"
						label="Fit"
						variant="outline"
						size="sm"
						onClick={() => onZoom(undefined, true)}
					/>
					<span
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							padding: '0 8px',
							borderRadius: 7,
							background: 'color-mix(in oklab, var(--map-canvas-bg) 78%, transparent)',
							font: `11px ${T.mono}`,
							color: T.ink,
						}}
					>
						{Math.round(mapZoom * 100)}%
					</span>
				</div>
				{view?.kind === 'unavailable' && (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							font: `13px ${T.sans}`,
							color: T.sub,
							// A full-bleed `inset:0` panel that comes AFTER the zoom cluster in DOM order
							// swallows every click on Zoom in / Zoom out / Fit. It is a message, not a
							// target — let the pointer straight through it.
							pointerEvents: 'none',
						}}
					>
						This map is unavailable to you.
					</div>
				)}
				<div
					style={{
						position: 'absolute',
						bottom: 12,
						left: 14,
						display: 'flex',
						gap: 8,
						flexWrap: 'wrap',
					}}
				>
					{isDm && mapView && (
						<Button
							variant="primary"
							size="sm"
							icon="layer-fog"
							onClick={() => onOpenFog('reveal')}
						>
							Fog of war
						</Button>
					)}
					{isDm && (
						<Button
							variant="ghost"
							size="sm"
							icon="visibility-players"
							disabled={busy || !mapView}
							onClick={onProjectToPlayers}
						>
							Project to players
						</Button>
					)}
				</div>
			</MapCanvas>
		</>
	);
}
