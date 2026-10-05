// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreStateSlice } from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState } from '@dndtools/core/testing';
import { I18nProvider } from '../../i18n';
import { nextFreeSlot, placeNewTile } from '../../screens/screen/paletteRows';
import type { AddWidgetGalleryProps } from './AddWidgetGallery';

/**
 * RC-CAN-8.5 — the Add panel a GM can read: short rows named "Add <widget>", a miniature only on
 * hover or keyboard focus that never joins the tab order, "More ways to add" after the library,
 * and one placement rule shared by the gallery and the palette.
 */

const runtimeRef: { state: CoreStateSlice; defaultActorId: string } = {
	state: buildInitialState(DM_ACTOR, PLAYER_ACTOR),
	defaultActorId: DM_ACTOR.id,
};

vi.mock('../../runtime/RuntimeContext', () => ({
	useRuntime: () => runtimeRef,
	DEFAULT_DM_ACTOR_ID: 'dm-1',
}));

const { AddWidgetGallery } = await import('./AddWidgetGallery');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TILE = { w: 240, h: 160 };

describe('placement (shared by the gallery, the board and the palette)', () => {
	const row = [
		{ id: 'a', x: 24, y: 24, w: 240, h: 160 },
		{ id: 'b', x: 288, y: 24, w: 240, h: 160 },
	];

	it('fills the first free slot in reading order when nothing says what is in view', () => {
		expect(nextFreeSlot([], TILE, undefined, null)).toEqual({ x: 24, y: 24 });
		expect(nextFreeSlot(row, TILE, undefined, null)).toEqual({ x: 552, y: 24 });
	});

	it('keeps a board in full view filling its top row first', () => {
		const view = { x: 0, y: 0, w: 900, h: 900 };
		expect(nextFreeSlot(row, TILE, undefined, view)).toEqual({ x: 552, y: 24 });
	});

	it('takes the first free slot in view on a board scrolled past its top row', () => {
		const tall = [...row, { id: 'c', x: 552, y: 24, w: 240, h: 160 }];
		for (let y = 208; y <= 1128; y += 184) {
			for (const x of [24, 288, 552]) tall.push({ id: `${x}-${y}`, x, y, w: 240, h: 160 });
		}
		// The GM is looking at rows 4–5; the free row below everything is out of sight further down.
		const view = { x: 0, y: 600, w: 816, h: 400 };
		const reading = nextFreeSlot(tall, TILE, undefined, null);
		expect(reading).toEqual({ x: 24, y: 1312 });
		// Nothing is free in view, so the free slot nearest the view's centre wins: the middle column.
		expect(nextFreeSlot(tall, TILE, undefined, view)).toEqual({ x: 288, y: 1312 });
		// With a gap in view, the tile lands there rather than below the whole board.
		const gapped = tall.filter((tile) => tile.id !== '288-760');
		expect(nextFreeSlot(gapped, TILE, undefined, view)).toEqual({ x: 288, y: 760 });
	});

	it('appends to the reading order on a flow screen', () => {
		const flow = [
			{ id: 'a', x: 0, y: 0, w: 480, h: 240 },
			{ id: 'b', x: 0, y: 240, w: 480, h: 240 },
		];
		expect(placeNewTile(flow, TILE, 'flow')).toEqual({ x: 0, y: 480 });
	});
});

describe('the Add panel', () => {
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

	function render(onAdd = vi.fn<AddWidgetGalleryProps['onAdd']>(async () => true)) {
		act(() =>
			root.render(
				<I18nProvider>
					<AddWidgetGallery
						open
						onClose={() => {}}
						viewport="desktop"
						policy="bounded"
						widgets={[]}
						onAdd={onAdd}
						onGenerate={() => {}}
						onBuild={() => {}}
					/>
				</I18nProvider>,
			),
		);
		return onAdd;
	}

	const panel = () => container.querySelector<HTMLElement>('[data-testid="add-widget-gallery"]')!;
	const tabStops = () =>
		[...document.querySelectorAll<HTMLElement>('button, input, [tabindex]')].filter(
			(el) => el.tabIndex >= 0 && !el.closest('[inert]'),
		);

	it('names every pick control "Add <widget>" and draws no miniature at rest', () => {
		render();
		const dice = panel().querySelector<HTMLButtonElement>('[data-testid="gallery-entry-dice"]')!;
		expect(dice.getAttribute('aria-label')).toBe('Add Dice');
		expect(dice.textContent).toContain('Dice');
		for (const button of panel().querySelectorAll('ul button')) {
			expect(button.getAttribute('aria-label')).toMatch(/^Add \S/);
		}
		expect(document.querySelector('[data-testid="gallery-preview"]')).toBeNull();
	});

	it('lists the library first and "More ways to add" last', () => {
		render();
		const list = panel().querySelector('ul')!;
		const more = panel().querySelector<HTMLElement>('[role="group"][aria-labelledby]')!;
		expect(document.getElementById(more.getAttribute('aria-labelledby')!)?.textContent).toBe(
			'More ways to add',
		);
		expect(list.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		const names = [...more.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
		expect(names).toEqual(['Generate with assistant', 'Build your own']);
	});

	it('shows the miniature on mouse hover, aria-hidden, inert and out of the tab order', () => {
		render();
		const before = tabStops().length;
		const dice = panel().querySelector<HTMLButtonElement>('[data-testid="gallery-entry-dice"]')!;
		act(() => {
			dice.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
		});
		const preview = document.querySelector<HTMLElement>('[data-testid="gallery-preview"]')!;
		expect(preview).not.toBeNull();
		expect(preview.getAttribute('aria-hidden')).toBe('true');
		expect(preview.hasAttribute('inert')).toBe(true);
		expect(panel().contains(preview)).toBe(false);
		// The live Dice body holds real buttons of its own; none of them is a tab stop.
		expect(preview.querySelectorAll('button').length).toBeGreaterThan(0);
		expect(tabStops().some((el) => preview.contains(el))).toBe(false);
		expect(tabStops()).toHaveLength(before);
		act(() => {
			dice.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }));
		});
		expect(document.querySelector('[data-testid="gallery-preview"]')).toBeNull();
	});

	it('places a pick at the first free slot and hands the add the entry', async () => {
		const onAdd = render();
		const dice = panel().querySelector<HTMLButtonElement>('[data-testid="gallery-entry-dice"]')!;
		await act(async () => dice.click());
		expect(onAdd).toHaveBeenCalledTimes(1);
		expect(onAdd.mock.calls[0][0]).toMatchObject({ type: 'dice' });
		expect(onAdd.mock.calls[0][1]).toEqual({ x: 24, y: 24 });
	});
});
