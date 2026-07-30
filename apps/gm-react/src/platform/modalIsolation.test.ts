// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { isolateModalSiblings } from './modalIsolation';

afterEach(() => {
	document.body.replaceChildren();
});

describe('modal accessibility isolation', () => {
	it('isolates every sibling branch and restores its exact prior state', () => {
		const app = document.createElement('main');
		const page = document.createElement('section');
		const pageContent = document.createElement('button');
		const overlay = document.createElement('div');
		const outsideApp = document.createElement('aside');
		const preHidden = document.createElement('div');
		preHidden.setAttribute('aria-hidden', 'false');
		preHidden.setAttribute('inert', '');
		page.append(pageContent, overlay);
		app.append(page, preHidden);
		document.body.append(app, outsideApp);

		const restore = isolateModalSiblings(overlay);

		for (const element of [pageContent, preHidden, outsideApp]) {
			expect(element.getAttribute('aria-hidden')).toBe('true');
			expect(element.hasAttribute('inert')).toBe(true);
		}
		expect(page.hasAttribute('aria-hidden')).toBe(false);
		expect(overlay.hasAttribute('inert')).toBe(false);

		restore();

		expect(pageContent.hasAttribute('aria-hidden')).toBe(false);
		expect(pageContent.hasAttribute('inert')).toBe(false);
		expect(outsideApp.hasAttribute('aria-hidden')).toBe(false);
		expect(outsideApp.hasAttribute('inert')).toBe(false);
		expect(preHidden.getAttribute('aria-hidden')).toBe('false');
		expect(preHidden.hasAttribute('inert')).toBe(true);
	});

	it('preserves an outer modal isolation while a nested modal opens and closes', () => {
		const underlying = document.createElement('div');
		const outer = document.createElement('div');
		const outerContent = document.createElement('button');
		const inner = document.createElement('div');
		outer.append(outerContent, inner);
		document.body.append(underlying, outer);

		const restoreOuter = isolateModalSiblings(outer);
		const restoreInner = isolateModalSiblings(inner);
		restoreInner();

		expect(underlying.getAttribute('aria-hidden')).toBe('true');
		expect(underlying.hasAttribute('inert')).toBe(true);
		expect(outerContent.hasAttribute('aria-hidden')).toBe(false);

		restoreOuter();
		expect(underlying.hasAttribute('aria-hidden')).toBe(false);
		expect(underlying.hasAttribute('inert')).toBe(false);
	});
	it('leaves a [data-modal-exempt] branch reachable', () => {
		// The toast viewport is a SIBLING of every modal surface, so isolating it made the app's only
		// feedback channel `inert` and screen-reader-invisible for anything raised from inside a
		// dialog, sheet, map editor or display overlay — which is exactly where a refusal message
		// matters most. The Dismiss button inside it was dead, too.
		const toasts = document.createElement('div');
		toasts.setAttribute('data-modal-exempt', '');
		const dismiss = document.createElement('button');
		toasts.append(dismiss);
		const pageContent = document.createElement('div');
		const modal = document.createElement('div');
		document.body.append(pageContent, toasts, modal);

		const restore = isolateModalSiblings(modal);

		expect(pageContent.hasAttribute('inert'), 'ordinary siblings still isolate').toBe(true);
		expect(toasts.hasAttribute('inert')).toBe(false);
		expect(toasts.hasAttribute('aria-hidden')).toBe(false);

		restore();
		expect(toasts.hasAttribute('inert')).toBe(false);
		expect(pageContent.hasAttribute('inert')).toBe(false);
	});
});
