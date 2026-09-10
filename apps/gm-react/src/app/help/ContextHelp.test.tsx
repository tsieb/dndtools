// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n';
import { ContextHelp } from './ContextHelp';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
	act(() =>
		root.render(
			<I18nProvider>
				<ContextHelp topic="recoveryKey" />
			</I18nProvider>,
		),
	);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const trigger = () =>
	container.querySelector<HTMLButtonElement>('button[aria-label="About the recovery key"]');
const panel = () => container.querySelector<HTMLElement>('[role="dialog"]');

describe('ContextHelp', () => {
	it('renders a named, collapsed trigger and no panel until pressed', () => {
		expect(trigger()).not.toBeNull();
		expect(trigger()!.getAttribute('aria-expanded')).toBe('false');
		expect(trigger()!.hasAttribute('aria-controls')).toBe(false);
		expect(panel()).toBeNull();
	});

	it('sizes the trigger from the density touch target (44px under touch density)', () => {
		expect(trigger()!.style.width).toBe('var(--density-touch-target)');
		expect(trigger()!.style.height).toBe('var(--density-touch-target)');
	});

	it('opens the topic on press and points the trigger at it', () => {
		act(() => trigger()!.click());
		const open = panel();
		expect(open).not.toBeNull();
		expect(open!.getAttribute('aria-label')).toBe('Recovery key');
		expect(open!.querySelector('[role="note"]')!.textContent).toContain(
			'the only way back into your encrypted backups',
		);
		expect(trigger()!.getAttribute('aria-expanded')).toBe('true');
		expect(trigger()!.getAttribute('aria-controls')).toBe(open!.id);
	});

	it('closes on a second press of the trigger', () => {
		act(() => trigger()!.click());
		act(() => trigger()!.click());
		expect(panel()).toBeNull();
		expect(trigger()!.getAttribute('aria-expanded')).toBe('false');
	});

	it('closes on Escape', () => {
		act(() => trigger()!.click());
		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(panel()).toBeNull();
	});
});
