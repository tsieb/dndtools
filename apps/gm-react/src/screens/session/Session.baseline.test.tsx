// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PLAYER_SUMMARY_WIDGET,
	SESSION_SCREEN_PARTS,
	findSessionScreen,
	findWidgetDefinition,
	getSceneForActor,
} from '@dndtools/core';
import { boardWidgetsOf, payloadIndex } from '../../app/board-helpers';
import { I18nProvider } from '../../i18n';
import { ariaTree, domSkeleton, focusOrder, headingOutline, squash } from './baseline-serializers';
import { DM, baselineFixtures, createBaselineRuntime } from './baseline-fixtures';

/**
 * RC-CAN-7.8 — the Session console's committed baselines.
 *
 * Every snapshot below is `/session` as it shipped before the conversion, rendered against a real
 * Core seeded by the real demo seed (the content the CAN-7.5 captures were taken on), in the states
 * SCREENS_PARITY §3 inventories: Standby at three tiers, Prep, Live, a live fight, Recap with the
 * rest timeline, player preview and a player's own device. Four serialisations per state, the same
 * ones the Command Center's baselines use (`CommandCenter.baseline.test.tsx`; the serialisers are
 * repeated in `./baseline-serializers` because a test file cannot import another without running
 * its tests):
 *
 * - `aria` — the route's accessibility tree, in the shape `ariaSnapshot()` prints.
 * - `dom` — the semantic DOM skeleton: headings, controls, images, landmarks and every element with a
 *   role, with their accessibility attributes and text, in document order. Layout wrappers and
 *   presentation are left out on purpose; what the console LOOKS like is the screenshot review's job.
 * - `headings` and `focus order` — the heading outline and every tab stop by role and name.
 *
 * After the conversion the same snapshots are taken from the Session screen with its widget-region
 * wrappers (`section[data-widget-region]`, one per widget) unwrapped; those wrappers are the only
 * documented difference. Dialogs portal to the body and are not part of `#main-content`.
 *
 * RC-POL-1.4 re-recorded them once for the polish pass: the reworded copy, the continuity prompts as
 * a list, and Prep and recap's recent-changes count as a button over the list it counts.
 */

const runtime = createBaselineRuntime();
let viewport: 'desktop' | 'rail' | 'phone' = 'desktop';

vi.mock('../../runtime/RuntimeContext', () => ({
	useRuntime: () => runtime,
	DEFAULT_DM_ACTOR_ID: 'dm-1',
	isPlaceholderActorName: () => false,
}));
vi.mock('../../app/useViewport', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../app/useViewport')>()),
	useViewport: () => viewport,
}));
// Not hosting: the roster shows its "no live table" state, as in the CAN-7.5 captures.
vi.mock('../../net/SessionContext', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../net/SessionContext')>()),
	useSession: () => ({ role: 'none', peers: [] }),
}));

const { Session } = await import('./index');
const { FlowBoard } = await import('../../app/canvas/FlowBoard');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout: a widget region's fit probe measures text ranges on an animation frame.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

// The serialisations live in `./baseline-serializers` (RC-POL-1.4, for size).

// --- Fixtures (`./baseline-fixtures`, RC-POL-1.4, for size) -------------------------------------

const { seedDemoVault, accept, goLive, startFight, restTheParty } = baselineFixtures(runtime);

let host: HTMLDivElement;
let root: Root;

// The rest timeline and the archive stamps print wall-clock times in the runtime's own zone, so a
// baseline captured on a developer's machine would not match a UTC runner. Every date the screen
// formats is read in UTC (and US English) instead; the instants themselves are the seed's own.
const LOCALE_FORMATTERS = ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'] as const;
const pinnedClock: { mockRestore(): void }[] = [];
function pinClockToUtc() {
	for (const name of LOCALE_FORMATTERS) {
		const original = Date.prototype[name];
		pinnedClock.push(
			vi.spyOn(Date.prototype, name).mockImplementation(function (
				this: Date,
				_locales?: Intl.LocalesArgument,
				options?: Intl.DateTimeFormatOptions,
			) {
				return original.call(this, 'en-US', { ...options, timeZone: 'UTC' });
			}),
		);
	}
}

