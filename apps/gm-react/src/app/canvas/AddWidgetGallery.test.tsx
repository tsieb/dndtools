// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreStateSlice } from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState } from '@dndtools/core/testing';
import { I18nProvider } from '../../i18n';
import { en } from '../../i18n/messages/en';
import { es } from '../../i18n/messages/es';
import type { AiRouteResult } from '../../ai/providerConfig';
import { AI_USAGE_PREFERENCE_KEY } from '../../ai/usagePreference';
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

// What the assistant task routes to. Off by default, as on a fresh device.
const routeRef: { current: AiRouteResult } = {
	current: { available: false, backendId: 'provider', reason: 'no-key' },
};
vi.mock('../../ai/providerConfig', async (original) => ({
	...(await original<typeof import('../../ai/providerConfig')>()),
	routeAiTask: () => routeRef.current,
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
		localStorage.clear();
		routeRef.current = { available: false, backendId: 'provider', reason: 'no-key' };
		runtimeRef.state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	});

	function render(
		onAdd = vi.fn<AddWidgetGalleryProps['onAdd']>(async () => true),
		onGenerate: () => void = () => {},
	) {
		act(() =>
			root.render(
				<MemoryRouter>
					<I18nProvider>
						<AddWidgetGallery
							open
							onClose={() => {}}
							viewport="desktop"
							policy="bounded"
							widgets={[]}
							onAdd={onAdd}
							onGenerate={onGenerate}
							onBuild={() => {}}
						/>
					</I18nProvider>
				</MemoryRouter>,
			),
		);
		return onAdd;
	}

	/** The assistant switched on, agent access on, and one agent allowed the widget tool. */
	function assistantReady() {
		localStorage.setItem(AI_USAGE_PREFERENCE_KEY, 'complete');
		const state = runtimeRef.state;
		runtimeRef.state = {
			...state,
			mcp: {
				...state.mcp,
				enabled: true,
				bindings: { prep: { agentId: 'prep', actorId: DM_ACTOR.id, label: 'Prep' } },
				policies: { prep: { agentId: 'prep', allowedToolIds: ['widget.package.propose'] } },
			},
		} as unknown as CoreStateSlice;
	}
	const generateCard = () =>
		panel().querySelector<HTMLElement>('[aria-label^="Generate"]') as HTMLElement;

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
		const names = [...more.querySelectorAll('[aria-label]')].map((b) =>
			b.getAttribute('aria-label'),
		);
		expect(names).toEqual(['Generate with assistant', 'Build your own']);
	});

	// RC-WID-6.7 — the card says what is missing and links to where to fix it; it never opens a
	// dialog whose only content is "go to Settings".
	it('says on the Generate card that the assistant is off, with a link to Tool preferences', () => {
		const onGenerate = vi.fn();
		render(undefined, onGenerate);
		const card = generateCard();
		expect(card.tagName).not.toBe('BUTTON');
		expect(card.textContent).toContain('The assistant is off.');
		const link = card.querySelector('a')!;
		expect(link.getAttribute('href')).toBe('/settings?tab=tools');
		expect(link.textContent).toBe('Open Settings › Tool preferences');
		expect(onGenerate).not.toHaveBeenCalled();
	});

	it('names the missing provider on the Generate card and links to Settings › AI & tools', () => {
		assistantReady();
		render();
		const card = generateCard();
		expect(card.tagName).not.toBe('BUTTON');
		expect(card.textContent).toContain('No AI provider is set up.');
		const link = card.querySelector('a')!;
		expect(link.getAttribute('href')).toBe('/settings?tab=ai');
		expect(link.textContent).toBe('Open Settings › AI & tools');
	});

	it('reads "Generate (local)" and opens the dialog once a local model is ready', () => {
		assistantReady();
		routeRef.current = {
			available: true,
			backendId: 'local',
			config: { provider: 'openai-compatible', model: 'llama3', baseUrl: '', apiKey: 'local' },
		};
		const onGenerate = vi.fn();
		render(undefined, onGenerate);
		const card = generateCard();
		expect(card.tagName).toBe('BUTTON');
		expect(card.getAttribute('aria-label')).toBe('Generate (local)');
		expect(card.querySelector('a')).toBeNull();
		act(() => card.click());
		expect(onGenerate).toHaveBeenCalledTimes(1);
	});

	it('keeps "Generate with assistant" for a ready provider', () => {
		assistantReady();
		routeRef.current = {
			available: true,
			backendId: 'provider',
			config: { provider: 'anthropic', model: 'm', baseUrl: '', apiKey: 'k' },
		};
		render();
		expect(generateCard().tagName).toBe('BUTTON');
		expect(generateCard().getAttribute('aria-label')).toBe('Generate with assistant');
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

// RC-WID-6.7 (WID-16) — the gallery's copy lives in the message catalogs, not in a table of its own.
describe('the Add panel copy', () => {
	const source = readFileSync(
		join(process.cwd(), 'apps', 'gm-react', 'src', 'app', 'canvas', 'AddWidgetGallery.tsx'),
		'utf8',
	)
		.split('\n')
		.filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
		.join('\n');

	it('branches on no locale and keeps no per-language strings of its own', () => {
		expect(source).not.toMatch(/\blocale\b/);
		expect(source).not.toMatch(/\b(en|es|fr)\s*:\s*['"{]/);
	});

	it('reads every key it uses from a catalog with a Spanish translation', () => {
		const keys = [
			// Every dotted string literal: a key handed to t(), directly or through a conditional.
			...source.matchAll(/'([a-z][A-Za-z]*(?:\.[a-zA-Z0-9]+)+)'/g),
		].map((match) => match[1]!);
		expect(keys.length).toBeGreaterThan(20);
		for (const key of keys) {
			expect(en, `no English source for ${key}`).toHaveProperty([key]);
			expect(es, `no Spanish for ${key}`).toHaveProperty([key]);
		}
		for (const key of [
			'boardCanvas.add.sampleLabel',
			'boardCanvas.add.sampleMessage',
			'boardCanvas.add.generateLocal',
		] as const) {
			expect(keys).toContain(key);
			expect(es[key]).not.toBe(en[key]);
		}
	});
});
