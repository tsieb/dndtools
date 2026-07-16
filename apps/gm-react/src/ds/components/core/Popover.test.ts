// @vitest-environment jsdom

import { act, createElement, Fragment, type ComponentType, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handlePlatformBack, resetBackHandlersForTest } from '../../../platform/backNavigation';
import { Dialog } from '../overlay/Dialog.jsx';
import { Popover } from './Popover.jsx';

const TestPopover = Popover as ComponentType<{
	open: boolean;
	title: string;
	onClose: () => void;
	children?: ReactNode;
}>;
const TestDialog = Dialog as ComponentType<{
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
	resetBackHandlersForTest();
	vi.useRealTimers();
	delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('Popover dismissal ordering', () => {
	it('uses the latest callback without moving beneath-dialog registration to the top', async () => {
		const firstPopoverClose = vi.fn();
		const latestPopoverClose = vi.fn();
		const dialogClose = vi.fn();
		const renderSurfaces = (popoverClose: () => void) =>
			root.render(
				createElement(
					Fragment,
					null,
					createElement(
						TestPopover,
						{ open: true, title: 'Layer opacity', onClose: popoverClose },
						'Opacity controls',
					),
					createElement(
						TestDialog,
						{ open: true, title: 'Delete map?', onClose: dialogClose },
						'Destructive confirmation',
					),
				),
			);

		await act(async () => renderSurfaces(firstPopoverClose));
		await act(async () => vi.runAllTimers());
		await act(async () => renderSurfaces(latestPopoverClose));

		await expect(
			handlePlatformBack({
				atRootDestination: false,
				canGoBack: true,
				navigateBack: vi.fn(),
				navigateToRoot: vi.fn(),
				minimize: vi.fn(),
			}),
		).resolves.toBe('overlay');
		expect(dialogClose).toHaveBeenCalledTimes(1);
		expect(firstPopoverClose).not.toHaveBeenCalled();
		expect(latestPopoverClose).not.toHaveBeenCalled();
	});
});
