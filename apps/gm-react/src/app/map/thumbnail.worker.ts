import { getProp, normalizeFogRegion, type MapFeature } from '@dndtools/core';
import type { ThumbnailModel, ThumbnailResult } from './thumbnail';

const escape = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
	);
const points = (values: { x: number; y: number }[]) =>
	values.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');
const category: Record<string, string> = {
	base: 'base',
	terrain: 'height',
	roads: 'roads',
	poi: 'poi',
	fog: 'fog',
	'dm-annotations': 'dm',
	'player-overlay': 'player',
};
const terrain: Record<string, string> = {
	grass: 'height',
	forest: 'terrain',
	water: 'water',
	mountain: 'height',
	stone: 'base',
	dirt: 'roads',
	desert: 'sand',
	snow: 'snow',
	swamp: 'swamp',
	lava: 'lava',
};

/** Worker-only SVG serialization: no DOM, React refresh runtime, raster assets or raw map state. */
export function renderThumbnail({ view, layers, colors }: ThumbnailModel): ThumbnailResult {
	const start = performance.now();
	const color = (key: string) => escape(colors[key] || 'gray');
	const circle = (x: number, y: number, radius: number, paint: string) =>
		`<circle cx="${x * 100}" cy="${y * 100}" r="${radius}" fill="${paint}"/>`;
	const featureSvg = (feature: MapFeature, base: string): string => {
		const p = feature.points[0];
		if (!p) return '';
		const props = feature.props ?? {};
		const paint = feature.style.startsWith('terrain:')
			? color(
					(
						{
							sand: '--color-status-warning',
							snow: '--color-text-tertiary',
							lava: '--color-status-error',
						} as Record<string, string>
					)[feature.style.slice(8)] ?? `--layer-${terrain[feature.style.slice(8)] ?? 'height'}`,
				)
			: base;
		const pts = points(feature.points);
		switch (feature.kind) {
			case 'fill':
			case 'room': {
				const xs = feature.points.map((v) => v.x * 100),
					ys = feature.points.map((v) => v.y * 100);
				return `<rect x="${Math.min(...xs)}" y="${Math.min(...ys)}" width="${Math.max(...xs) - Math.min(...xs)}" height="${Math.max(...ys) - Math.min(...ys)}" fill="${paint}" fill-opacity=".3" stroke="${paint}" stroke-width=".5"/>`;
			}
			case 'polygon':
				return `<polygon points="${pts}" fill="${props.hole === true ? color('--map-canvas-bg') : paint}" fill-opacity=".4" stroke="${paint}" stroke-width=".4"/>`;
			case 'water':
				return feature.style.includes('river') ||
					props.biome === 'river' ||
					props.flow !== undefined
					? `<polyline points="${pts}" fill="none" stroke="${color('--layer-water')}" stroke-width="${typeof props.width === 'number' ? Math.max(0.4, props.width * 100) : 1.6}"/>`
					: `<polygon points="${pts}" fill="${color('--layer-water')}" fill-opacity=".45"/>`;
			case 'text':
				return `<text x="${p.x * 100}" y="${p.y * 100}" fill="${paint}" font-size="${typeof props.size === 'number' ? props.size : 3}" text-anchor="middle">${escape(typeof props.text === 'string' ? props.text : '')}</text>`;
			case 'prop': {
				const prop = getProp(feature.style);
				return prop
					? `<path d="${escape(prop.glyph)}" fill="${paint}" fill-rule="evenodd" transform="translate(${p.x * 100} ${p.y * 100}) rotate(${typeof props.rotation === 'number' ? props.rotation : 0}) scale(${1.5 * prop.defaultScale * (typeof props.scale === 'number' ? props.scale : 1)})"/>`
					: circle(p.x, p.y, 1, paint);
			}
			case 'marker':
				return circle(p.x, p.y, 1.1, paint);
			case 'light':
				return `<g opacity=".3">${circle(p.x, p.y, typeof props.radius === 'number' ? props.radius * 100 : 6, paint)}</g>${circle(p.x, p.y, 0.9, paint)}`;
			default:
				return `<polyline points="${pts}" fill="none" stroke="${paint}" stroke-width="${feature.kind === 'wall' || feature.kind === 'door' ? 0.8 : 0.5}"${feature.kind === 'road' || props.state === 'open' ? ' stroke-dasharray="2 1"' : ''}/>`;
		}
	};
	const enabled = new Set(layers.filter((l) => l.enabled).map((l) => l.layerId));
	const parts = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 100 100" preserveAspectRatio="none"><rect width="100" height="100" fill="${color('--map-canvas-bg')}"/>`,
	];
	for (const layer of layers.filter((l) => l.enabled).sort((a, b) => a.order - b.order)) {
		parts.push(
			`<g opacity="${layer.opacity}">`,
			...layer.content.map((f) =>
				featureSvg(f, color(`--layer-${category[layer.category] ?? 'custom'}`)),
			),
			'</g>',
		);
	}
	for (const route of view.routes.filter((r) => enabled.has(r.layerId)))
		parts.push(
			`<polyline points="${points(route.waypoints.map((w) => w.position))}" fill="none" stroke="${color('--layer-roads')}" stroke-width=".6" stroke-dasharray="2 1"/>`,
		);
	const fog = view.fog
		.filter((op) => enabled.has(op.layerId))
		.sort((a, b) => a.sequence - b.sequence);
	if (fog.length) {
		parts.push(
			'<defs><mask id="fog" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="black"/>',
		);
		for (const op of fog) {
			const region = normalizeFogRegion(op.region),
				paint = op.kind === 'conceal' ? 'white' : 'black';
			if (region.shape === 'rect')
				parts.push(
					`<rect x="${region.x * 100}" y="${region.y * 100}" width="${region.w * 100}" height="${region.h * 100}" fill="${paint}"/>`,
				);
			else if (region.shape === 'polygon')
				parts.push(`<polygon points="${points(region.points)}" fill="${paint}"/>`);
			else {
				parts.push(
					`<polyline points="${points(region.points)}" fill="none" stroke="${paint}" stroke-width="${region.radius * 200}" stroke-linecap="round" stroke-linejoin="round"/>`,
				);
				for (const p of region.points) parts.push(circle(p.x, p.y, region.radius * 100, paint));
			}
		}
		parts.push(
			`</mask></defs><rect width="100" height="100" fill="${color('--map-fog-fill')}" mask="url(#fog)"/>`,
		);
	}
	for (const poi of view.pois.filter((p) => enabled.has(p.layerId)))
		parts.push(circle(poi.position.x, poi.position.y, 1.3, color('--layer-poi')));
	parts.push('</svg>');
	return {
		uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(parts.join(''))}`,
		durationMs: performance.now() - start,
	};
}

if (typeof self !== 'undefined' && typeof document === 'undefined') {
	self.onmessage = ({ data }: MessageEvent<{ id: number; model: ThumbnailModel }>) => {
		try {
			self.postMessage({ id: data.id, result: renderThumbnail(data.model) });
		} catch (error) {
			self.postMessage({
				id: data.id,
				error: error instanceof Error ? error.message : 'Thumbnail failed',
			});
		}
	};
}
