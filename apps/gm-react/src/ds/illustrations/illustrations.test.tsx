// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n';
import { EmptyState as RawEmptyState } from '../components/system/EmptyState.jsx';
import { INK, WASH } from './frame';
import { IllustrationGallery } from './IllustrationGallery';
import { ILLUSTRATION_KEYS, Illustration, isIllustrationKey } from './index';
import { RECORDS } from './records';
import { TABLE } from './table';
import { WORLD } from './world';

type EmptyStateProps = { icon?: string; illustration?: string; title?: React.ReactNode };
const EmptyState = RawEmptyState as React.ComponentType<EmptyStateProps>;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe('illustration registry', () => {
	it('holds 24 unique kebab-case keys, and no group shadows another', () => {
		const authored = [...Object.keys(TABLE), ...Object.keys(RECORDS), ...Object.keys(WORLD)];
		expect(new Set(authored).size).toBe(authored.length);
		expect(ILLUSTRATION_KEYS).toEqual(authored);
		expect(ILLUSTRATION_KEYS).toHaveLength(24);
		for (const key of ILLUSTRATION_KEYS) expect(key).toMatch(/^[a-z]+(-[a-z]+)*$/);
	});

	it('includes every key the roadmap names', () => {
		for (const key of [
			'knowledge-empty',
			'map-library',
			'session-board-empty',
			'note-tile-empty',
			'graph-empty',
			'characters-empty',
			'audio-empty',
			'community-empty',
			'play-waiting',
			'search-none',
		]) {
			expect(isIllustrationKey(key)).toBe(true);
		}
		expect(isIllustrationKey('toString')).toBe(false);
		expect(isIllustrationKey(undefined)).toBe(false);
	});
});

describe.each(ILLUSTRATION_KEYS)('illustration %s', (key) => {
	it('is decorative 160px accent line art with no fill beyond the wash', () => {
		act(() => root.render(<Illustration name={key} />));
		const svg = container.querySelector('svg');
		expect(svg).not.toBeNull();
		if (!svg) return;
		expect(svg.getAttribute('data-illustration')).toBe(key);
		expect(svg.getAttribute('width')).toBe('160');
		expect(svg.getAttribute('height')).toBe('160');
		expect(svg.getAttribute('viewBox')).toBe('0 0 160 160');
		expect(svg.getAttribute('aria-hidden')).toBe('true');

		const fills = [...svg.querySelectorAll('[fill]')].map((node) => node.getAttribute('fill'));
		expect(fills.filter((fill) => fill !== 'none' && fill !== WASH)).toEqual([]);
		const strokes = [...svg.querySelectorAll('[stroke]')].map((node) =>
			node.getAttribute('stroke'),
		);
		expect(strokes.filter((stroke) => stroke !== 'none' && stroke !== INK)).toEqual([]);
		expect(svg.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|style=/i);

		// Real line art rather than a wash alone, and the dashed "nothing here yet" line every
		// drawing in the set shares.
		const shapes = svg.querySelectorAll('path, circle, ellipse, rect, line, polyline, polygon');
		expect(shapes.length).toBeGreaterThanOrEqual(5);
		expect(svg.querySelector('[stroke-dasharray]')).not.toBeNull();
	});
});

describe('EmptyState illustration prop', () => {
	it('shows the named drawing in place of the icon badge', () => {
		act(() =>
			root.render(<EmptyState icon="search" illustration="search-none" title="No matches" />),
		);
		expect(container.querySelector('svg[data-illustration="search-none"]')).not.toBeNull();
		expect(container.querySelectorAll('svg')).toHaveLength(1);
		expect(container.querySelector('h3')?.textContent).toBe('No matches');
	});

	it('keeps the icon badge for an unknown key', () => {
		act(() =>
			root.render(<EmptyState icon="search" illustration="not-a-key" title="No matches" />),
		);
		expect(container.querySelector('svg[data-illustration]')).toBeNull();
		expect(container.querySelectorAll('svg')).toHaveLength(1);
	});

	it('keeps the icon badge when no illustration is given', () => {
		act(() => root.render(<EmptyState icon="search" title="No matches" />));
		expect(container.querySelector('svg[data-illustration]')).toBeNull();
		expect(container.querySelectorAll('svg')).toHaveLength(1);
	});
});

describe('IllustrationGallery', () => {
	it('uses each key exactly once, through EmptyState, with a caption for each', () => {
		act(() =>
			root.render(
				<I18nProvider>
					<IllustrationGallery />
				</I18nProvider>,
			),
		);
		const drawn = [...container.querySelectorAll('svg[data-illustration]')].map((svg) =>
			svg.getAttribute('data-illustration'),
		);
		expect(drawn).toEqual(ILLUSTRATION_KEYS);
		expect(container.querySelectorAll('h3')).toHaveLength(ILLUSTRATION_KEYS.length);
		expect(container.querySelector('h1')?.textContent).toBe('Empty-state illustrations');
		expect(container.querySelector('h2')?.textContent).toBe('24 keys');
		expect(container.textContent).not.toContain('ds.illustrations.');
	});
});
