import { useId } from 'react';
import type { ProjectedMapInfo } from '../../app/projectedMap';
import { FogRegionShape } from '../../app/fogRegions';
import { useI18n } from '../../i18n';

/**
 * RC-CLD-3.2 — the projected map as the PLAYER sees it, drawn on the companion's stage.
 *
 * Before this the companion painted the projected map's raster and nothing else, so a player looking
 * at their own device saw an unfogged picture while the table saw a fogged map: the DM's projection
 * choices did not reach the player screen. This renders the same geometry the DM canvas renders
 * (`app/map/canvas/MapSvgLayers.tsx`) — the fog mask composed op-by-op so a later op overrides an
 * earlier overlap, plus the markers — from the ALREADY actor-filtered lists on `ProjectedMapInfo`.
 * No visibility decision is taken here: a fog op, POI, token or combatant the core withheld is simply
 * absent from the props (`app/projectedMap.ts` gates both the delivery and the actor filter).
 *
 * The raster is an SVG `<image preserveAspectRatio="none">` in the same 0..100 normalized viewBox the
 * DM canvas uses, so the fog lands over the terrain it covers at the table rather than over whatever
 * a CSS `object-fit: cover` crop happened to leave visible.
 *
 * Read-only by construction: no control, no drag, nothing focusable — a player cannot move a token
 * from the companion, so the surface offers no affordance that would suggest they can.
 */
export function StageMap({
	projected,
	rasterUrl,
}: {
	projected: ProjectedMapInfo;
	rasterUrl: string | null;
}) {
	const { t } = useI18n();
	const fogMaskId = useId();
	const concealed = projected.fog.filter((op) => op.kind === 'conceal').length;
	const markers = projected.pois.length;
	const tokens = projected.tokens.length + projected.combatTokens.length;
	const summary = t('play.stage.mapOverlay', {
		name: projected.name,
		fog: String(concealed),
		markers: String(markers),
		tokens: String(tokens),
	});
	return (
		<svg
			data-testid="player-stage-map"
			data-fog-ops={String(projected.fog.length)}
			data-tokens={String(tokens)}
			role="img"
			aria-label={summary}
			viewBox="0 0 100 100"
			preserveAspectRatio="none"
			style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
		>
			{rasterUrl && (
				<image href={rasterUrl} x={0} y={0} width={100} height={100} preserveAspectRatio="none" />
			)}
			{/* fog of war — the player wash is near-solid (`--map-fog-opacity-player`), unlike the DM's
			    see-through authoring wash. Mask composed op-by-op: conceal paints, reveal cuts back out. */}
			{projected.fog.length > 0 && (
				<>
					<defs>
						<mask id={fogMaskId} maskUnits="userSpaceOnUse" x={0} y={0} width={100} height={100}>
							<rect x={0} y={0} width={100} height={100} fill="black" />
							{projected.fog.map((op) => (
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
					{/* `fill`/`opacity` go through `style`, not presentation attributes: a presentation
					    attribute is not a CSS declaration, so `var(--…)` would not resolve there. */}
					<rect
						x={0}
						y={0}
						width={100}
						height={100}
						style={{ fill: 'var(--map-fog-fill)', opacity: 'var(--map-fog-opacity-player)' }}
						mask={`url(#${fogMaskId})`}
					/>
				</>
			)}
			{/* POIs the DM made player-visible. A dot, not the DS pin: the pin is a button, and a control
			    that cannot do anything on a read-only companion would be a dead control. */}
			{projected.pois.map((poi) => (
				<circle
					key={poi.id}
					cx={poi.position.x * 100}
					cy={poi.position.y * 100}
					r={1.4}
					style={{
						fill: 'var(--layer-poi)',
						stroke: 'var(--color-text-inverse)',
						strokeWidth: 0.4,
					}}
				/>
			))}
			{projected.tokens.map((token) => (
				<circle
					key={token.id}
					cx={token.position.x * 100}
					cy={token.position.y * 100}
					r={Math.max(token.size, 0.5) * 2}
					style={{
						fill: 'var(--layer-player)',
						fillOpacity: 0.85,
						stroke: 'var(--color-text-inverse)',
						strokeWidth: 0.5,
					}}
				/>
			))}
			{/* Combat tokens carry the same active-turn ring the DM canvas draws, so "whose turn" reads
			    the same on both screens. */}
			{projected.combatTokens.map((token) => (
				<circle
					key={token.combatantId}
					cx={token.position.x * 100}
					cy={token.position.y * 100}
					r={Math.max(token.size, 0.5) * 2}
					style={{
						fill: 'var(--layer-player)',
						fillOpacity: 0.9,
						stroke: token.isActive ? 'var(--color-accent)' : 'var(--color-text-inverse)',
						strokeWidth: token.isActive ? 1.2 : 0.5,
					}}
				/>
			))}
		</svg>
	);
}
