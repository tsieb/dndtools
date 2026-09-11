// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSystemWidgetPackages, type WidgetDefinition } from '@dndtools/core';
import type { BoardWidget } from '../../board-helpers';
import { I18nProvider } from '../../../i18n';
import {
	NOTE_CHUNK_LINES,
	NoteTile,
	VIRTUALIZE_OVER_LINES,
	noteSummary,
	splitNoteChunks,
} from './Note';

/**
 * RC-CAN-2.3 — note tile depth levels and the windowed full depth.
 *
 * The timing half of the acceptance (a 2,000-line tile inside the `widget-update` budget) needs a
 * real browser that paints, so it lives in `tests/e2e/note-depth.spec.ts`. This file pins the part
 * jsdom can prove exactly: what each depth shows, that a long note mounts one window and not 2,000
 * lines, and that no cut between windows can turn a `[!Secret]` callout into a visible quote.
 */

// React 18 wants this flag to treat `act()` as a real act scope outside a test renderer.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SYSTEM_DEFINITIONS: WidgetDefinition[] = Object.values(
	createSystemWidgetPackages().packages,
).flatMap((record) => record.package.widgets);

function definition(type: string): WidgetDefinition {
	const found = SYSTEM_DEFINITIONS.find((d) => d.type === type);
	if (!found) throw new Error(`no system widget definition for ${type}`);
	return found;
}

function noteWidget(configuration: Record<string, unknown>, type = 'note'): BoardWidget {
	const def = definition(type);
	return {
		id: `widget-${type}`,
		type,
		title: def.displayName,
		typeLabel: def.displayName,
		icon: def.icon ?? 'widget',
		tier: 'system',
		description: def.description ?? '',
		visibility: 'dm-only',
		x: 0,
		y: 0,
		w: 4,
		h: 3,
		status: 'available',
		statusNote: null,
		configuration,
		configFields: def.configFields ?? [],
		requiresBinding: false,
		commands: [],
		bindingRef: null,
	};
}

/** Sections of 20 lines, each closed by a blank line; the last line is a findable marker. */
function longNote(lines: number): string {
	const out: string[] = [];
	for (let i = 0; i < lines - 1; i += 1) {
		if (i % 20 === 0) out.push(`## Section ${i / 20 + 1}`);
		else if (i % 20 === 19) out.push('');
		else out.push(`Line ${i + 1} of the watch log.`);
	}
	out.push('End of the harbour log.');
	return out.join('\n');
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
	vi.unstubAllGlobals();
});

function render(widget: BoardWidget, editing = false): void {
	act(() =>
		root.render(
			<I18nProvider>
				<NoteTile widget={widget} editing={editing} />
			</I18nProvider>,
		),
	);
}

const text = () => container.textContent ?? '';

describe('note depth levels', () => {
	const body = 'The tide bell rang twice.\nStill the first block.\n\nA **second** paragraph.';

	it('declares depth on the note definition, defaulting to full', () => {
		const field = definition('note').configFields?.find((f) => f.key === 'depth');
		expect(field?.control).toBe('select');
		expect(field?.default).toBe('full');
		expect(field?.options?.map((o) => o.value)).toEqual(['title', 'summary', 'full']);
	});

	it('renders the whole body through the markdown pipeline at full depth, the default', () => {
		render(noteWidget({ heading: 'Harbour watch', body }));
		expect(container.querySelector('[data-note-depth]')?.getAttribute('data-note-depth')).toBe(
			'full',
		);
		expect(text()).toContain('Harbour watch');
		expect(text()).toContain('The tide bell rang twice.');
		expect(text()).toContain('paragraph.');
		expect(container.querySelector('strong')?.textContent).toBe('second');
	});

	it('shows the heading and only the first block at summary depth', () => {
		render(noteWidget({ heading: 'Harbour watch', body, depth: 'summary' }));
		expect(text()).toContain('Harbour watch');
		expect(text()).toContain('Still the first block.');
		expect(text()).not.toContain('paragraph.');
	});

	it('shows the heading alone at title depth, and says so when there is none', () => {
		render(noteWidget({ heading: 'Harbour watch', body, depth: 'title' }));
		expect(text()).toBe('Harbour watch');

		render(noteWidget({ body, depth: 'title' }));
		expect(text()).toBe('Untitled note');
	});

	it('falls back to full for a depth it does not know', () => {
		render(noteWidget({ heading: 'Harbour watch', body, depth: 'everything' }));
		expect(text()).toContain('paragraph.');
	});

	it('withholds a [!Secret] callout at every depth', () => {
		const secret = '> [!Secret]\n> He fenced the moonstone.\n\nPublic line.';
		for (const depth of ['title', 'summary', 'full']) {
			render(noteWidget({ heading: 'Duke', body: secret, depth }));
			expect(text()).not.toContain('He fenced the moonstone.');
		}
	});

	it('caps a summary at twelve lines of the first block', () => {
		const block = Array.from({ length: 30 }, (_, i) => `Rumour ${i + 1}.`).join('\n');
		const summary = noteSummary(`\n\n${block}\n\nNext block.`);
		expect(summary.split('\n')).toHaveLength(12);
		expect(summary.startsWith('Rumour 1.')).toBe(true);
	});

	it('gives a full note a labelled, keyboard-reachable scroll region', () => {
		render(noteWidget({ heading: 'Harbour watch', body }));
		const region = container.querySelector('[role="region"]');
		expect(region?.getAttribute('aria-label')).toBe('Note text: Harbour watch');
		expect(region?.getAttribute('tabindex')).toBe('0');
	});
});

