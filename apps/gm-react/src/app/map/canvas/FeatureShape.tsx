import { type MapFeature } from '@dndtools/core';
import { terrainColor } from '../mapVocab';
import { rectOf } from './geometry';

/**
 * One painted/generated layer feature (MAP-003 / MAP-021 normalized geometry) as SVG in the 0–100
 * viewBox. `color` is the layer-category tint; a feature may override presentation through `props`
 * (e.g. a light's own colour), but never geometry. Every kind the core can emit renders here — a kind
 * this switch does not know still falls through to a visible polyline rather than vanishing, so a
 * forward-compatible core never produces an invisible map.
 */
export function FeatureShape({ feature, color }: { feature: MapFeature; color: string }) {
	const pts = feature.points
		.map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`)
		.join(' ');
	const props = feature.props ?? {};
	// A painted `terrain:*` style overrides the layer-category colour; anything else keeps it. Without
	// this the Terrain select's eight swatches were decorative only — every one painted the same tint.
	const paint = terrainColor(feature.style) ?? color;
	switch (feature.kind) {
		case 'fill':
		case 'room': {
			const r = rectOf(feature);
			return (
				<rect
					x={r.x}
					y={r.y}
					width={r.w}
					height={r.h}
					fill={paint}
					fillOpacity={0.3}
					stroke={paint}
					strokeWidth={1.4}
					vectorEffect="non-scaling-stroke"
				/>
			);
		}
		case 'polygon': {
			// The workhorse: caves, biomes, wards, landmasses. A `props.hole` polygon is an interior
			// void (a pillar, a lake in land) — render it as a knock-out tint so it reads as "not floor".
			const isHole = props.hole === true;
			return (
				<polygon
					points={pts}
					fill={isHole ? 'var(--map-canvas-bg)' : color}
					fillOpacity={isHole ? 0.9 : 0.32}
					stroke={color}
					strokeWidth={1.2}
					vectorEffect="non-scaling-stroke"
					strokeLinejoin="round"
				/>
			);
		}
		case 'water': {
			// A river is a flowing polyline (width from props.width); a lake/sea is a filled ring. The
			// two are distinguished by the style token / props, NOT by point count — a river naturally has
			// many vertices, so counting points would wrongly render every river as a filled lake.
			const isRiver =
				feature.style.includes('river') || props.biome === 'river' || props.flow !== undefined;
			const width = typeof props.width === 'number' ? Math.max(0.4, props.width * 100) : 1.6;
			return isRiver ? (
				<polyline
					points={pts}
					fill="none"
					stroke="var(--layer-water)"
					strokeWidth={width}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			) : (
				<polygon
					points={pts}
					fill="var(--layer-water)"
					fillOpacity={0.45}
					stroke="var(--layer-water)"
					strokeWidth={1}
					vectorEffect="non-scaling-stroke"
				/>
			);
		}
		case 'marker': {
			const p = feature.points[0]!;
			return <circle cx={p.x * 100} cy={p.y * 100} r={1.1} fill={color} />;
		}
		case 'prop': {
			const p = feature.points[0]!;
			const scale = typeof props.scale === 'number' ? props.scale : 1;
			return (
				<circle
					cx={p.x * 100}
					cy={p.y * 100}
					r={Math.max(0.5, 0.9 * scale)}
					fill={color}
					fillOpacity={0.85}
				/>
			);
		}
		case 'light': {
			const p = feature.points[0]!;
			const radius = typeof props.radius === 'number' ? props.radius * 100 : 6;
			const lightColor = typeof props.color === 'string' ? props.color : '#ffd6aa';
			return (
				<g>
					<circle
						cx={p.x * 100}
						cy={p.y * 100}
						r={radius}
						fill={lightColor}
						fillOpacity={0.1}
						stroke={lightColor}
						strokeOpacity={0.35}
						strokeWidth={0.8}
						vectorEffect="non-scaling-stroke"
					/>
					<circle cx={p.x * 100} cy={p.y * 100} r={0.9} fill={lightColor} />
				</g>
			);
		}
		case 'door': {
			// A door spans a wall opening. Solid = closed/locked, dashed = open/archway.
			const state = props.state;
			const open = state === 'open' || props.portal === 'archway';
			return (
				<polyline
					points={pts}
					fill="none"
					stroke={props.portal === 'secret' ? 'var(--layer-dm)' : 'var(--layer-roads)'}
					strokeWidth={3.2}
					strokeLinecap="butt"
					strokeDasharray={open ? '3 2' : props.portal === 'secret' ? '1 2' : undefined}
					vectorEffect="non-scaling-stroke"
				/>
			);
		}
		case 'text': {
			const p = feature.points[0]!;
			const text = typeof props.text === 'string' ? props.text : '';
			const size = typeof props.size === 'number' ? props.size : 3;
			return (
				<text
					x={p.x * 100}
					y={p.y * 100}
					fill={color}
					fontSize={size}
					textAnchor="middle"
					style={{ font: `${size}px var(--font-display, serif)` }}
				>
					{text}
				</text>
			);
		}
		case 'road':
			return (
				<polyline
					points={pts}
					fill="none"
					stroke={color}
					strokeWidth={1.6}
					strokeDasharray="5 3"
					vectorEffect="non-scaling-stroke"
				/>
			);
		case 'wall':
			return (
				<polyline
					points={pts}
					fill="none"
					stroke={color}
					strokeWidth={2.4}
					vectorEffect="non-scaling-stroke"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			);
		default: // 'stroke'
			return (
				<polyline
					points={pts}
					fill="none"
					stroke={paint}
					strokeWidth={1.4}
					vectorEffect="non-scaling-stroke"
					strokeLinecap="round"
				/>
			);
	}
}
