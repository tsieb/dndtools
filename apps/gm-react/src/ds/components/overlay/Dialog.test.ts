// @vitest-environment jsdom

import { act, createElement, type ComponentType, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog.jsx';

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
