// @vitest-environment jsdom

import { act, createElement, type ComponentType, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';
import { Sheet } from './Sheet';
import { Popover } from '../core/Popover';
import { handlePlatformBack } from '../../../platform/backNavigation';

const TestDialog = Dialog as ComponentType<{
	open: boolean;
	title: string;
	onClose: () => void;
	initialFocus?: string;
	dismissible?: boolean;
	children?: ReactNode;
}>;
const TestPopover = Popover as ComponentType<{ open: boolean; children?: ReactNode }>;

const tab = (shiftKey = false) => {
	const event = new KeyboardEvent('keydown', {
		key: 'Tab',
		shiftKey,
		bubbles: true,
		cancelable: true,
	});
	document.dispatchEvent(event);
	return event;
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	vi.useFakeTimers();
	(
		globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.useRealTimers();
	delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('Dialog focus', () => {
	it('focuses an explicitly selected safe action on open', async () => {
		await act(async () => {
			root.render(
				createElement(
					TestDialog,
					{ open: true, title: 'Replace vault?', onClose: vi.fn(), initialFocus: '#cancel' },
					createElement('button', { id: 'confirm' }, 'Replace'),
					createElement('button', { id: 'cancel' }, 'Cancel'),
				),
			);
		});
		await act(async () => {
			vi.runAllTimers();
		});
		expect(document.activeElement).toBe(document.querySelector('#cancel'));
	});

	it('keeps focus in place across rerenders and invokes the latest close callback', async () => {
		const firstClose = vi.fn();
		const latestClose = vi.fn();
		const renderDialog = (onClose: () => void) =>
			root.render(
				createElement(
					TestDialog,
					{ open: true, title: 'Account', onClose },
					createElement('button', { id: 'stay-focused' }, 'Save'),
				),
			);

		await act(async () => renderDialog(firstClose));
		await act(async () => vi.runAllTimers());
		const focused = document.querySelector<HTMLButtonElement>('#stay-focused')!;
		focused.focus();

		await act(async () => renderDialog(latestClose));
		expect(document.activeElement).toBe(focused);

		await act(async () => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(firstClose).not.toHaveBeenCalled();
		expect(latestClose).toHaveBeenCalledTimes(1);
	});
});

for (const Overlay of [TestDialog, Sheet as typeof TestDialog]) {
	it(`${Overlay.name} skips unavailable controls and wraps Tab from the panel`, async () => {
		await act(async () =>
			root.render(
				createElement(
					Overlay,
					{ open: true, title: 'Actions', onClose: vi.fn() },
					createElement('button', { tabIndex: -2 }, 'Skip'),
					createElement('fieldset', { disabled: true }, createElement('button', {}, 'Disabled')),
					createElement('div', { hidden: true }, createElement('button', {}, 'Hidden')),
					createElement('button', { id: 'eligible' }, 'Action'),
				),
			),
		);
		await act(async () => vi.runAllTimers());
		const action = document.querySelector<HTMLButtonElement>('#eligible')!;
		expect(document.activeElement).toBe(action);
		const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
		expect(document.getElementById(panel.getAttribute('aria-labelledby')!)?.textContent).toBe(
			'Actions',
		);
		panel.focus();
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
		);
		expect(document.activeElement).toBe(action);
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
		);
		expect(document.activeElement).toBe(panel.querySelector('button'));
	});

	// A Popover/menu nested in the panel owns ESCAPE, but it implements no Tab trap of its own
	// (core/Popover.jsx handles Escape, outside pointerdown and Back only). Standing down for it —
	// i.e. gating Tab on escape ownership — let Tab walk out of the modal entirely. Live path: the
	// phone map editor's "Map panels" Sheet and the layer-row menu rendered inline inside it.
	it(`${Overlay.name} keeps trapping Tab while a nested non-trapping popover is open`, async () => {
		await act(async () =>
			root.render(
				createElement(
					Overlay,
					{ open: true, title: 'Panels', dismissible: false, onClose: vi.fn() },
					createElement('button', { id: 'outer-first' }, 'Outer'),
					createElement(
						TestPopover,
						{ open: true },
						createElement('button', { id: 'menu-last' }, 'Rename'),
					),
				),
			),
		);
		await act(async () => vi.runAllTimers());
		const menuItem = document.querySelector<HTMLButtonElement>('#menu-last')!;
		expect(document.activeElement).toBe(menuItem);
		const forward = tab();
		expect(forward.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(document.querySelector('#outer-first'));
		const backward = tab(true);
		expect(backward.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(menuItem);
	});

	// The flip side of the same guard: a nested popover that focuses nothing (no focusable control
	// inside it) must not cost the overlay its own entry focus.
	it(`${Overlay.name} still takes entry focus when a nested popover has nothing to focus`, async () => {
		await act(async () =>
			root.render(
				createElement(
					Overlay,
					{ open: true, title: 'Panels', dismissible: false, onClose: vi.fn() },
					createElement('button', { id: 'outer-first' }, 'Outer'),
					createElement(TestPopover, { open: true }, createElement('p', {}, 'No controls')),
				),
			),
		);
		await act(async () => vi.runAllTimers());
		expect(document.activeElement).toBe(document.querySelector('#outer-first'));
	});

	// Focusable-but-not-tabbable descendants (tabindex=-1 rows, <iframe>, media with controls) are
	// still INSIDE the trap. Treating "not in the tabbable list" as "outside" took focus off them.
	it(`${Overlay.name} lets Tab move on from a focusable non-tabbable descendant`, async () => {
		await act(async () =>
			root.render(
				createElement(
					Overlay,
					{ open: true, title: 'Panels', dismissible: false, onClose: vi.fn() },
					createElement('button', { id: 'outer-first' }, 'Outer'),
					createElement('div', { id: 'row', tabIndex: -1 }, 'Row'),
					createElement('button', { id: 'outer-last' }, 'Last'),
				),
			),
		);
		await act(async () => vi.runAllTimers());
		const row = document.querySelector<HTMLElement>('#row')!;
		row.focus();
		expect(document.activeElement).toBe(row);
		const forward = tab();
		expect(forward.defaultPrevented).toBe(false);
		expect(document.activeElement).toBe(row);
	});

	it(`${Overlay.name} consumes Android Back and restores its opener`, async () => {
		const opener = document.createElement('button');
		document.body.append(opener);
		opener.focus();
		const onClose = vi.fn(() => root.render(null));
		await act(async () =>
			root.render(createElement(Overlay, { open: true, title: 'Actions', onClose })),
		);
		await act(async () => vi.runAllTimers());
		const leave = vi.fn();
		await act(async () => {
			expect(
				await handlePlatformBack({
					atRootDestination: true,
					canGoBack: false,
					navigateBack: leave,
					navigateToRoot: leave,
					minimize: leave,
				}),
			).toBe('overlay');
		});
		expect(onClose).toHaveBeenCalledOnce();
		expect(leave).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(opener);
		opener.remove();
	});
}

it('leaves Tab and initial focus to a simultaneously mounted nested sheet', async () => {
	await act(async () =>
		root.render(
			createElement(
				TestDialog,
				{ open: true, title: 'Outer', onClose: vi.fn() },
				createElement('button', { id: 'outer-action' }, 'Outer action'),
				createElement(
					Sheet as typeof TestDialog,
					{ open: true, title: 'Inner', onClose: vi.fn() },
					createElement('button', { id: 'inner-action' }, 'Inner action'),
				),
			),
		),
	);
	await act(async () => vi.runAllTimers());
	const inner = document.querySelector<HTMLButtonElement>('#inner-action')!;
	expect(document.activeElement).toBe(inner);
	document.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
	);
	expect(document.activeElement).toBe(inner.closest('[role="dialog"]')!.querySelector('button'));
});

// jsdom has no layout engine: assert the viewport-containing-block contract here;
// help-menu.spec.ts checks actual panel and scrim geometry in Chromium.
it('portals outside a transformed launcher and constrains the panel to the viewport', async () => {
	container.style.transform = 'translateZ(0)';
	container.style.height = '26px';
	await act(async () =>
		root.render(
			createElement(
				TestDialog,
				{
					open: true,
					title: 'Viewport dialog',
					onClose: vi.fn(),
				},
				createElement('div', { style: { height: 600 } }, 'Tall content'),
			),
		),
	);
	const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
	const scrim = panel.parentElement!;
	expect(container.contains(panel)).toBe(false);
	expect(scrim.parentElement).toBe(document.body);
	// No ancestor may establish a containing block for fixed descendants, so the scrim resolves
	// against the viewport and the panel is bounded by it rather than by the 26px launcher.
	for (let node = scrim.parentElement; node; node = node.parentElement) {
		const style = getComputedStyle(node);
		expect(style.transform === '' || style.transform === 'none').toBe(true);
		expect(style.filter === '' || style.filter === 'none').toBe(true);
	}
	expect(scrim.style.position).toBe('fixed');
	expect(scrim.style.inset).toBe('0px');
	expect(panel.style.maxHeight).toBe('100%');
	expect(panel.style.maxWidth).toBe('100%');
	await act(async () => root.render(null));
	expect(document.querySelector('[role="dialog"]')).toBeNull();
});

// The portal moves the panel out of whatever opened it, but escape and trap ownership are decided by
// DOM containment. A confirm opened from a Sheet (End session from Table controls) or a Dialog
// (Keyboard shortcuts from Help) must still own Escape and Tab alone.
for (const Outer of [Sheet as typeof TestDialog, TestDialog]) {
	it(`a Dialog opened inside a ${Outer.name} owns Escape and Tab until it closes`, async () => {
		const outerClose = vi.fn();
		const innerClose = vi.fn();
		await act(async () =>
			root.render(
				createElement(
					Outer,
					{ open: true, title: 'Outer', onClose: outerClose },
					createElement('button', { id: 'outer-action' }, 'Outer action'),
					createElement(
						TestDialog,
						{ open: true, title: 'Inner', onClose: innerClose },
						createElement('button', { id: 'inner-first' }, 'First'),
						createElement('button', { id: 'inner-last' }, 'Last'),
					),
				),
			),
		);
		await act(async () => vi.runAllTimers());
		expect(document.activeElement).toBe(document.querySelector('#inner-first'));
		document.querySelector<HTMLButtonElement>('#inner-last')!.focus();
		const forward = tab();
		expect(forward.defaultPrevented).toBe(true);
		const innerPanel = document.querySelector('#inner-first')!.closest('[role="dialog"]')!;
		expect(innerPanel.contains(document.activeElement)).toBe(true);

		await act(async () => {
			document.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			);
		});
		expect(innerClose).toHaveBeenCalledOnce();
		expect(outerClose).not.toHaveBeenCalled();
	});
}

it('keeps an exempt surface inside the app root reachable while the portaled dialog is open', async () => {
	// React owns `container`'s children, so stand the app root up beside it.
	const appRoot = document.createElement('div');
	const toasts = document.createElement('div');
	toasts.setAttribute('data-modal-exempt', '');
	const sibling = document.createElement('main');
	appRoot.append(toasts, sibling);
	document.body.append(appRoot);
	await act(async () =>
		root.render(createElement(TestDialog, { open: true, title: 'Plan', onClose: vi.fn() })),
	);
	expect(toasts.hasAttribute('inert')).toBe(false);
	expect(toasts.getAttribute('aria-hidden')).toBeNull();
	expect(appRoot.hasAttribute('inert')).toBe(false);
	expect(sibling.hasAttribute('inert')).toBe(true);
	expect(sibling.getAttribute('aria-hidden')).toBe('true');
	const scrim = document.querySelector('[role="dialog"]')!.parentElement!;
	expect(scrim.hasAttribute('inert')).toBe(false);

	await act(async () => root.render(null));
	expect(sibling.hasAttribute('inert')).toBe(false);
	expect(sibling.getAttribute('aria-hidden')).toBeNull();
	appRoot.remove();
});

it('isolates an unrelated dialog underneath even though open scrims are exempt', async () => {
	const otherContainer = document.createElement('div');
	document.body.append(otherContainer);
	const otherRoot = createRoot(otherContainer);
	await act(async () =>
		otherRoot.render(createElement(TestDialog, { open: true, title: 'First', onClose: vi.fn() })),
	);
	const first = document.querySelector('[role="dialog"]')!.parentElement!;
	await act(async () =>
		root.render(createElement(TestDialog, { open: true, title: 'Second', onClose: vi.fn() })),
	);
	expect(first.hasAttribute('inert')).toBe(true);
	await act(async () => root.render(null));
	expect(first.hasAttribute('inert')).toBe(false);
	await act(async () => otherRoot.unmount());
	otherContainer.remove();
});
