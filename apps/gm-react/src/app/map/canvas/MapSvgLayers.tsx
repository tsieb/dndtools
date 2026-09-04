import { type MapFeature, type MapLayerQueryEntry, type MapView } from '@dndtools/core';
import { FogRegionShape } from '../../fogRegions';
import { CATEGORY_VAR } from '../mapVisibility';
import { FeatureShape } from './FeatureShape';
import { type DragState } from './geometry';

/** The scaled map space's `<svg>` — raster base layer, painted layer features, routes, the
 * op-by-op fog mask, the DM's dashed fog outlines and the in-progress gesture ghosts. Extracted
 * from MapBuilder.tsx's MapCanvas unchanged (RC-STB-2.6). */
export function MapSvgLayers({
	view,
	isDm,
	fogMode,
	fogBrushRadius,
	showFogOutlines,
	drag,
	fogMaskId,
	polyPoints,
	rasterUrl,
	annotationVisible,
	fogOps,
	visibleFeatures,
	fogOpacity,
}: {
	view: MapView;
	isDm: boolean;
	fogMode: 'reveal' | 'conceal';
	fogBrushRadius: number;
	showFogOutlines: boolean;
	drag: DragState | null;
	fogMaskId: string;
	polyPoints: { x: number; y: number }[];
	rasterUrl: string | null;
	annotationVisible: (layerId: string) => boolean;
	fogOps: MapView['fog'];
	visibleFeatures: { layer: MapLayerQueryEntry; features: MapFeature[] }[];
	fogOpacity: string;
}) {
	return (
		<svg
			viewBox="0 0 100 100"
			preserveAspectRatio="none"
			style={{
				position: 'absolute',
				inset: 0,
				width: '100%',
				height: '100%',
				pointerEvents: 'none',
				overflow: 'visible',
			}}
		>
			{/* raster base layer — the imported image bytes, content-addressed. Rendered FIRST so
						    every vector layer, annotation, and (critically) the fog mask covers it. */}
			{rasterUrl && (
				<image href={rasterUrl} x={0} y={0} width={100} height={100} preserveAspectRatio="none" />
			)}
			{/* painted layer features (MAP-003), in render order, tinted by layer category */}
			{visibleFeatures.map(({ layer: l, features }) => (
				<g key={l.layerId} opacity={l.opacity}>
					{features.map((f) => (
						<FeatureShape
							key={f.id}
							feature={f}
							color={`var(${CATEGORY_VAR[l.category] ?? '--layer-custom'})`}
						/>
					))}
				</g>
			))}
			{/* routes (MAP-013) */}
			{view.routes
				.filter((r) => annotationVisible(r.layerId))
				.map((r) => (
					<g key={r.id}>
						<polyline
							points={r.waypoints
								.map((w) => `${w.position.x * 100},${w.position.y * 100}`)
								.join(' ')}
							fill="none"
							stroke={r.visibility === 'dm-only' ? 'var(--layer-dm)' : 'var(--color-route-player)'}
							strokeWidth={2}
							strokeDasharray="6 4"
							vectorEffect="non-scaling-stroke"
							opacity={0.85}
						/>
						{r.waypoints.map((w) => (
							<circle
								key={w.id}
								cx={w.position.x * 100}
								cy={w.position.y * 100}
								r={0.9}
								fill={r.visibility === 'dm-only' ? 'var(--layer-dm)' : 'var(--color-route-player)'}
							/>
						))}
					</g>
				))}
			{/* fog of war — mask composed op-by-op so a later op overrides an earlier overlap */}
			{fogOps.length > 0 && (
				<>
					<defs>
						<mask id={fogMaskId} maskUnits="userSpaceOnUse" x={0} y={0} width={100} height={100}>
							<rect x={0} y={0} width={100} height={100} fill="black" />
							{fogOps.map((op) => (
								<g key={op.id}>
									<FogRegionShape
										region={op.region}
										paint={op.kind === 'conceal' ? 'white' : 'black'}
										mode="fill"
										feather={op.feather}
									/>
								</g>
							))}
						</mask>
					</defs>
					<rect
						x={0}
						y={0}
						width={100}
						height={100}
						fill="var(--map-fog-fill)"
						opacity={fogOpacity}
						mask={`url(#${fogMaskId})`}
					/>
				</>
			)}
			{/* DM authoring aid: dashed per-op outlines */}
			{showFogOutlines &&
				isDm &&
				fogOps.map((op) => (
					<g key={`o-${op.id}`}>
						<FogRegionShape
							region={op.region}
							paint={op.kind === 'reveal' ? 'var(--color-accent)' : 'var(--map-fog-fill)'}
							mode="outline"
						/>
					</g>
				))}
			{/* ghost previews while a fog gesture is in progress (rect drag · brush sweep · polygon) */}
			{drag?.kind === 'fog' && (
				<rect
					x={Math.min(drag.start.x, drag.cur.x) * 100}
					y={Math.min(drag.start.y, drag.cur.y) * 100}
					width={Math.abs(drag.cur.x - drag.start.x) * 100}
					height={Math.abs(drag.cur.y - drag.start.y) * 100}
					fill={
						fogMode === 'reveal'
							? 'color-mix(in oklab, var(--color-accent) 18%, transparent)'
							: 'color-mix(in oklab, var(--map-fog-fill) 45%, transparent)'
					}
					stroke={fogMode === 'reveal' ? 'var(--color-accent)' : 'var(--map-fog-fill)'}
					strokeWidth={1.4}
					strokeDasharray="4 3"
					vectorEffect="non-scaling-stroke"
				/>
			)}
			{drag?.kind === 'brush' && (
				<g opacity={0.7}>
					<FogRegionShape
						region={{ shape: 'stroke', points: drag.points, radius: fogBrushRadius }}
						paint={
							fogMode === 'reveal'
								? 'color-mix(in oklab, var(--color-accent) 30%, transparent)'
								: 'color-mix(in oklab, var(--map-fog-fill) 55%, transparent)'
						}
						mode="fill"
					/>
				</g>
			)}
			{polyPoints.length > 0 && (
				<g>
					<polyline
						points={polyPoints.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
						fill={
							polyPoints.length >= 3
								? fogMode === 'reveal'
									? 'color-mix(in oklab, var(--color-accent) 14%, transparent)'
									: 'color-mix(in oklab, var(--map-fog-fill) 35%, transparent)'
								: 'none'
						}
						stroke={fogMode === 'reveal' ? 'var(--color-accent)' : 'var(--map-fog-fill)'}
						strokeWidth={1.4}
						strokeDasharray="4 3"
						vectorEffect="non-scaling-stroke"
					/>
					{polyPoints.map((p, i) => (
						<circle
							key={i}
							cx={p.x * 100}
							cy={p.y * 100}
							r={0.8}
							fill={fogMode === 'reveal' ? 'var(--color-accent)' : 'var(--map-fog-fill)'}
						/>
					))}
				</g>
			)}
		</svg>
	);
}
