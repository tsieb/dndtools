// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureSpotlight as RawFeatureSpotlight } from './FeatureSpotlight.jsx';

type DsProps = Record<string, unknown> & {
	title: string;
	description?: React.ReactNode;
	actionLabel?: string;
};
const FeatureSpotlight = RawFeatureSpotlight as React.ComponentType<DsProps>;

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

describe('FeatureSpotlight', () => {
	it('renders action and description', () => {
		const onAction = vi.fn();
		act(() =>
			root.render(
				<FeatureSpotlight
					title="Explore layouts"
					description="Try the new canvas controls."
					actionLabel="Open"
					onAction={onAction}
				/>,
			),
		);
		const action = container.querySelector('button');
		expect(action?.textContent).toBe('Open');
		act(() => action?.click());
		expect(onAction).toHaveBeenCalledTimes(1);
	});
});
