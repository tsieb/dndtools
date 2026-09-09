// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HelpTip as RawHelpTip } from './HelpTip.jsx';

type DsProps = { children?: React.ReactNode; title?: string };
const HelpTip = RawHelpTip as React.ComponentType<DsProps>;

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

describe('HelpTip', () => {
	it('renders title and text', () => {
		act(() => root.render(<HelpTip title="Tip">Use the controls with confidence.</HelpTip>));
		expect(container.textContent).toContain('Tip');
		expect(container.textContent).toContain('Use the controls with confidence.');
	});
});
