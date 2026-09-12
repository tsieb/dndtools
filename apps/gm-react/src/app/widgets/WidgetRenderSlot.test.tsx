// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WidgetErrorBoundary, WidgetPlaceholder } from './WidgetRenderSlot';
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