describe('depth badge', () => {
	it('shows the depth in edit mode only', () => {
		render(noteWidget({ heading: 'Harbour watch', body: 'Text.', depth: 'summary' }), true);
		expect(container.querySelector('[data-testid="note-depth-badge"]')?.textContent).toBe(
			'Depth: Summary',
		);

		render(noteWidget({ heading: 'Harbour watch', body: 'Text.', depth: 'summary' }), false);
		expect(container.querySelector('[data-testid="note-depth-badge"]')).toBeNull();
	});

	it('shows on an empty note too, so the setting is visible before any text exists', () => {
		render(noteWidget({}), true);
		expect(text()).toContain('Depth: Full note');
		expect(text()).toContain('Empty note');
	});

	it('is not drawn for a handout, which declares no depth', () => {
		render(noteWidget({ heading: 'Letter', body: 'Text.' }, 'handout'), true);
		expect(container.querySelector('[data-testid="note-depth-badge"]')).toBeNull();
	});
});

describe('splitNoteChunks', () => {
	it('joins back to the body it was cut from, in windows of bounded size', () => {
		const body = longNote(2000);
		const chunks = splitNoteChunks(body);
		expect(chunks.join('\n')).toBe(body);
		expect(chunks.length).toBe(2000 / NOTE_CHUNK_LINES);
		for (const chunk of chunks) {
			expect(chunk.split('\n').length).toBeLessThanOrEqual(NOTE_CHUNK_LINES * 2);
		}
	});

	it('closes windows on blank lines when the body has them', () => {
		const chunks = splitNoteChunks(longNote(1000));
		for (const chunk of chunks.slice(0, -1)) expect(chunk.split('\n').at(-1)).toBe('');
	});

	it('never cuts between two quoted lines, so a long secret stays one callout', () => {
		const lines = [
			...Array.from({ length: 60 }, (_, i) => `Open line ${i + 1}.`),
			'> [!Secret]',
			...Array.from({ length: 400 }, (_, i) => `> Hidden line ${i + 1}.`),
			...Array.from({ length: 300 }, (_, i) => `Closing line ${i + 1}.`),
		];
		const chunks = splitNoteChunks(lines.join('\n'));
		expect(chunks.join('\n')).toBe(lines.join('\n'));
		for (let i = 0; i < chunks.length - 1; i += 1) {
			const last = chunks[i]!.split('\n').at(-1)!;
			const next = chunks[i + 1]!.split('\n')[0]!;
			expect(last.startsWith('>') && next.startsWith('>')).toBe(false);
		}
		// The whole callout, marker included, sits in one window.
		expect(chunks.filter((chunk) => chunk.includes('> [!Secret]'))).toHaveLength(1);
		expect(chunks.find((chunk) => chunk.includes('> [!Secret]'))).toContain('> Hidden line 400.');
	});

	it('never closes a window inside a fence, even on a blank line', () => {
		const lines = [
			...Array.from({ length: 90 }, (_, i) => `Prose ${i + 1}.`),
			'```',
			...Array.from({ length: 150 }, (_, i) => (i % 10 === 0 ? '' : `code ${i}`)),
			'```',
			...Array.from({ length: 50 }, (_, i) => `After ${i + 1}.`),
		];
		for (const chunk of splitNoteChunks(lines.join('\n'))) {
			const fences = chunk.split('\n').filter((line) => line === '```').length;
			expect(fences % 2).toBe(0);
		}
	});
});

