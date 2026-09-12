// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Callout as RawCallout } from './Callout.jsx';

type DsProps = { children?: React.ReactNode; title?: string };
const Callout = RawCallout as React.ComponentType<DsProps>;

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

describe('Callout', () => {
	it('renders title and body', () => {
		act(() => root.render(<Callout title="Tip">Use focus styles.</Callout>));
		expect(container.textContent).toContain('Tip');
		expect(container.textContent).toContain('Use focus styles.');
	});
});
