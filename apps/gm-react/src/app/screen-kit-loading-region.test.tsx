// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProgressMeter } from '../ds';
import { I18nProvider } from '../i18n';
import { LoadingRegion, estimateRemainingMs, roundEtaMs } from './screen-kit';

/** What a screen reader reads out of a subtree: its text, minus anything `aria-hidden`. */
function spokenText(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
	if (node instanceof Element && node.getAttribute('aria-hidden') === 'true') return '';
	return Array.from(node.childNodes).map(spokenText).join('');
}

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

describe('LoadingRegion first-load skeletons (RC-DSN-3.4)', () => {
	it('stands a list in with rows, hidden from assistive tech', () => {
		act(() => root.render(<LoadingRegion label="Loading players" skeleton="list" rows={4} />));
		const region = container.querySelector('[role="status"]') as HTMLElement;
		const list = region.querySelector('[data-skeleton="list"]') as HTMLElement;
		expect(list.getAttribute('aria-hidden')).toBe('true');
		expect(list.querySelectorAll('[data-skeleton-row]')).toHaveLength(4);
		// The shimmer is decoration; the label is the only thing the region says.
		expect(spokenText(region)).toBe('Loading players');
	});

	it('defaults a list to three rows', () => {
		act(() => root.render(<LoadingRegion label="Loading notes" skeleton="list" />));
		expect(container.querySelectorAll('[data-skeleton-row]')).toHaveLength(3);
	});

	it('stands a canvas in with a surface that cannot collapse to nothing', () => {
		// A canvas container is usually sized by its content — the content that hasn't loaded.
		act(() => root.render(<LoadingRegion label="Loading map" skeleton="canvas" />));
		const canvas = container.querySelector('[data-skeleton="canvas"]') as HTMLElement;
		expect(canvas.getAttribute('aria-hidden')).toBe('true');
		expect(canvas.classList.contains('dnd-skeleton')).toBe(true);
		expect(canvas.style.minHeight).toBe('240px');
	});

	it('lets a bespoke skeleton win over the preset', () => {
		act(() =>
			root.render(
				<LoadingRegion label="Loading devices" skeleton="list">
					<span data-own="" aria-hidden="true" />
				</LoadingRegion>,
			),
		);
		expect(container.querySelector('[data-own]')).not.toBeNull();
		expect(container.querySelector('[data-skeleton]')).toBeNull();
	});
});

describe('LoadingRegion determinate progress with ETA copy (RC-DSN-3.4)', () => {
	const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);

	async function renderProgress(node: ReactNode) {
		await act(async () => root.render(<I18nProvider>{node}</I18nProvider>));
		const region = container.querySelector('[role="status"]') as HTMLElement;
		const bar = region.querySelector('[role="progressbar"]') as HTMLElement;
		return { region, bar };
	}

	it('shows a determinate bar with the time the work reports', async () => {
		const { region, bar } = await renderProgress(
			<LoadingRegion
				label="Backing up vault"
				progress={{ value: 40, remainingMs: 90_000, now: NOW }}
			/>,
		);
		expect(bar.getAttribute('aria-valuenow')).toBe('40');
		expect(bar.getAttribute('aria-valuemax')).toBe('100');
		expect(region.querySelector('[data-progress-eta]')!.textContent).toBe('in 2 minutes');
		expect(bar.getAttribute('aria-valuetext')).toBe('40%, in 2 minutes');
	});

	it('extrapolates the time left from the rate so far', async () => {
		// A quarter done in 30s → 90s to go → rounded up to whole minutes.
		const { bar } = await renderProgress(
			<LoadingRegion
				label="Importing compendium"
				progress={{ value: 25, startedAt: NOW - 30_000, now: NOW }}
			/>,
		);
		expect(bar.getAttribute('aria-valuetext')).toBe('25%, in 2 minutes');
	});

	it('reads the whole count against any max, not just percentages', async () => {
		const { bar } = await renderProgress(
			<LoadingRegion
				label="Generating dungeon"
				progress={{ value: 3, max: 12, remainingMs: 12_000, now: NOW }}
			/>,
		);
		expect(bar.getAttribute('aria-valuenow')).toBe('3');
		expect(bar.getAttribute('aria-valuemax')).toBe('12');
		expect(bar.getAttribute('aria-valuetext')).toBe('25%, in 15 seconds');
	});

	it('says nothing about time when there is no rate yet', async () => {
		const { region, bar } = await renderProgress(
			<LoadingRegion label="Syncing" progress={{ value: 1, startedAt: NOW - 400, now: NOW }} />,
		);
		expect(region.querySelector('[data-progress-eta]')).toBeNull();
		expect(bar.getAttribute('aria-valuetext')).toBeNull();
	});

	it('announces the label once rather than every tick', async () => {
		// Inside a polite live region, a changing "41%" / "in 2 minutes" text node is re-announced on
		// every progress event. The bar carries both in aria-valuetext; the region only says its label.
		const { region } = await renderProgress(
			<LoadingRegion
				label="Backing up vault"
				progress={{ value: 41, remainingMs: 90_000, now: NOW }}
			/>,
		);
		expect(region.textContent).toContain('41%');
		expect(region.textContent).toContain('in 2 minutes');
		expect(spokenText(region)).toBe('Backing up vault');
	});
});

