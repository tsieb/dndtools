// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapFogView } from '@dndtools/core';
import { FOG_REVEAL_FADE_MS, FogRevealFlash, useFogRevealFlash } from './fogRegions';

/**
 * RC-MAP-2.4 — the live fog reveal's MOTION half.
 *
 * Two things have to hold for the reveal to be honest. The flash must appear only for ground that
 * was JUST uncovered for this viewer — never on the first sight of a map (a player joining mid-
 * session would otherwise watch the whole session's reveals replay) and never for a conceal. And the
 * fade must be the declared 0.8s ease-out that the app's motion contract can collapse: the animation
 * is declared with `animation-fill-mode: both`, so under `data-motion="reduced"`/`"none"`, where
 * `styles/index.css` forces every animation to ~0ms, the wash rests on its END frame and the reveal
 * is simply static rather than absent.
 */

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	vi.useRealTimers();
});

function fogOp(id: string, kind: 'reveal' | 'conceal'): MapFogView {
	return {
		id,
		layerId: 'layer-1',
		kind,
		region: { shape: 'rect', x: 0.2, y: 0.2, w: 0.3, h: 0.3 },
		visibility: 'player-visible',
		sequence: Number(id.replace(/\D/g, '')) || 0,
	};
}

/** A minimal surface: the hook plus the flash, exactly how MapCanvas and StageMap compose them. */
function Surface({ fog, mapId }: { fog: MapFogView[]; mapId: string }) {
	const flashing = useFogRevealFlash(fog, mapId);
	return (
		<svg viewBox="0 0 100 100">
			<FogRevealFlash ops={fog} flashing={flashing} opacity="var(--map-fog-opacity-player)" />
		</svg>
	);
}

const flash = () => container.querySelector('[data-testid="fog-reveal-flash"]');
const fading = () => container.querySelectorAll('.dnd-fog-reveal');

describe('the fog reveal flash', () => {
	it('draws nothing on the first sight of a map, however much fog it already carries', () => {
		act(() => {
			root.render(<Surface mapId="map-1" fog={[fogOp('f1', 'conceal'), fogOp('f2', 'reveal')]} />);
		});
		expect(flash()).toBeNull();
	});

	it('fades the wash off a reveal that arrives after the baseline, and only that one', () => {
		const first = [fogOp('f1', 'conceal')];
		act(() => root.render(<Surface mapId="map-1" fog={first} />));
		expect(flash()).toBeNull();

		act(() => {
			root.render(
				<Surface mapId="map-1" fog={[...first, fogOp('f2', 'reveal'), fogOp('f3', 'conceal')]} />,
			);
		});
		expect(flash()).not.toBeNull();
		expect(fading()).toHaveLength(1);
	});

	it('declares a 0.8s ease-out fade that holds its end frame, so reduced motion lands static', () => {
		act(() => root.render(<Surface mapId="map-1" fog={[fogOp('f1', 'conceal')]} />));
		act(() => {
			root.render(<Surface mapId="map-1" fog={[fogOp('f1', 'conceal'), fogOp('f2', 'reveal')]} />);
		});
		const css = container.querySelector('style')?.textContent ?? '';
		expect(FOG_REVEAL_FADE_MS).toBe(800);
		expect(css).toContain('@keyframes dnd-fog-reveal{from{opacity:1}to{opacity:0}}');
		expect(css).toContain(
			`animation:dnd-fog-reveal ${FOG_REVEAL_FADE_MS}ms var(--easing-decelerate) both`,
		);
	});

	it('is inert: aria-hidden and out of the pointer path', () => {
		act(() => root.render(<Surface mapId="map-1" fog={[fogOp('f1', 'conceal')]} />));
		act(() => {
			root.render(<Surface mapId="map-1" fog={[fogOp('f1', 'conceal'), fogOp('f2', 'reveal')]} />);
		});
		const node = flash()!;
		expect(node.getAttribute('aria-hidden')).toBe('true');
		expect((node as SVGGElement).style.pointerEvents).toBe('none');
		expect(container.querySelectorAll('button, [tabindex]')).toHaveLength(0);
	});

	it('takes the spent overlay back out of the DOM once the fade is over', () => {
		vi.useFakeTimers();
		act(() => root.render(<Surface mapId="map-1" fog={[fogOp('f1', 'conceal')]} />));
		act(() => {
			root.render(<Surface mapId="map-1" fog={[fogOp('f1', 'conceal'), fogOp('f2', 'reveal')]} />);
		});
		expect(flash()).not.toBeNull();
		act(() => {
			vi.advanceTimersByTime(FOG_REVEAL_FADE_MS + 1);
		});
		expect(flash()).toBeNull();
	});

	it('re-baselines when a different map is projected instead of replaying its fog history', () => {
		act(() => root.render(<Surface mapId="map-1" fog={[fogOp('f1', 'conceal')]} />));
		act(() => {
			root.render(<Surface mapId="map-2" fog={[fogOp('g1', 'reveal'), fogOp('g2', 'reveal')]} />);
		});
		expect(flash()).toBeNull();
	});
});
