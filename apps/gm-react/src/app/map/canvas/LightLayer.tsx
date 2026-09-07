import { useId, useMemo } from 'react';
import { computeVisibility, type MapFeature, type Ring } from '@dndtools/core';
import { type Point } from './geometry';

/**
 * RC-MAP-3.6 — lighting and line-of-sight visualization.
 *
 * The map already knows everything this layer needs: `light` features carry radius/colour, and the
 * wall and door polylines ARE the occluders (`packages/core/src/queries/map-los.ts`). So nothing here
 * is authored twice and nothing is stored: a light's reach is `computeVisibility` cast from the
 * light's own point and clipped to its dim radius, recomputed from the same content the SVG draws.
 * Move a wall or open a door and the light spills through on the next render, because the door rule
 * lives in the core query rather than in this file.
 *
 * Two things are drawn, and they are deliberately different in kind:
 *   • LIGHT — a warm radial wash per light source, clipped to that light's visibility polygon, with
 *     a bright band out to `radius` and a dim band fading to `dimRadius`. Purely additive; it never
 *     hides anything, so a DM can always still see the map underneath.
 *   • PLAYER VISION — from the SELECTED token: everything outside that token's visibility polygon is
 *     washed down, and the polygon's edge is outlined. This one is a DM preview of a player's
 *     experience, which is why it subtracts rather than adds.
 *
 * The whole layer is `aria-hidden` decoration with `pointerEvents: 'none'`: the light features
 * themselves already render as glyphs in `FeatureShape.tsx` and the tokens are real buttons in
 * `MapMarkers.tsx`, so every fact this layer visualizes is reachable without it. Selecting a token
 * (the only input) is already keyboard-operable there.
 *
 * {@link planLighting} is a pure function of the features so the geometry can be asserted — and
 * snapshotted — without a browser.
 */

/** A light source resolved to renderable geometry. */
export interface PlannedLight {
	id: string;
	origin: Point;
	/** Full-strength radius, normalized (0..1). */
	brightRadius: number;
	/** Outer radius where the wash reaches zero, normalized. Always ≥ `brightRadius`. */
	dimRadius: number;
	/** CSS colour for the wash — the feature's own `props.color` when it is a safe literal. */
	color: string;
	/** 0..1 multiplier on the wash opacity. */
	intensity: number;
	/** The visibility polygon the wash is clipped to, cast from `origin` and bounded by `dimRadius`. */
	ring: Ring;
}

/** The "what can this token see" preview. */
export interface VisionPreview {
	origin: Point;
	radius: number;
	ring: Ring;
}

export interface LightingPlan {
	/** True when there is anything at all to draw. */
	active: boolean;
	lights: PlannedLight[];
	/** Light features past {@link MAX_PLANNED_LIGHTS} that were not planned. */
	omittedLights: number;
	vision: VisionPreview | null;
	/** How many sight-blocking features fed the casts (walls + doors), for the perf sample. */
	occluders: number;
}

export interface LightingOptions {
	/** Where the selected token stands. Null/undefined ⇒ no vision preview. */
	visionOrigin?: Point | null;
	/** Vision reach in normalized units. Default 0.35 — a generous but not map-wide darkvision. */
	visionRadius?: number;
	/** Rays per cast on top of the corner rays. Lower = cheaper and blockier. */
	rays?: number;
	maxLights?: number;
}

/**
 * A cast is O(rays × occluders), so a map with sixty torches and a generated wall network would spend
 * the whole frame budget in this file. Twenty is past what a scene ever needs on screen at once; the
 * rest still draw their glyph in `FeatureShape.tsx`, so no light silently disappears from the map —
 * only its wash is skipped, and `omittedLights` says how many.
 */
export const MAX_PLANNED_LIGHTS = 20;

const DEFAULT_LIGHT_RADIUS = 0.06;
/** Fallback wash colour: the warm gold the map well is already lit with. */
const DEFAULT_LIGHT_COLOR = 'var(--layer-player)';

/**
 * Feature `props` are author data, and this value lands in a `stop-color` attribute. Accept only
 * literal colour syntaxes — hex, rgb/hsl/oklch/oklab functions, and bare CSS colour keywords — so a
 * hand-edited or imported map cannot inject `url(...)` or an arbitrary expression into the SVG.
 */
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([^()]*\)|[a-z]+)$/i;

function safeColor(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (trimmed.length === 0 || trimmed.length > 64) return null;
	return SAFE_COLOR.test(trimmed) ? trimmed : null;
}

function positiveNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Whether a feature can block a light or a sight line — the input set `computeVisibility` filters. */
function isOccluder(feature: MapFeature): boolean {
	return feature.kind === 'wall' || feature.kind === 'door';
}

/** Round to 3 decimals so the emitted path data is stable across platforms (and snapshottable). */
function r3(value: number): number {
	return Math.round(value * 1000) / 1000;
}

/** `x,y x,y …` in the shared 0–100 viewBox. */
function ringPoints(ring: Ring): string {
	return ring.map((p) => `${r3(p.x * 100)},${r3(p.y * 100)}`).join(' ');
}

/**
 * Resolve the map's light features (and an optional viewer) to renderable geometry.
 *
 * Pure and deterministic: the same features always give the same rings, so this is safe to call from
 * a `useMemo` on every pan and to compare in a test.
 */