beforeEach(() => {
	pinClockToUtc();
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	viewport = 'desktop';
	host = document.createElement('div');
	document.body.append(host);
	root = createRoot(host);
});
afterEach(() => {
	act(() => root.unmount());
	host.remove();
	vi.unstubAllGlobals();
	for (const spy of pinnedClock.splice(0)) spy.mockRestore();
});

async function renderSession(): Promise<HTMLElement> {
	await act(async () => {
		root.render(
			<MemoryRouter>
				<I18nProvider>
					<main id="main-content">
						<Session />
					</main>
				</I18nProvider>
			</MemoryRouter>,
		);
	});
	// Provisioning dispatches settle on the next turns; let them land and the screen re-render.
	for (let turn = 0; turn < 3; turn += 1) await act(async () => {});
	return host.querySelector('main')!;
}

/** The console with its documented widget-region wrappers unwrapped (after the conversion). */
function withoutWidgetRegions(main: HTMLElement): HTMLElement {
	const copy = main.cloneNode(true) as HTMLElement;
	for (const region of copy.querySelectorAll('section[data-widget-region]'))
		region.replaceWith(...region.childNodes);
	return copy;
}

function expectBaseline(main: HTMLElement, state: string) {
	const page = withoutWidgetRegions(main);
	expect(ariaTree(page)).toMatchSnapshot(`${state} · aria`);
	expect(domSkeleton(page)).toMatchSnapshot(`${state} · dom`);
	expect(headingOutline(page)).toMatchSnapshot(`${state} · headings`);
	expect(focusOrder(page)).toMatchSnapshot(`${state} · focus order`);
}

// --- The baselines ------------------------------------------------------------------------------

describe('Session baselines (RC-CAN-7.8)', () => {
	it('demo vault, Standby, desktop', async () => {
		await seedDemoVault();
		expectBaseline(await renderSession(), 'desktop standby');
	});

	it('demo vault, Standby, rail and phone', async () => {
		await seedDemoVault();
		viewport = 'rail';
		expectBaseline(await renderSession(), 'rail standby');
		act(() => root.render(null));
		viewport = 'phone';
		expectBaseline(await renderSession(), 'phone standby');
	});

	it('demo vault, Prep', async () => {
		await seedDemoVault();
		await accept({ type: 'session.set-workflow', payload: { workflow: 'prep' } } as never);
		expectBaseline(await renderSession(), 'desktop prep');
	});

	it('demo vault, Live', async () => {
		await seedDemoVault();
		await goLive();
		expectBaseline(await renderSession(), 'desktop live');
	});

	it('demo vault, a live fight, desktop and phone', async () => {
		await seedDemoVault();
		await goLive();
		await startFight();
		expectBaseline(await renderSession(), 'desktop live combat');
		act(() => root.render(null));
		viewport = 'phone';
		expectBaseline(await renderSession(), 'phone live combat');
	});

	it('demo vault, Recap with the rest timeline', async () => {
		await seedDemoVault();
		await goLive();
		await restTheParty();
		await accept({ type: 'session.set-workflow', payload: { workflow: 'recap' } } as never);
		expectBaseline(await renderSession(), 'desktop recap');
	});

	it('previewing as a player during a fight', async () => {
		await seedDemoVault();
		await goLive();
		await startFight();
		runtime.preview = { actorId: 'actor-player' };
		runtime.defaultActorId = 'actor-player';
		runtime.activeActorId = 'actor-player';
		expectBaseline(await renderSession(), 'desktop preview player');
	});

	it("a player's own device", async () => {
		await seedDemoVault();
		await goLive();
		runtime.defaultActorId = 'actor-player';
		runtime.activeActorId = 'actor-player';
		expectBaseline(await renderSession(), 'desktop player');
	});
});

// --- After the conversion -----------------------------------------------------------------------

function sessionScreen() {
	const screen = findSessionScreen(runtime.state.scenes);
	if (!screen) throw new Error('the Session screen was not provisioned');
	return screen;
}

