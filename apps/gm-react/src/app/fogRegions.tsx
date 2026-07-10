// Shared SVG rendering for fog-region shapes (rect | polygon | stroke) in the 0..100 map
// viewBox space. Both the builder canvas mask/outlines and the Atlas summaries consume the
// core MapFogRegion union through these helpers so every shape renders honestly everywhere.
import { normalizeFogRegion, type MapFogRegion } from '@dndtools/core';

interface FogShapeProps {
	region: MapFogRegion;
	/** Fill/stroke paint — mask fills use white/black; outlines pass a dashed stroke color. */
	paint: string;
	/** 'fill' paints the covered area (mask use); 'outline' draws a dashed boundary aid. */
	mode: 'fill' | 'outline';
}

/** One fog region as an SVG element in the 0..100 viewBox. Pure presentational. */
export function FogRegionShape({ region, paint, mode }: FogShapeProps) {
	const r = normalizeFogRegion(region);
	const outline = mode === 'outline';
	const common = outline
		? {
				fill: 'none' as const,
				stroke: paint,
				strokeWidth: 1.2,
				strokeDasharray: '4 3',
				vectorEffect: 'non-scaling-stroke' as const,
				opacity: 0.75,
			}
		: {};
	if (r.shape === 'rect') {
		return <rect x={r.x * 100} y={r.y * 100} width={r.w * 100} height={r.h * 100} {...(outline ? common : { fill: paint })} />;
	}
	if (r.shape === 'polygon') {
		const points = r.points.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');
		return <polygon points={points} {...(outline ? common : { fill: paint })} />;
	}
	// stroke — a polyline swept by a disc of `radius` (a single point is a disc). The covered
	// area renders as a fat round-capped stroke; the outline aid draws the centerline dashed.
	const sweep = Math.max(r.radius * 2 * 100, 0.5);
	if (r.points.length === 1) {
		const p = r.points[0];
		return <circle cx={p.x * 100} cy={p.y * 100} r={r.radius * 100} {...(outline ? common : { fill: paint })} />;
	}
	const points = r.points.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');
	return outline ? (
		<polyline points={points} {...common} />
	) : (
		<polyline points={points} fill="none" stroke={paint} strokeWidth={sweep} strokeLinecap="round" strokeLinejoin="round" />
	);
}

/** A compact human summary of a fog region for list rows (Atlas fog log). Pure. */
export function fogRegionSummary(region: MapFogRegion): string {
	const r = normalizeFogRegion(region);
	if (r.shape === 'rect') {
		return `${Math.round(r.w * 100)}×${Math.round(r.h * 100)}% at ${Math.round(r.x * 100)},${Math.round(r.y * 100)}`;
	}
	if (r.shape === 'polygon') {
		return `polygon · ${r.points.length} points`;
	}
	return `brush stroke · ${r.points.length} point${r.points.length === 1 ? '' : 's'}`;
}