describe('full depth virtualization', () => {
	/** A controllable IntersectionObserver: the test decides which sentinels are near the viewport. */
	class FakeObserver {
		static current: FakeObserver | null = null;
		targets: HTMLElement[] = [];
		constructor(
			readonly callback: IntersectionObserverCallback,
			readonly options?: IntersectionObserverInit,
		) {
			FakeObserver.current = this;
		}
		observe(el: HTMLElement) {
			this.targets.push(el);
		}
		unobserve() {}
		disconnect() {
			this.targets = [];
		}
		takeRecords() {
			return [];
		}
		fire(index: number, isIntersecting: boolean) {
			const target = this.targets.find((el) => el.dataset.noteChunk === String(index));
			if (!target) throw new Error(`window ${index} is not observed`);
			act(() =>
				this.callback(
					[{ target, isIntersecting } as unknown as IntersectionObserverEntry],
					this as unknown as IntersectionObserver,
				),
			);
		}
	}

	beforeEach(() => {
		FakeObserver.current = null;
		vi.stubGlobal('IntersectionObserver', FakeObserver);
	});

	const windows = () => [...container.querySelectorAll<HTMLElement>('[data-note-chunk]')];
	const mounted = () => windows().filter((el) => el.dataset.mounted === 'true');

	it('renders a note of 200 lines or fewer in one piece', () => {
		render(noteWidget({ heading: 'Log', body: longNote(VIRTUALIZE_OVER_LINES) }));
		expect(windows()).toHaveLength(0);
		expect(text()).toContain('End of the harbour log.');
	});

	it('mounts only the first window of a 2,000-line note', () => {
		render(noteWidget({ heading: 'Log', body: longNote(2000) }));
		expect(windows()).toHaveLength(2000 / NOTE_CHUNK_LINES);
		expect(mounted().map((el) => el.dataset.noteChunk)).toEqual(['0']);
		expect(text()).toContain('Section 1');
		expect(text()).not.toContain('End of the harbour log.');
		// The mounted DOM carries at most one window's worth of source, not 2,000 lines.
		const lines = (text().match(/of the watch log\./g) ?? []).length;
		expect(lines).toBeLessThanOrEqual(VIRTUALIZE_OVER_LINES);
		// The observer watches the note's own scroll region, one viewport ahead in each direction.
		expect(FakeObserver.current?.options?.root).toBe(container.querySelector('[role="region"]'));
		expect(FakeObserver.current?.options?.rootMargin).toBe('100% 0px');
	});

	it('mounts a window as its sentinel nears the viewport and releases one that leaves', () => {
		render(noteWidget({ heading: 'Log', body: longNote(2000) }));
		const observer = FakeObserver.current!;

		observer.fire(19, true);
		expect(text()).toContain('End of the harbour log.');

		observer.fire(0, false);
		const first = windows()[0]!;
		expect(first.dataset.mounted).toBe('false');
		// A released window keeps its space, so the scroll position does not jump.
		expect(first.style.height).not.toBe('');
		expect(text()).not.toContain('Section 1 ');
	});

	it('keeps a window mounted while keyboard focus is inside it', () => {
		const body = `[Harbour chart](https://example.com/chart)\n\n${longNote(1000)}`;
		render(noteWidget({ heading: 'Log', body }));
		container.querySelector<HTMLAnchorElement>('a[href="https://example.com/chart"]')!.focus();

		FakeObserver.current!.fire(0, false);
		expect(windows()[0]!.dataset.mounted).toBe('true');
	});

	it('still withholds a [!Secret] callout that sits past line 200', () => {
		const body = `${longNote(1000)}\n\n> [!Secret]\n> The harbourmaster is paid by smugglers.`;
		render(noteWidget({ heading: 'Log', body }));
		const observer = FakeObserver.current!;
		for (const el of windows()) observer.fire(Number(el.dataset.noteChunk), true);
		expect(text()).toContain('End of the harbour log.');
		expect(text()).not.toContain('paid by smugglers');
	});

	it('mounts every window when the platform has no IntersectionObserver', () => {
		vi.stubGlobal('IntersectionObserver', undefined);
		render(noteWidget({ heading: 'Log', body: longNote(2000) }));
		expect(mounted()).toHaveLength(windows().length);
		expect(text()).toContain('End of the harbour log.');
	});
});