const REGIONS = [
	'1. Session status',
	'2. Combat',
	'3. Dice',
	'4. Rollable tables',
	'5. Handouts',
	'6. Now playing',
	'7. Stage',
	'8. Campaign date',
	'9. Prep & recap',
	'10. End-of-session capture',
	'11. Table roster',
	// RC-SES-7.3 — what each participant sees, under the roster.
	'12. What players see',
	'13. Party',
	'14. Rests this session',
	'15. Schedule next session',
];

/** Each grid cell: the widget in it, where it sits, and whether it is in the layout at all. */
function cells(grid: HTMLElement) {
	return [...grid.children].map((cell) => ({
		part: cell.querySelector('[data-widget-region]')?.getAttribute('aria-label'),
		column: (cell as HTMLElement).style.gridColumn,
		row: (cell as HTMLElement).style.gridRow,
		shown: (cell as HTMLElement).style.display !== 'none',
	}));
}

/** The Session screen at its canonical route (`/screen/:id` → `FlowBoard`), in view mode. */
async function renderCanonical(): Promise<HTMLElement> {
	const screen = sessionScreen();
	const summary = getSceneForActor(
		runtime.state.scenes,
		runtime.state.permissions,
		DM.id,
		screen.id,
		{ widgetPackages: runtime.state.widgets },
	);
	if ('kind' in summary) throw new Error('the Session screen is not readable');
	const widgets = boardWidgetsOf(
		screen.widgets,
		payloadIndex(summary.widgets),
		(type) => findWidgetDefinition(runtime.state.widgets, type) ?? null,
	);
	await act(async () => {
		root.render(
			<MemoryRouter>
				<I18nProvider>
					<main id="main-content">
						<FlowBoard
							widgets={widgets}
							tier={viewport}
							editing={false}
							selectedId={null}
							onSelect={() => {}}
							onMove={() => {}}
							onResize={() => {}}
							onWidgetCommand={() => {}}
						/>
					</main>
				</I18nProvider>
			</MemoryRouter>,
		);
	});
	for (let turn = 0; turn < 3; turn += 1) await act(async () => {});
	return host.querySelector('main')!;
}

async function press(name: string) {
	const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
		(candidate) => squash(candidate.textContent) === name,
	);
	if (!button) throw new Error(`no button named ${name}`);
	await act(async () => button.click());
}

const openDialog = () => document.querySelector('[role="dialog"]');

