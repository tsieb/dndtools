// @vitest-environment jsdom

import { act, useEffect } from 'react';
import type { BoardWidget } from '../board-helpers';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ThemeAwareWidgetHost,
	WidgetErrorBoundary,
	WidgetPlaceholder,
	WidgetStyleScope,
} from './WidgetRenderSlot';
import { WIDGET_PLACEHOLDER_COPY } from './resolveRenderer';

/**
 * RC-WID-1.1 — the two guarantees the render slot makes beyond the resolver's decision: a renderer
 * that throws collapses to the placeholder instead of unwinding the board, and the placeholder says
 * "disabled, preserved" rather than leaving an unexplained empty frame.
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
	vi.restoreAllMocks();
});

function Boom(): never {
	throw new Error('renderer exploded');
}

describe('WidgetPlaceholder', () => {
	it('shows the disabled-but-preserved copy with the diagnostic', () => {
		act(() => root.render(<WidgetPlaceholder diagnostic="Its widget package is turned off." />));
		const text = container.textContent ?? '';
		expect(text).toContain(WIDGET_PLACEHOLDER_COPY.label);
		expect(text).toContain('Its widget package is turned off.');
		expect(text).toContain(WIDGET_PLACEHOLDER_COPY.reassurance);
	});
});

describe('WidgetStyleScope', () => {
	it('sets the declared variables as var() references on a box-less wrapper (RC-WID-2.4)', () => {
		act(() =>
			root.render(
				<WidgetStyleScope variables={{ '--widget-accent': 'var(--color-accent)' }}>
					<span>Body</span>
				</WidgetStyleScope>,
			),
		);
		const scope = container.querySelector<HTMLElement>('[data-widget-style-scope]');
		expect(scope).not.toBeNull();
		expect(scope!.style.getPropertyValue('--widget-accent')).toBe('var(--color-accent)');
		expect(scope!.style.display).toBe('contents');
		expect(scope!.textContent).toBe('Body');
	});
});

describe('WidgetErrorBoundary', () => {
	it('turns a renderer that throws into the placeholder, and keeps its siblings alive', () => {
		// React logs the caught error; silence it so a PASSING test does not print a stack.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		act(() =>
			root.render(
				<>
					<WidgetErrorBoundary widgetId="w1">
						<Boom />
					</WidgetErrorBoundary>
					<WidgetErrorBoundary widgetId="w2">
						<span>Neighbour body</span>
					</WidgetErrorBoundary>
				</>,
			),
		);
		const text = container.textContent ?? '';
		expect(text).toContain(WIDGET_PLACEHOLDER_COPY.crashed);
		expect(text).toContain(WIDGET_PLACEHOLDER_COPY.label);
		expect(text).toContain('Neighbour body');
	});

	it('gives a different widget in the same slot a fresh attempt', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		act(() =>
			root.render(
				<WidgetErrorBoundary widgetId="w1">
					<Boom />
				</WidgetErrorBoundary>,
			),
		);
		expect(container.textContent).toContain(WIDGET_PLACEHOLDER_COPY.crashed);
		act(() =>
			root.render(
				<WidgetErrorBoundary widgetId="w2">
					<span>Replacement body</span>
				</WidgetErrorBoundary>,
			),
		);
		expect(container.textContent).toBe('Replacement body');
	});
});

describe('ThemeAwareWidgetHost', () => {
	it.each([true, false])(
		'refreshes only theme consumers (followsTheme=%s)',
		async (followsTheme) => {
			const mounted = vi.fn();
			const unmounted = vi.fn();
			function Host() {
				useEffect(() => {
					mounted();
					return unmounted;
				}, []);
				return <span>Guest</span>;
			}
			const original = document.documentElement.getAttribute('data-theme');
			try {
				document.documentElement.setAttribute('data-theme', 'tavern');
				act(() =>
					root.render(
						<ThemeAwareWidgetHost
							Host={Host}
							followsTheme={followsTheme}
							widget={{ id: 'test' } as BoardWidget}
						/>,
					),
				);
				expect(mounted).toHaveBeenCalledTimes(1);
				await act(async () => {
					document.documentElement.setAttribute('data-theme', 'parchment');
				});
				expect(mounted).toHaveBeenCalledTimes(followsTheme ? 2 : 1);
				expect(unmounted).toHaveBeenCalledTimes(followsTheme ? 1 : 0);
				await act(async () => {
					document.documentElement.setAttribute('data-theme', 'parchment');
				});
				expect(mounted).toHaveBeenCalledTimes(followsTheme ? 2 : 1);
				act(() => root.render(null));
				await act(async () => {
					document.documentElement.setAttribute('data-theme', 'tavern');
				});
				expect(mounted).toHaveBeenCalledTimes(followsTheme ? 2 : 1);
			} finally {
				if (original === null) document.documentElement.removeAttribute('data-theme');
				else document.documentElement.setAttribute('data-theme', original);
			}
		},
	);
});
