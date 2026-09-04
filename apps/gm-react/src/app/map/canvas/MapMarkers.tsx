import { type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { type MapPoiView, type MapView } from '@dndtools/core';
import { POIMarker, VisibilityChip } from '../../../ds';
import { T } from '../../screen-kit';
import { POI_MARKER_CAT } from '../mapVisibility';
import { type DragState, type Point } from './geometry';

/** The unscaled marker layer — tokens, POI markers and the consumer-rendered POI popover, all
 * positioned through the zoom/pan transform so hit targets stay 44px. Extracted from
 * MapBuilder.tsx's MapCanvas unchanged (RC-STB-2.6). */
export function MapMarkers({
	view,
	isDm,
	editable,
	selectedPoiId,
	selectedTokenId,
	onSelectPoi,
	onSelectToken,
	renderPoiPopover,
	drag,
	toVisual,
	annotationVisible,
	markerDragHandlers,
	clickGuard,
	markersInteractive,
	selectedPoi,
}: {
	view: MapView | null;
	isDm: boolean;
	editable: boolean;
	selectedPoiId: string | null;
	selectedTokenId: string | null;
	onSelectPoi?: (poiId: string | null) => void;
	onSelectToken?: (tokenId: string | null) => void;
	renderPoiPopover?: (
		poi: MapPoiView,
		anchor: { x: string; y: string },
		placement: 'top' | 'bottom',
	) => ReactNode;
	drag: DragState | null;
	toVisual: (point: Point) => Point;
	annotationVisible: (layerId: string) => boolean;
	markerDragHandlers: (
		kind: 'poi' | 'token',
		id: string,
		canDrag: boolean,
		onSelect: () => void,
	) => {
		onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
		onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
		onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
	};
	clickGuard: (fn: () => void) => () => void;
	markersInteractive: boolean;
	selectedPoi: MapPoiView | null;
}) {
	return (
		<div
			style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
			onClick={(e) => e.stopPropagation()}
			onPointerDown={(e) => e.stopPropagation()}
		>
			{view?.tokens
				.filter((t) => annotationVisible(t.layerId))
				.map((t) => {
					const dragging = drag && drag.kind === 'token' && drag.id === t.id;
					const v = toVisual(dragging && drag.kind === 'token' ? drag.pos : t.position);
					if (v.x < -0.05 || v.x > 1.05 || v.y < -0.05 || v.y > 1.05) return null;
					const canDrag = editable && markersInteractive && (isDm || t.canMove);
					const d = Math.round(30 * Math.min(2, Math.max(0.7, t.size)));
					const on = t.id === selectedTokenId;
					const selectToken = () => onSelectToken?.(on ? null : t.id);
					return (
						<div
							key={t.id}
							{...markerDragHandlers('token', t.id, canDrag, selectToken)}
							style={{
								position: 'absolute',
								left: `${v.x * 100}%`,
								top: `${v.y * 100}%`,
								transform: 'translate(-50%,-50%)',
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								gap: 4,
								pointerEvents: markersInteractive ? 'auto' : 'none',
								cursor: canDrag ? (dragging ? 'grabbing' : 'grab') : 'pointer',
								zIndex: on ? 3 : 2,
							}}
						>
							<button
								type="button"
								aria-label={`Token: ${t.label}`}
								aria-pressed={on}
								title={t.label}
								onClick={clickGuard(selectToken)}
								style={{
									width: d,
									height: d,
									borderRadius: '50%',
									border: `2.5px solid ${t.linkedActorId ? T.ok : T.err}`,
									background: T.bg,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									font: `700 11px ${T.mono}`,
									color: T.ink,
									cursor: 'inherit',
									boxShadow: on ? `0 0 0 3px var(--color-interactive-selected), ${T.ssm}` : T.ssm,
									padding: 0,
								}}
							>
								{t.label[0]}
							</button>
							<span
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: 4,
									font: `10px ${T.sans}`,
									color: T.sub,
									background: 'color-mix(in oklab, var(--map-canvas-bg) 72%, transparent)',
									padding: '1px 5px',
									borderRadius: 4,
									whiteSpace: 'nowrap',
								}}
							>
								{t.label}
								{t.visibility === 'dm-only' && <VisibilityChip level="dm-only" compact />}
							</span>
						</div>
					);
				})}

			{view?.pois
				.filter((p) => annotationVisible(p.layerId))
				.map((p) => {
					const dragging = drag && drag.kind === 'poi' && drag.id === p.id;
					const v = toVisual(dragging && drag.kind === 'poi' ? drag.pos : p.position);
					if (v.x < -0.05 || v.x > 1.05 || v.y < -0.05 || v.y > 1.05) return null;
					const canDrag = editable && markersInteractive && isDm;
					const selectPoi = () => onSelectPoi?.(p.id === selectedPoiId ? null : p.id);
					return (
						<div
							key={p.id}
							{...markerDragHandlers('poi', p.id, canDrag, selectPoi)}
							style={{
								position: 'absolute',
								left: `${v.x * 100}%`,
								top: `${v.y * 100}%`,
								transform: 'translate(-50%,-88%)',
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								pointerEvents: markersInteractive ? 'auto' : 'none',
								cursor: canDrag ? (dragging ? 'grabbing' : 'grab') : 'pointer',
								zIndex: p.id === selectedPoiId ? 4 : 2,
							}}
						>
							<POIMarker
								category={POI_MARKER_CAT[p.category] ?? 'location'}
								label={p.label}
								dmOnly={p.visibility === 'dm-only'}
								active={p.id === selectedPoiId}
								onClick={clickGuard(selectPoi)}
							/>
							<span
								style={{
									font: `10px ${T.sans}`,
									color: T.ink,
									background: 'color-mix(in oklab, var(--map-canvas-bg) 72%, transparent)',
									padding: '1px 6px',
									borderRadius: 5,
									whiteSpace: 'nowrap',
									marginTop: -6,
								}}
							>
								{p.label}
							</span>
						</div>
					);
				})}

			{/* POI popover, anchored at the marker's visual position (consumer supplies the actions) */}
			{selectedPoi && renderPoiPopover && annotationVisible(selectedPoi.layerId) && (
				<div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
					<div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
						{(() => {
							const v = toVisual(selectedPoi.position);
							const placement = v.y < 0.42 ? 'bottom' : 'top';
							return (
								<div
									style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}
									onClick={(e) => e.stopPropagation()}
								>
									{renderPoiPopover(
										selectedPoi,
										{
											x: `${v.x * 100}%`,
											y: `${(placement === 'top' ? v.y - 0.045 : v.y + 0.01) * 100}%`,
										},
										placement,
									)}
								</div>
							);
						})()}
					</div>
				</div>
			)}
		</div>
	);
}
