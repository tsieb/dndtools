import { getMapViewForActor } from '@dndtools/core';
import { useRuntime } from '../../../runtime/RuntimeContext';
import { useAssetObjectUrl } from '../../../platform/assetUrl';
import { pickRasterAssetId } from '../../mapGeometry';
import type { BoardWidget } from '../../board-helpers';
import { useI18n } from '../../../i18n';
import { Muted, bodyWrap } from '../../widget-body-kit';

/**
 * Moved from `app/widget-bodies.tsx` by RC-WID-4.1 — the file grew past what one module should
 * hold once every system widget type gained a body, so each hand-written body now lives in its own
 * file under `app/widgets/builtin/`. This is a pure move: the component below is byte-for-byte the
 * one that used to sit in `widget-bodies.tsx`.
 */

export function MapBody({ widget }: { widget: BoardWidget }) {
	const runtime = useRuntime();
	const { t } = useI18n();
	const isDm = runtime.state.permissions.actors[runtime.defaultActorId]?.role === 'dm';
	// Resolve the BOUND map through the actor-filtered view (hidden maps collapse to unavailable),
	// then pick its raster base layer exactly like Atlas does. Hooks run before any early return.
	const boundId = widget.bindingRef?.entityType === 'map' ? widget.bindingRef.entityId : null;
	const view = boundId
		? getMapViewForActor(
				runtime.state.maps,
				runtime.state.permissions,
				runtime.defaultActorId,
				boundId,
			)
		: null;
	const rasterId =
		view && view.kind === 'available'
			? pickRasterAssetId(
					runtime.state.maps.maps[view.mapId]?.assetIds ?? [],
					runtime.state.maps.assets,
				)
			: null;
	const rasterUrl = useAssetObjectUrl(rasterId);
	if (widget.requiresBinding && widget.status !== 'available') {
		return <Muted>{t('widgetBody.map.noBinding')}</Muted>;
	}
	if (!view || view.kind !== 'available') {
		return (
			<Muted>{isDm ? t('widgetBody.map.missingDm') : t('widgetBody.map.missingPlayer')}</Muted>
		);
	}
	return (
		<div style={{ ...bodyWrap, gap: 6 }}>
			<div
				style={{
					flex: 1,
					minHeight: 64,
					borderRadius: 'var(--radius-sm)',
					border: '1px solid var(--color-border)',
					overflow: 'hidden',
					// The map-less placeholder used to hard-code the gold grid AND a gold-over-near-black
					// diagonal film, so parchment got a gold wash over its light vellum and high-contrast
					// got a decorative low-alpha layer it must not have. The real map tokens are already
					// cut per theme (and remapped under forced-colors), so use them and drop the film.
					background: rasterUrl
						? 'var(--color-surface-sunken)'
						: 'repeating-linear-gradient(0deg, transparent 0 17px, var(--map-grid-line) 17px 18px), repeating-linear-gradient(90deg, transparent 0 17px, var(--map-grid-line) 17px 18px), var(--map-canvas-bg)',
				}}
			>
				{rasterUrl && (
					<img
						src={rasterUrl}
						alt={`${view.name} map`}
						style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
					/>
				)}
			</div>
			<Muted>
				{view.name} · {view.pois.length} {view.pois.length === 1 ? 'POI' : 'POIs'} ·{' '}
				{view.tokens.length} {view.tokens.length === 1 ? 'token' : 'tokens'}
				{view.fog.length > 0 ? ` · fog ×${view.fog.length}` : ''}
			</Muted>
		</div>
	);
}
