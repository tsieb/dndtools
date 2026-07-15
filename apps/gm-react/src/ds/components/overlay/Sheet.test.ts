// @vitest-environment jsdom

import { act, createElement, type ComponentType, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet.jsx';

const TestSheet = Sheet as ComponentType<{
	open: boolean;
	title: string;
	onClose: () => void;
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

describe('Sheet focus', () => {
	it('keeps focus in place across rerenders and invokes the latest close callback', async () => {
		const firstClose = vi.fn();
		const latestClose = vi.fn();
		const renderSheet = (onClose: () => void) =>
			root.render(
				createElement(
					TestSheet,
					{ open: true, title: 'Filters', onClose },
					createElement('button', { id: 'stay-focused' }, 'Apply'),
				),
			);

		await act(async () => renderSheet(firstClose));
		await act(async () => vi.runAllTimers());
		const focused = container.querySelector<HTMLButtonElement>('#stay-focused')!;
		focused.focus();

		await act(async () => renderSheet(latestClose));
		expect(document.activeElement).toBe(focused);

		await act(async () => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(firstClose).not.toHaveBeenCalled();
		expect(latestClose).toHaveBeenCalledTimes(1);
	});
});
