// @vitest-environment jsdom

import { act, createElement, type ComponentType, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog.jsx';
import { Sheet } from './Sheet.jsx';
import { handlePlatformBack } from '../../../platform/backNavigation';

const TestDialog = Dialog as ComponentType<{
	open: boolean;
	title: string;
	onClose: () => void;
	initialFocus?: string;
	children?: ReactNode;
}>;

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
		expect(document.activeElement).toBe(container.querySelector('#cancel'));
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
		const focused = container.querySelector<HTMLButtonElement>('#stay-focused')!;
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
		const action = container.querySelector<HTMLButtonElement>('#eligible')!;
		expect(document.activeElement).toBe(action);
		const panel = container.querySelector<HTMLElement>('[role="dialog"]')!;
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
	const inner = container.querySelector<HTMLButtonElement>('#inner-action')!;
	expect(document.activeElement).toBe(inner);
	document.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
	);
	expect(document.activeElement).toBe(inner.closest('[role="dialog"]')!.querySelector('button'));
});
