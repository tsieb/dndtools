// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LoadingRegion } from './screen-kit';

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

describe('LoadingRegion announces that something is loading', () => {
	it('carries its label as CONTENT, not just as a name', () => {
		// A live region announces its CONTENT. The seven regions this replaces named themselves with
		// `aria-label` and wrapped nothing but `<Skeleton>`, which is `aria-hidden` at all three of
		// its return paths — so the region was permanently empty and said nothing at all.
		act(() =>
			root.render(
				<LoadingRegion label="Loading devices">
					<span aria-hidden="true">shimmer</span>
				</LoadingRegion>,
			),
		);
		const region = container.querySelector('[role="status"]') as HTMLElement;
		expect(region).not.toBeNull();
		expect(region.textContent).toContain('Loading devices');
	});

	it('keeps the announcement out of the visible layout', () => {
		act(() => root.render(<LoadingRegion label="Loading invites" />));
		const text = container.querySelector('[role="status"]')!.firstElementChild as HTMLElement;
		expect(text.textContent).toBe('Loading invites');
		expect(text.style.position).toBe('absolute');
		expect(text.style.clipPath).toBe('inset(50%)');
	});

	it('passes its own layout style through, so call sites keep their skeleton stack', () => {
		act(() =>
			root.render(<LoadingRegion label="Loading modules" style={{ gap: 12, display: 'flex' }} />),
		);
		const region = container.querySelector('[role="status"]') as HTMLElement;
		expect(region.style.gap).toBe('12px');
		expect(region.style.display).toBe('flex');
	});
});

describe('no screen still hides a loading announcement behind aria-label', () => {
	// The defect is trivially reintroduced by copying a neighbouring panel, and it is invisible on
	// screen — nothing but this scan would catch the next one.
	// RC-STB-2.6 split Community.tsx into screens/community/; the three tabs that load remote data
	// are the ones this scan is about. Paths, not bare file names, so a later split re-points here.
	const SCREENS = [
		'community/Discover.tsx',
		'community/Publish.tsx',
		'community/Wiki.tsx',
		'Extensions.tsx',
		'Settings.tsx',
	];

	for (const file of SCREENS) {
		it(`${file} uses LoadingRegion rather than an empty status region`, () => {
			// Resolved from the repo root (where the app vitest project runs), not from
			// `import.meta.url` — under the jsdom environment that resolves against the document URL.
			const src = readFileSync(`${process.cwd()}/apps/gm-react/src/screens/${file}`, 'utf8');
			expect(src).not.toMatch(/aria-label="Loading/);
			expect(src).toContain('<LoadingRegion');
		});
	}
});