export function planLighting(
	features: readonly MapFeature[],
	options: LightingOptions = {},
): LightingPlan {
	const rays = options.rays ?? 48;
	const maxLights = options.maxLights ?? MAX_PLANNED_LIGHTS;
	const occluders = features.filter(isOccluder);

	const lightFeatures = features.filter((f) => f.kind === 'light' && f.points.length > 0);
	const planned = lightFeatures.slice(0, Math.max(0, maxLights));

	const lights: PlannedLight[] = planned.map((feature) => {
		const anchor = feature.points[0]!;
		const origin = { x: anchor.x, y: anchor.y };
		const props = feature.props ?? {};
		const brightRadius = positiveNumber(props.radius) ?? DEFAULT_LIGHT_RADIUS;
		// 5e's own convention: dim light reaches twice as far as bright light unless the author says
		// otherwise. A dimRadius smaller than the bright one is nonsense, so it is clamped up.
		const dimRadius = Math.max(positiveNumber(props.dimRadius) ?? brightRadius * 2, brightRadius);
		const intensity = Math.min(1, Math.max(0, positiveNumber(props.intensity) ?? 1));
		return {
			id: feature.id,
			origin,
			brightRadius,
			dimRadius,
			color: safeColor(props.color) ?? DEFAULT_LIGHT_COLOR,
			intensity,
			ring: computeVisibility(origin, occluders, { radius: dimRadius, rays }),
		};
	});

	const visionOrigin = options.visionOrigin ?? null;
	const visionRadius = options.visionRadius ?? 0.35;
	const vision: VisionPreview | null = visionOrigin
		? {
				origin: { x: visionOrigin.x, y: visionOrigin.y },
				radius: visionRadius,
				ring: computeVisibility(visionOrigin, occluders, { radius: visionRadius, rays }),
			}
		: null;

	return {
		active: lights.length > 0 || vision !== null,
		lights,
		omittedLights: lightFeatures.length - planned.length,
		vision,
		occluders: occluders.length,
	};
}

/**
 * The overlay itself. Sits above the feature SVG so the wash reads as light falling ON the map;
 * draws nothing at all when the plan is inactive.
 *
 * `idPrefix` exists so a test can snapshot stable markup; the app leaves it to `useId`.
 */
export function LightLayer({ plan, idPrefix }: { plan: LightingPlan; idPrefix?: string }) {
	const generatedId = useId();
	const prefix = (idPrefix ?? generatedId).replace(/[^a-zA-Z0-9_-]/g, '');
	const lights = plan.lights;
	const vision = plan.vision;

	const defsKeys = useMemo(
		() => lights.map((light, index) => `${prefix}-l${index}`),
		[lights, prefix],
	);

	if (!plan.active) return null;

	return (
		<svg
			aria-hidden="true"
			data-testid="map-light-layer"
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
			<defs>
				{lights.map((light, index) => {
					const key = defsKeys[index]!;
					// The bright band holds its opacity out to `radius`, then the dim band falls off to
					// nothing at `dimRadius` — the two bands 5e actually names, drawn as one gradient.
					const brightStop = r3(Math.min(1, light.brightRadius / light.dimRadius));
					return (
						<g key={key}>
							<radialGradient
								id={`${key}-g`}
								gradientUnits="userSpaceOnUse"
								cx={r3(light.origin.x * 100)}
								cy={r3(light.origin.y * 100)}
								r={r3(light.dimRadius * 100)}
							>
								<stop offset="0" stopColor={light.color} stopOpacity={r3(0.42 * light.intensity)} />
								<stop
									offset={brightStop}
									stopColor={light.color}
									stopOpacity={r3(0.26 * light.intensity)}
								/>
								<stop offset="1" stopColor={light.color} stopOpacity={0} />
							</radialGradient>
							<clipPath id={`${key}-c`} clipPathUnits="userSpaceOnUse">
								<polygon points={ringPoints(light.ring)} />
							</clipPath>
						</g>
					);
				})}
				{vision && (
					<mask id={`${prefix}-vm`} maskUnits="userSpaceOnUse" x={0} y={0} width={100} height={100}>
						{/* white = washed down, black = what the token can see */}
						<rect x={0} y={0} width={100} height={100} fill="white" />
						<polygon points={ringPoints(vision.ring)} fill="black" />
					</mask>
				)}
			</defs>

			{lights.map((light, index) => {
				const key = defsKeys[index]!;
				return (
					<circle
						key={light.id}
						cx={r3(light.origin.x * 100)}
						cy={r3(light.origin.y * 100)}
						r={r3(light.dimRadius * 100)}
						fill={`url(#${key}-g)`}
						clipPath={`url(#${key}-c)`}
					/>
				);
			})}

			{vision && (
				<g>
					<rect
						x={0}
						y={0}
						width={100}
						height={100}
						fill="var(--map-fog-fill)"
						opacity={0.45}
						mask={`url(#${prefix}-vm)`}
					/>
					<polygon
						points={ringPoints(vision.ring)}
						fill="none"
						stroke="var(--color-accent)"
						strokeWidth={1.2}
						strokeDasharray="3 2"
						vectorEffect="non-scaling-stroke"
						opacity={0.9}
					/>
				</g>
			)}
		</svg>
	);
}
