// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Tabs as RawTabs, tabPanelProps } from './Tabs.jsx';

// The DS ships as .jsx with `checkJs: false`, so tsc infers every prop that has no default as
// required. Re-type the import as an open prop bag rather than restating the component's contract.
type DsProps = Record<string, unknown> & { children?: React.ReactNode };
const Tabs = RawTabs as React.ComponentType<DsProps>;

// Tabs declared role="tablist"/role="tab" but emitted no `aria-controls`, and NO consumer in the app
// rendered a role="tabpanel" — so assistive tech got a naked tablist with no link to the content
// each tab governs (WCAG 4.1.2 / ARIA APG tabs pattern). `idBase` + `tabPanelProps` wire both ends.

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

function render(node: React.ReactNode): void {
	act(() => root.render(node));
}

const TABS = [
	{ id: 'playback', label: 'Playback' },
	{ id: 'presets', label: 'Presets' },
];

function tabs(): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
}

describe('Tabs ↔ tabpanel wiring', () => {
	it('points each tab at its panel, and the panel back at its tab', () => {
		render(
			<>
				<Tabs tabs={TABS} value="playback" onChange={() => {}} idBase="audio" />
				<div {...tabPanelProps('audio', 'playback')}>Playback body</div>
			</>,
		);

		const [playback] = tabs();
		const panelId = playback!.getAttribute('aria-controls');
		expect(panelId).toBe('audio-panel-playback');

		const panel = document.getElementById(panelId!);
		expect(panel).not.toBeNull();
		expect(panel!.getAttribute('role')).toBe('tabpanel');
		// The panel names itself from the tab, so the relationship resolves in both directions.
		expect(panel!.getAttribute('aria-labelledby')).toBe(playback!.id);
		expect(playback!.id).toBe('audio-tab-playback');
	});

	it('re-labels one shared panel element as the active tab changes', () => {
		// Consumers mount only the active body, so a single wrapper carries the panel identity.
		render(
			<>
				<Tabs tabs={TABS} value="presets" onChange={() => {}} idBase="audio" />
				<div {...tabPanelProps('audio', 'presets')}>Presets body</div>
			</>,
		);
		const presets = tabs()[1]!;
		expect(presets.getAttribute('aria-controls')).toBe('audio-panel-presets');
		expect(document.getElementById('audio-panel-presets')!.getAttribute('aria-labelledby')).toBe(
			presets.id,
		);
	});

	it('emits nothing without `idBase`, so an unwired consumer never dangles aria-controls', () => {
		// A tab pointing at an id that does not exist is worse for AT than no pointer at all.
		render(<Tabs tabs={TABS} value="playback" onChange={() => {}} />);
		for (const tab of tabs()) {
			expect(tab.hasAttribute('aria-controls')).toBe(false);
			expect(tab.id).toBe('');
		}
		expect(tabPanelProps(undefined, 'playback')).toEqual({});
	});

	it('sanitises ids so a tab id with spaces or punctuation still resolves', () => {
		render(
			<>
				<Tabs
					tabs={[{ id: 'dm only', label: 'DM only' }]}
					value="dm only"
					onChange={() => {}}
					idBase="scene view"
				/>
				<div {...tabPanelProps('scene view', 'dm only')}>Body</div>
			</>,
		);
		const tab = tabs()[0]!;
		const panelId = tab.getAttribute('aria-controls')!;
		expect(panelId).toBe('scene-view-panel-dm-only');
		// getElementById would fail on a raw id containing a space in a CSS selector context.
		expect(document.getElementById(panelId)).not.toBeNull();
	});

	it('keeps the roving tab stop and arrow-key selection it already had', () => {
		render(<Tabs tabs={TABS} value="playback" onChange={() => {}} idBase="audio" />);
		expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1]);
	});
});
