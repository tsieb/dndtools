// Shared SVG rendering for fog-region shapes (rect | polygon | stroke) in the 0..100 map
// viewBox space. Both the builder canvas mask/outlines and the Atlas summaries consume the
// core MapFogRegion union through these helpers so every shape renders honestly everywhere.
import { useEffect, useId, useRef, useState } from 'react';
import { normalizeFogRegion, type MapFogRegion, type MapFogView } from '@dndtools/core';
import { fogRevealDelta } from '../net/viewModels';
import { featherBlurStdDev } from './mapGeometry';

interface FogShapeProps {
	region: MapFogRegion;
	/** Fill/stroke paint — mask fills use white/black; outlines pass a dashed stroke color. */
	paint: string;
	/** 'fill' paints the covered area (mask use); 'outline' draws a dashed boundary aid. */
	mode: 'fill' | 'outline';
	/**
	 * Optional soft-edge feather width (the op's `feather`, 0..0.2 normalized). Fill shapes render
	 * through a gaussian blur (stdDev ≈ feather·100/2 in the 0..100 viewBox) so the mask edge is a
	 * soft band; outlines stay sharp (they are an authoring aid marking the exact op boundary).
	 */
	feather?: number;
}

/** One fog region as an SVG element in the 0..100 viewBox. Pure presentational. */
export function FogRegionShape({ region, paint, mode, feather }: FogShapeProps) {
	const filterId = useId();
	const r = normalizeFogRegion(region);
	const outline = mode === 'outline';
	const stdDev = outline ? 0 : featherBlurStdDev(feather);
	const shape = renderShape(r, paint, outline);
	if (stdDev <= 0) return shape;
	return (
		<g>
			{/* Filter region padded so the blur halo is not clipped at the shape's bounding box. */}
			<filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
				<feGaussianBlur stdDeviation={stdDev} />
			</filter>
			<g filter={`url(#${filterId})`}>{shape}</g>
		</g>
	);
}

function renderShape(r: ReturnType<typeof normalizeFogRegion>, paint: string, outline: boolean) {
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
		return (
			<rect
				x={r.x * 100}
				y={r.y * 100}
				width={r.w * 100}
				height={r.h * 100}
				{...(outline ? common : { fill: paint })}
			/>
		);
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
		return (
			<circle
				cx={p.x * 100}
				cy={p.y * 100}
				r={r.radius * 100}
				{...(outline ? common : { fill: paint })}
			/>
		);
	}
	const points = r.points.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');
	return outline ? (
		<polyline points={points} {...common} />
	) : (
		<polyline
			points={points}
			fill="none"
			stroke={paint}
			strokeWidth={sweep}
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
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

// ── RC-MAP-2.4 · live fog reveal ────────────────────────────────────────────────────────────────

/**
 * How long the wash over a newly revealed region takes to dissolve. 0.8s ease-out: long enough that
 * a player looking anywhere on the map catches the movement, short enough that it is over before the
 * DM says the next sentence. Not a `--duration-*` token — the scale tops out at 500ms, and this is a
 * deliberately slower, one-off reveal rather than standard UI feedback.
 */
export const FOG_REVEAL_FADE_MS = 800;

/** The stable empty result, so a surface with no live reveal never re-renders on identity alone. */
const EMPTY_FLASH: ReadonlySet<string> = new Set<string>();

/** The keyframe name is global to the document, so it is declared once and shared by both surfaces. */
const FOG_REVEAL_KEYFRAMES =
	'@keyframes dnd-fog-reveal{from{opacity:1}to{opacity:0}}' +
	`.dnd-fog-reveal{animation:dnd-fog-reveal ${FOG_REVEAL_FADE_MS}ms var(--easing-decelerate) both}`;

/**
 * Track which fog REVEALS have just arrived, so the surface can fade the wash off them.
 *
 * The delta itself is {@link fogRevealDelta} over the previous and current fog list — the same pure
 * function whether the list came from the DM's own `getMapViewForActor` or off the wire in a player
 * view-model, so the DM canvas and the player companion cannot disagree about what "just revealed"
 * means. `resetKey` (the map id) drops the baseline: switching maps replaces the whole fog list, and
 * every op on the new map would otherwise read as new.
 *
 * Returns the ids currently fading. Empty on first sight of a map — a player joining mid-session
 * sees the map as it stands, not a replay of every reveal so far.
 */
export function useFogRevealFlash(
	fog: readonly MapFogView[] | null | undefined,
	resetKey: string | null,
): ReadonlySet<string> {
	const baseline = useRef<{ key: string | null; ops: readonly MapFogView[] } | null>(null);
	const [flashing, setFlashing] = useState<ReadonlySet<string>>(EMPTY_FLASH);

	useEffect(() => {
		const ops = fog ?? [];
		const previous = baseline.current;
		const fresh =
			previous && previous.key === resetKey ? fogRevealDelta(previous.ops, ops) : ([] as string[]);
		baseline.current = { key: resetKey, ops };
		if (previous && previous.key !== resetKey) setFlashing(EMPTY_FLASH);
		if (fresh.length === 0) return;
		setFlashing((current) => new Set([...current, ...fresh]));
		// The fade is CSS (and collapses to nothing under reduced motion); this only takes the finished
		// regions back out of the DOM so a long session does not accumulate spent overlays.
		const timer = setTimeout(() => {
			setFlashing((current) => {
				const next = new Set(current);
				for (const id of fresh) next.delete(id);
				return next;
			});
		}, FOG_REVEAL_FADE_MS);
		return () => clearTimeout(timer);
	}, [fog, resetKey]);

	return flashing;
}

/**
 * The fading wash over regions that were just revealed — the visible half of RC-MAP-2.4.
 *
 * A reveal cuts a hole in the fog mask, which is instantaneous and easy to miss on a player's own
 * screen. This paints the SAME wash back over just the revealed region for {@link FOG_REVEAL_FADE_MS}
 * and fades it to nothing, so the ground reads as uncovering rather than as having always been open.
 *
 * Under `data-motion="reduced"`/`"none"` the app's motion contract (`styles/index.css`) collapses
 * every animation to ~0ms, and `animation-fill-mode: both` holds the END frame — so the wash is
 * already gone on the first paint and the reveal is simply static. Decorative and inert: nothing is
 * announced, nothing is focusable, and no pointer event lands on it.
 */
export function FogRevealFlash({
	ops,
	flashing,
	opacity,
}: {
	/** The fog ops currently rendered on this surface (already actor-filtered and layer-filtered). */
	ops: readonly MapFogView[];
	/** Ids from {@link useFogRevealFlash}. */
	flashing: ReadonlySet<string>;
	/** The surface's fog opacity — the DM's see-through authoring wash or the player's near-solid one. */
	opacity: string;
}) {
	const fading = ops.filter((op) => flashing.has(op.id));
	if (fading.length === 0) return null;
	return (
		<g aria-hidden="true" data-testid="fog-reveal-flash" style={{ pointerEvents: 'none', opacity }}>
			<style>{FOG_REVEAL_KEYFRAMES}</style>
			{fading.map((op) => (
				<g key={op.id} className="dnd-fog-reveal">
					<FogRegionShape
						region={op.region}
						paint="var(--map-fog-fill)"
						mode="fill"
						feather={op.feather}
					/>
				</g>
			))}
		</g>
	);
}