describe('ProgressMeter ETA copy', () => {
	it('folds the ETA into the readout the bar announces', () => {
		act(() =>
			root.render(
				<ProgressMeter
					label="Difficulty"
					value={12}
					max={40}
					valueLabel="12 / 40 pts"
					eta="in 1 minute"
				/>,
			),
		);
		const bar = container.querySelector('[role="progressbar"]')!;
		expect(bar.getAttribute('aria-valuetext')).toBe('12 / 40 pts, in 1 minute');
	});

	it('keeps a node readout readable, since it has no string form for the bar', () => {
		act(() =>
			root.render(<ProgressMeter label="Load" value={2} max={4} valueLabel={<b>2 of 4</b>} />),
		);
		const readout = container.querySelector('b')!.parentElement!;
		expect(readout.getAttribute('aria-hidden')).toBeNull();
	});
});

describe('time-left estimation', () => {
	it('extrapolates linearly from the rate so far', () => {
		expect(estimateRemainingMs({ value: 50, startedAt: 0, now: 10_000 })).toBe(10_000);
		expect(estimateRemainingMs({ value: 3, max: 12, startedAt: 0, now: 6_000 })).toBe(18_000);
	});

	it('has nothing to say before progress, after completion, or too early', () => {
		expect(estimateRemainingMs({ value: 0, startedAt: 0, now: 60_000 })).toBeNull();
		expect(estimateRemainingMs({ value: 100, startedAt: 0, now: 60_000 })).toBeNull();
		expect(estimateRemainingMs({ value: 50, startedAt: 0, now: 500 })).toBeNull();
		expect(estimateRemainingMs({ value: 1, startedAt: 0, now: 60_000 })).toBeNull();
		expect(estimateRemainingMs({ value: 5, max: 0, startedAt: 0, now: 60_000 })).toBeNull();
	});

	it('rounds up into coarse steps so the copy does not tick', () => {
		expect(roundEtaMs(1_000)).toBe(5_000);
		expect(roundEtaMs(12_000)).toBe(15_000);
		expect(roundEtaMs(59_500)).toBe(60_000);
		expect(roundEtaMs(61_000)).toBe(120_000);
		expect(roundEtaMs(2 * 3_600_000)).toBe(2 * 3_600_000);
	});
});

describe('no screen still hides a loading announcement behind aria-label', () => {
	// The defect is trivially reintroduced by copying a neighbouring panel, and it is invisible on
	// screen — nothing but this scan would catch the next one.
	// RC-STB-2.6 split Community.tsx into screens/community/; the three tabs that load remote data
	// are the ones this scan is about. Paths, not bare file names, so a later split re-points here.
	// RC-STB-2.1 did the same to Settings.tsx: its three async panels each carry their own region.
	// RC-POL-1.14 moved the Compendium's result list (and its loading region) into CompendiumResults.tsx.
	const SCREENS = [
		'community/DiscoverShelf.tsx',
		'community/Publish.tsx',
		'community/Wiki.tsx',
		'extensions/CompendiumResults.tsx',
		'settings/AccountDevices.tsx',
		'settings/PlayerInvites.tsx',
		'settings/Vault.tsx',
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