describe('Session as a screen (RC-CAN-7.8)', () => {
	it('duplicate trackers handle each shortcut once and keep their keyboard cursor on rerender', async () => {
		await seedDemoVault();
		await startFight();
		await renderSession();
		const screen = sessionScreen();
		const widget = screen.widgets.find((candidate) => candidate.type === 'combat')!;
		await accept({
			type: 'scene.duplicate-widget',
			payload: { sceneId: screen.id, widgetInstanceId: widget.id },
		} as never);
		await renderSession();
		expect(
			[...host.querySelectorAll('button')].filter((button) => button.textContent === 'End combat'),
		).toHaveLength(2);

		const key = async (value: string, options: KeyboardEventInit = {}) => {
			await act(async () => {
				window.dispatchEvent(
					new KeyboardEvent('keydown', { key: value, cancelable: true, ...options }),
				);
			});
			await renderSession();
		};
		const combat = () => runtime.state.session.combat;
		const before = combat().log.length;
		await key('n');
		expect(combat().turn).toBe(1);
		expect(
			combat()
				.log.slice(before)
				.map((entry) => entry.kind),
		).toEqual(['turn-advanced']);
		await key('p');
		expect(combat().turn).toBe(0);
		expect(
			combat()
				.log.slice(before)
				.map((entry) => entry.kind),
		).toEqual(['turn-advanced', 'turn-reverted']);

		// Selection rerenders only its own panel. Reattaching its listener would give the other
		// tracker the next key and split the cursor between two independent selections.
		await key('ArrowDown');
		await key('ArrowDown');
		expect(host.textContent?.match(/Selected · Ogre/g)).toHaveLength(1);
		expect(host.textContent).not.toContain('Selected · Goblin');
		const beforeReorder = combat().log.length;
		await key('ArrowDown', { altKey: true });
		expect(
			combat()
				.log.slice(beforeReorder)
				.map((entry) => entry.kind),
		).toEqual(['combatant-reordered']);

		await key('d');
		expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
		const blocked = combat().log.length;
		await key('n');
		expect(combat().log).toHaveLength(blocked);
	});

	it('is a flow screen of the console’s widgets, each in its own widget region', async () => {
		await seedDemoVault();
		const main = await renderSession();
		const screen = sessionScreen();
		expect(screen.screen?.layoutPolicy).toBe('flow');
		// RC-SES-7.3 — the parts, with the "What players see" row under the roster.
		expect(screen.widgets.map((widget) => widget.type)).toEqual(
			SESSION_SCREEN_PARTS.flatMap((part) =>
				part.configuration.view === 'roster' ? [part, PLAYER_SUMMARY_WIDGET] : [part],
			).map((part) => part.type),
		);
		// The documented difference from the baselines: one labelled region per widget.
		expect(
			[...main.querySelectorAll('section[data-widget-region]')].map((region) =>
				region.getAttribute('aria-label'),
			),
		).toEqual(REGIONS);
		// The status across the top; the tracker beside the column; the empty rest timeline out of it.
		const grid = main.querySelector<HTMLElement>('[data-testid="session-screen"]')!;
		expect(cells(grid)).toEqual([
			{ part: REGIONS[0], column: '1 / span 12', row: '1', shown: true },
			{ part: REGIONS[1], column: '1 / span 7', row: '2 / span 12', shown: true },
			...REGIONS.slice(2, 13).map((part, index) => ({
				part,
				column: '8 / span 5',
				row: String(index + 2),
				shown: true,
			})),
			{ part: REGIONS[13], column: '', row: '', shown: false },
			{ part: REGIONS[14], column: '8 / span 5', row: '13', shown: true },
		]);
	});

	it('reads the same at its canonical route, /screen/:id, at every tier', async () => {
		await seedDemoVault();
		await goLive();
		await startFight();
		for (const tier of ['desktop', 'rail', 'phone'] as const) {
			viewport = tier;
			const sessionGrid = (await renderSession()).querySelector<HTMLElement>(
				'[data-testid="session-screen"]',
			)!;
			const expected = {
				cells: cells(sessionGrid),
				tree: ariaTree(withoutWidgetRegions(sessionGrid)),
			};
			act(() => root.render(null));
			const flowGrid = (await renderCanonical()).querySelector<HTMLElement>(
				'[data-testid="flow-grid"]',
			)!;
			act(() => root.render(null));
			expect(cells(flowGrid), tier).toEqual(expected.cells);
			expect(ariaTree(withoutWidgetRegions(flowGrid)), tier).toEqual(expected.tree);
		}
	});

	it('the start, rest and end dialogs open from the session status widget', async () => {
		await seedDemoVault();
		await renderSession();
		await press('Start session');
		expect(openDialog()?.textContent).toContain('Start');
		act(() => root.render(null));
		await goLive();
		await renderSession();
		await press('Call a rest');
		expect(openDialog()?.querySelector('[role="radiogroup"]')).not.toBeNull();
		act(() => root.render(null));
		await renderSession();
		await press('End session');
		expect(openDialog()?.textContent).toContain('End and review');
	});

	it('the encounter builder and the end-combat confirm open from the combat widget', async () => {
		await seedDemoVault();
		await renderSession();
		await press('Build encounter');
		expect(openDialog()?.getAttribute('aria-label') ?? openDialog()?.textContent).toContain(
			'Build encounter',
		);
		act(() => root.render(null));
		await goLive();
		await startFight();
		await renderSession();
		await press('End combat');
		expect(openDialog()?.textContent).toContain('Keep');
	});

	it('the rest timeline joins the layout once a rest is taken', async () => {
		await seedDemoVault();
		await goLive();
		await restTheParty();
		const grid = (await renderSession()).querySelector<HTMLElement>(
			'[data-testid="session-screen"]',
		)!;
		expect(cells(grid).find((cell) => cell.part === REGIONS[13])).toMatchObject({ shown: true });
	});
});
