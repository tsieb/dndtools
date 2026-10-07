// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	HOME_WIDGET_TYPES,
	createDemoMapState,
	dispatchCommand,
	findHomeScreen,
	findWidgetDefinition,
	getSceneForActor,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	widgetPackageForkIdentity,
} from '@dndtools/core';
import { buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import {
	boardWidgetsOf,
	FLOW_COLUMNS,
	flowOrder,
	flowPlacementsForOrder,
	payloadIndex,
} from '../app/board-helpers';
import { buildPackage, readPackage, widgetEditTarget } from '../app/widgetBuilder/draft';
import { I18nProvider } from '../i18n';
import { seedDemoContent } from '../runtime/demo-seed';
import { ariaTree, domSkeleton, focusOrder, headingOutline } from './CommandCenter.serialise';

/**
 * RC-CAN-7.6 — the Command Center's committed baselines.
 *
 * Every snapshot below is the hub as it shipped before the conversion, rendered against a real Core
 * seeded by the real demo seed (the content the CAN-7.5 captures were taken on). Two serialisations
 * per state:
 *
 * - `aria` — the route's accessibility tree, in the shape `ariaSnapshot()` prints: roles, accessible
 *   names, heading levels and the text between them. Headings and focus order are listed separately.
 * - `dom` — the semantic DOM skeleton: every heading, control, image, landmark and element carrying a
 *   role, with its accessibility attributes and text, in document order. Layout wrappers (`div`,
 *   `span`) and presentation (`style`, `class`) are left out on purpose; what the hub LOOKS like is
 *   the before/after screenshot review's job, and a token or a wrapper moving is not a regression.
 *
 * After the conversion the same snapshots are taken from the hub screen with its widget-region
 * wrappers (`section[data-widget-region]`, one per part) unwrapped; those wrappers are the only
 * documented difference and they are snapshotted on their own.
 */

const DM: Actor = { id: 'dm-1', role: 'dm', displayName: 'Dungeon Master' };
const PARTICIPANTS: Actor[] = [
	{ id: 'actor-player', role: 'player', displayName: 'Demo Player' },
	{ id: 'actor-player-2', role: 'player', displayName: 'Demo Player 2' },
	{ id: 'actor-player-3', role: 'player', displayName: 'Demo Player 3' },
	{ id: 'actor-observer', role: 'observer', displayName: 'Demo Observer' },
];

const runtime = {
	state: buildInitialState(DM) as CoreStateSlice,
	defaultActorId: DM.id,
	activeActorId: DM.id,
	loaded: true,
	env: makeEnvironment(),
	async dispatch(command: CoreCommand): Promise<CommandResult> {
		const result = dispatchCommand(runtime.state, runtime.env, command);
		if (result.status === 'accepted') runtime.state = result.nextState;
		return result;
	},
};
let viewport: 'desktop' | 'rail' | 'phone' = 'desktop';

vi.mock('../runtime/RuntimeContext', () => ({
	useRuntime: () => runtime,
	DEFAULT_DM_ACTOR_ID: 'dm-1',
	isPlaceholderActorName: () => false,
}));
vi.mock('../app/useViewport', async (importOriginal) => ({
	...(await importOriginal<typeof import('../app/useViewport')>()),
	useViewport: () => viewport,
}));

const { CommandCenter } = await import('./CommandCenter');
const { FlowBoard } = await import('../app/canvas/FlowBoard');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout: each widget region's fit probe measures text ranges on an animation frame,
// which can fire after a test under load. Without these it throws outside any test.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

// --- Fixtures -----------------------------------------------------------------------------------

async function seedDemoVault() {
	runtime.env = makeEnvironment();
	runtime.state = buildInitialState(DM, ...PARTICIPANTS);
	runtime.state = { ...runtime.state, maps: createDemoMapState() };
	runtime.defaultActorId = DM.id;
	runtime.activeActorId = DM.id;
	await seedDemoContent(runtime, { showcase: false });
}

function tableSceneIds(): string[] {
	return Object.values(runtime.state.scenes.scenes)
		.filter((scene) => !scene.templateMeta.isTemplate)
		.filter((scene) => scene.id !== runtime.state.commandCenter.homeSceneId)
		.map((scene) => scene.id);
}

async function accept(command: Omit<CoreCommand, 'actorId'> & { actorId?: string }) {
	const result = await runtime.dispatch({ actorId: DM.id, ...command } as CoreCommand);
	if (result.status !== 'accepted') throw new Error(`${command.type} rejected`);
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	viewport = 'desktop';
	document.documentElement.setAttribute('data-feature-tier', 'advanced');
	host = document.createElement('div');
	document.body.append(host);
	root = createRoot(host);
});
afterEach(() => {
	act(() => root.unmount());
	host.remove();
	document.documentElement.removeAttribute('data-feature-tier');
	vi.unstubAllGlobals();
});

async function renderHub(): Promise<HTMLElement> {
	await act(async () => {
		root.render(
			<MemoryRouter>
				<I18nProvider>
					<main id="main-content">
						<CommandCenter />
					</main>
				</I18nProvider>
			</MemoryRouter>,
		);
	});
	// Provisioning dispatches settle on the next turns; let them land and the hub re-render.
	for (let turn = 0; turn < 3; turn += 1) await act(async () => {});
	return host.querySelector('main')!;
}

/** The hub with its documented widget-region wrappers unwrapped (after the conversion). */
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

describe('Command Center baselines (RC-CAN-7.6)', () => {
	it('demo vault, idle, desktop', async () => {
		await seedDemoVault();
		expectBaseline(await renderHub(), 'desktop idle');
	});

	it('demo vault, idle, rail and phone', async () => {
		await seedDemoVault();
		viewport = 'rail';
		expectBaseline(await renderHub(), 'rail idle');
		act(() => root.render(null));
		viewport = 'phone';
		expectBaseline(await renderHub(), 'phone idle');
	});

	it('demo vault, live on a table scene', async () => {
		await seedDemoVault();
		const [sceneId] = tableSceneIds();
		await accept({
			type: 'session.set-workflow',
			payload: { workflow: 'active', activeSceneId: sceneId },
		} as never);
		expectBaseline(await renderHub(), 'desktop live scene');
	});

	it('demo vault, live on the GM screen', async () => {
		await seedDemoVault();
		await accept({ type: 'command-center.ensure-home', payload: {} } as never);
		await accept({
			type: 'session.set-workflow',
			payload: { workflow: 'active', activeSceneId: runtime.state.commandCenter.homeSceneId },
		} as never);
		expectBaseline(await renderHub(), 'desktop live gm screen');
	});

	it('demo vault with no scenes', async () => {
		await seedDemoVault();
		for (const sceneId of tableSceneIds())
			await accept({ type: 'scene.delete', payload: { sceneId } } as never);
		expectBaseline(await renderHub(), 'desktop no scenes');
	});

	it('Manage follows the settings experience tier', async () => {
		await seedDemoVault();
		document.documentElement.setAttribute('data-feature-tier', 'intermediate');
		expectBaseline(await renderHub(), 'desktop intermediate tier');
		act(() => root.render(null));
		document.documentElement.setAttribute('data-feature-tier', 'core');
		expectBaseline(await renderHub(), 'desktop core tier');
	});

	it('an empty vault', async () => {
		runtime.env = makeEnvironment();
		runtime.state = buildInitialState(DM);
		runtime.defaultActorId = DM.id;
		runtime.activeActorId = DM.id;
		expectBaseline(await renderHub(), 'desktop empty vault');
	});

	it('player and observer variants', async () => {
		await seedDemoVault();
		runtime.defaultActorId = 'actor-player';
		runtime.activeActorId = 'actor-player';
		expectBaseline(await renderHub(), 'player');
		act(() => root.render(null));
		runtime.defaultActorId = 'actor-observer';
		runtime.activeActorId = 'actor-observer';
		expectBaseline(await renderHub(), 'observer');
	});
});

// --- After the conversion -----------------------------------------------------------------------

/** Every serialisation the baselines hold, of the hub with its widget regions unwrapped. */
function serialise(main: HTMLElement) {
	const page = withoutWidgetRegions(main);
	return {
		aria: ariaTree(page),
		dom: domSkeleton(page),
		headings: headingOutline(page),
		focus: focusOrder(page),
	};
}

function homeScreen() {
	const home = findHomeScreen(runtime.state.scenes);
	if (!home) throw new Error('the home screen was not provisioned');
	return home;
}

/**
 * The home screen as its canonical route (`/screen/:id`, `Board` → `FlowBoard`) draws it in view
 * mode: the flow board over the same actor-scoped widgets.
 */
async function renderCanonical(): Promise<HTMLElement> {
	const home = homeScreen();
	const summary = getSceneForActor(
		runtime.state.scenes,
		runtime.state.permissions,
		DM.id,
		home.id,
		{ widgetPackages: runtime.state.widgets },
	);
	if ('kind' in summary) throw new Error('the home screen is not readable');
	const widgets = boardWidgetsOf(
		home.widgets,
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

/** Each grid cell: the part in it, where it sits, and whether it is in the layout at all. */
function cells(grid: HTMLElement) {
	return [...grid.children].map((cell) => ({
		part: cell.querySelector('[data-widget-region]')?.getAttribute('aria-label'),
		column: (cell as HTMLElement).style.gridColumn,
		row: (cell as HTMLElement).style.gridRow,
		shown: (cell as HTMLElement).style.display !== 'none',
	}));
}

/** `/` and `/screen/:id` draw the same parts, in the same cells, with the same tree and spacing. */
async function expectCanonicalParity() {
	const homeGrid = (await renderHub()).querySelector<HTMLElement>('[data-testid="home-screen"]')!;
	const expected = { cells: cells(homeGrid), tree: serialise(homeGrid), gap: homeGrid.style.gap };
	act(() => root.render(null));
	const flowGrid = (await renderCanonical()).querySelector<HTMLElement>(
		'[data-testid="flow-grid"]',
	)!;
	act(() => root.render(null));
	// Bare parts carry no tile chrome: no frame, header, category caption or accent rail.
	expect(flowGrid.querySelector('[data-testid="tile-accent-rail"]')).toBeNull();
	expect(flowGrid.querySelector('[role="group"]')).toBeNull();
	expect(cells(flowGrid)).toEqual(expected.cells);
	expect(serialise(flowGrid)).toEqual(expected.tree);
	expect(flowGrid.style.gap).toBe(expected.gap);
	return expected.cells;
}

/** Where each part sits in the flow grid, by the part it is (a copy reads as its original). */
function arrangement() {
	const home = homeScreen();
	const typeOf = new Map(
		home.widgets.map((w) => [w.id, w.type.replace(/^copy-/, '').replace(/-copy$/, '')]),
	);
	return flowPlacementsForOrder(
		flowOrder(home.widgets.map((w) => ({ id: w.id, ...w.layout }))),
		FLOW_COLUMNS.desktop,
	)
		.map(({ id, column, row, span, rowSpan }) => ({
			part: typeOf.get(id),
			column,
			row,
			span,
			rowSpan,
		}))
		.sort((a, b) => a.row - b.row || a.column - b.column);
}

/**
 * Rebuild one part the way a GM does: open the system definition in the widget builder (the
 * builder's own `readPackage`), save it under their own package and type (`buildPackage`), install
 * and enable it, and put it on the home screen where the original was.
 */
async function rebuildPart(type: (typeof HOME_WIDGET_TYPES)[number]) {
	const definition = findWidgetDefinition(runtime.state.widgets, type)!;
	const draft = readPackage(
		{
			id: 'system.home-widgets',
			version: '1.0.0',
			displayName: definition.displayName,
			widgets: [definition],
			migrations: [],
			assets: [],
			portabilityWarnings: [],
		},
		'proposed',
	);
	const pkg = buildPackage({ ...draft, packageId: `user.copy-${type}`, typeId: `copy-${type}` });
	await accept({ type: 'widget.package.install', payload: { package: pkg } } as never);
	await accept({ type: 'widget.package.enable', payload: { packageId: pkg.id } } as never);
	const home = homeScreen();
	const original = home.widgets.find((widget) => widget.type === type)!;
	await accept({
		type: 'scene.add-widget',
		payload: {
			sceneId: home.id,
			widget: {
				type: `copy-${type}`,
				version: pkg.version,
				layout: {
					x: original.layout.x,
					y: original.layout.y,
					w: original.layout.w,
					h: original.layout.h,
				},
				configuration: {},
				localState: {},
				binding: null,
			},
		},
	} as never);
	await accept({
		type: 'scene.destroy-widget',
		payload: { sceneId: home.id, widgetInstanceId: original.id },
	} as never);
}

describe('the Command Center as the default screen (RC-CAN-7.6)', () => {
	it('is a flow screen of five system template parts, each in its own widget region', async () => {
		await seedDemoVault();
		const main = await renderHub();
		const home = homeScreen();
		expect(home.screen?.layoutPolicy).toBe('flow');
		expect(home.widgets.map((widget) => widget.type)).toEqual([...HOME_WIDGET_TYPES]);
		for (const type of HOME_WIDGET_TYPES) {
			const definition = findWidgetDefinition(runtime.state.widgets, type);
			expect(definition?.renderEntrypoint?.runtime).toBe('template');
		}
		// The documented difference from the baselines: one labelled region per part.
		expect(
			[...main.querySelectorAll('section[data-widget-region]')].map((region) =>
				region.getAttribute('aria-label'),
			),
		).toEqual(['1. Resume', '2. Scenes', '3. Create', '4. Manage', '5. Library']);
		// Create over Manage beside the scenes: the hub's two-column body.
		expect(arrangement()).toEqual([
			{ part: 'home-hero', column: 0, row: 0, span: 12, rowSpan: undefined },
			{ part: 'home-scenes', column: 0, row: 1, span: 7, rowSpan: 2 },
			{ part: 'home-create', column: 7, row: 1, span: 5, rowSpan: undefined },
			{ part: 'home-manage', column: 7, row: 2, span: 5, rowSpan: undefined },
			{ part: 'home-library', column: 0, row: 3, span: 12, rowSpan: undefined },
		]);
	});

	it('a part with nothing to show leaves the layout (Manage at the core tier)', async () => {
		await seedDemoVault();
		document.documentElement.setAttribute('data-feature-tier', 'core');
		const main = await renderHub();
		const shown = [...main.querySelectorAll<HTMLElement>('[data-testid="home-screen"] > div')]
			.filter((part) => part.style.display !== 'none')
			.map((part) => part.querySelector('[data-widget-region]')?.getAttribute('aria-label'));
		expect(shown).toEqual(['1. Resume', '2. Scenes', '3. Create', '5. Library']);
	});

	it('reads the same at its canonical route, /screen/:id, as on / (bare, Create over Manage)', async () => {
		await seedDemoVault();
		expect(await expectCanonicalParity()).toEqual([
			{ part: '1. Resume', column: '1 / span 12', row: '1', shown: true },
			{ part: '2. Scenes', column: '1 / span 7', row: '2 / span 2', shown: true },
			{ part: '3. Create', column: '8 / span 5', row: '2', shown: true },
			{ part: '4. Manage', column: '8 / span 5', row: '3', shown: true },
			{ part: '5. Library', column: '1 / span 12', row: '4', shown: true },
		]);
		// The rail keeps the arrangement on both routes (a screen of bare parts is one page, as the hub
		// was); the phone collapses both to one column.
		viewport = 'rail';
		expect(await expectCanonicalParity()).toEqual([
			{ part: '1. Resume', column: '1 / span 12', row: '1', shown: true },
			{ part: '2. Scenes', column: '1 / span 7', row: '2 / span 2', shown: true },
			{ part: '3. Create', column: '8 / span 5', row: '2', shown: true },
			{ part: '4. Manage', column: '8 / span 5', row: '3', shown: true },
			{ part: '5. Library', column: '1 / span 12', row: '4', shown: true },
		]);
		viewport = 'phone';
		expect(await expectCanonicalParity()).toEqual([
			{ part: '1. Resume', column: '1 / span 1', row: '1', shown: true },
			{ part: '2. Scenes', column: '1 / span 1', row: '2', shown: true },
			{ part: '3. Create', column: '1 / span 1', row: '3', shown: true },
			{ part: '4. Manage', column: '1 / span 1', row: '4', shown: true },
			{ part: '5. Library', column: '1 / span 1', row: '5', shown: true },
		]);
		viewport = 'desktop';
		// At the core tier Manage draws nothing and leaves the layout on both routes.
		document.documentElement.setAttribute('data-feature-tier', 'core');
		const core = await expectCanonicalParity();
		expect(core.filter((cell) => cell.shown).map((cell) => cell.part)).toEqual([
			'1. Resume',
			'2. Scenes',
			'3. Create',
			'5. Library',
		]);
	});

	it('its Presentation and Style settings restyle a part on both routes', async () => {
		await seedDemoVault();
		await renderHub();
		act(() => root.render(null));
		const home = homeScreen();
		const hero = home.widgets.find((widget) => widget.type === 'home-hero')!;
		await accept({
			type: 'scene.configure-widget',
			payload: {
				sceneId: home.id,
				widgetInstanceId: hero.id,
				configuration: {
					presentation: 'framed',
					styleTokens: { accent: '#ff00ff', text: '#00ff00' },
				},
			},
		} as never);
		for (const draw of [renderHub, renderCanonical]) {
			const main = await draw();
			const region = main.querySelector<HTMLElement>('section[aria-label="1. Resume"]')!;
			// Framed: the hero sits in a flow tile frame with its header and accent rail.
			const tile = region.closest('[role="group"]');
			expect(tile?.getAttribute('aria-label')).toBe('Resume, Command Center widget');
			expect(tile?.querySelector('[data-testid="tile-accent-rail"]')).not.toBeNull();
			// The other parts stay bare.
			expect(main.querySelectorAll('[data-testid="tile-accent-rail"]')).toHaveLength(1);
			// The picked colours reach the theme tokens the hub and its DS controls read.
			const scope = region.closest<HTMLElement>('[data-widget-style-scope]')!;
			expect(scope.style.getPropertyValue('--widget-accent')).toBe('#ff00ff');
			expect(scope.style.getPropertyValue('--widget-text')).toBe('#00ff00');
			const from = region.querySelector<HTMLElement>('[data-hub-style]')!;
			expect(from.style.getPropertyValue('--hub-accent')).toBe(
				'var(--widget-accent, var(--color-accent))',
			);
			const to = from.firstElementChild as HTMLElement;
			expect(to.style.getPropertyValue('--color-accent')).toBe('var(--hub-accent, currentColor)');
			expect(to.style.getPropertyValue('--color-text-primary')).toBe(
				'var(--hub-text, currentColor)',
			);
			expect(to.style.getPropertyValue('--color-accent-subtle')).toContain(
				'var(--hub-accent, currentColor)',
			);
			expect(to.style.getPropertyValue('--color-text-secondary')).toContain(
				'var(--hub-text, currentColor)',
			);
			expect(to.querySelector('[data-testid="widget-template-hero"]')).not.toBeNull();
			act(() => root.render(null));
		}
		// An unstyled part keeps the theme's own tints.
		const scenes = (await renderHub()).querySelector<HTMLElement>(
			'section[aria-label="2. Scenes"] [data-hub-style] > div',
		)!;
		expect(scenes.style.getPropertyValue('--color-accent-subtle')).toBe('');
	});

	it('a GM-built duplicate of each part passes the same snapshot', async () => {
		await seedDemoVault();
		const original = serialise(await renderHub());
		act(() => root.render(null));
		for (const type of HOME_WIDGET_TYPES) {
			await rebuildPart(type);
			const rebuilt = serialise(await renderHub());
			act(() => root.render(null));
			expect(rebuilt, `after rebuilding ${type}`).toEqual(original);
		}
		// All five are now the GM's own widgets; the column is re-formed with the group command.
		const home = homeScreen();
		expect(home.widgets.every((widget) => widget.type.startsWith('copy-'))).toBe(true);
		await accept({
			type: 'scene.group-widgets',
			payload: {
				sceneId: home.id,
				widgetInstanceIds: home.widgets
					.filter((widget) => ['copy-home-create', 'copy-home-manage'].includes(widget.type))
					.map((widget) => widget.id),
			},
		} as never);
		expect(serialise(await renderHub())).toEqual(original);
		expect(arrangement().map(({ part, column, row, span }) => [part, column, row, span])).toEqual([
			['home-hero', 0, 0, 12],
			['home-scenes', 0, 1, 7],
			['home-create', 7, 1, 5],
			['home-manage', 7, 2, 5],
			['home-library', 0, 3, 12],
		]);
		// The copies read the same at the screen's own route too.
		act(() => root.render(null));
		await expectCanonicalParity();
	});
	it('a GM copies each part with Edit widget and saves it from the builder; it reads the same', async () => {
		await seedDemoVault();
		const original = serialise(await renderHub());
		act(() => root.render(null));
		for (const type of HOME_WIDGET_TYPES) {
			// "Edit widget" (tile menu, Inspector) is offered: the part is copied first.
			const target = widgetEditTarget(runtime.state, type);
			expect(target?.kind, type).toBe('fork');
			if (target?.kind !== 'fork') return;
			// What `useEditWidget` dispatches: fork, then move the placed part onto the copy.
			const identity = widgetPackageForkIdentity(runtime.state.widgets, type);
			await accept({
				type: 'widget.package.fork',
				payload: {
					packageId: target.source.package.id,
					widgetType: type,
					forkPackageId: identity.packageId,
					forkWidgetType: identity.widgetType,
				},
			} as never);
			const home = homeScreen();
			const placed = home.widgets.find((widget) => widget.type === type)!;
			await accept({
				type: 'scene.repoint-widget',
				payload: { sceneId: home.id, widgetInstanceId: placed.id, widgetType: identity.widgetType },
			} as never);
			const copy = runtime.state.widgets.packages[identity.packageId]!;
			expect(copy.enabled, `${type} copy is on`).toBe(true);
			// Its settings, queries and intents came with it.
			const definition = copy.package.widgets[0]!;
			const source = findWidgetDefinition(runtime.state.widgets, type)!;
			expect(definition.author).toBe('user');
			expect(definition.configFields).toEqual(source.configFields);
			expect(definition.dataQueries).toEqual(source.dataQueries);
			expect(definition.intents).toEqual(source.intents);
			expect(serialise(await renderHub()), `after copying ${type}`).toEqual(original);
			act(() => root.render(null));
			// The builder opens on the copy and saves it (an upgrade at the next version).
			await accept({
				type: 'widget.package.upgrade',
				payload: { package: buildPackage(readPackage(copy.package), copy.package.migrations) },
			} as never);
			expect(serialise(await renderHub()), `after saving ${type}`).toEqual(original);
			act(() => root.render(null));
		}
		// Every part is now the GM's own copy, in place (same instance, layout and group).
		expect(homeScreen().widgets.every((widget) => widget.type.endsWith('-copy'))).toBe(true);
		expect(arrangement().map(({ part, column, row, span }) => [part, column, row, span])).toEqual([
			['home-hero', 0, 0, 12],
			['home-scenes', 0, 1, 7],
			['home-create', 7, 1, 5],
			['home-manage', 7, 2, 5],
			['home-library', 0, 3, 12],
		]);
		for (const tier of ['desktop', 'rail', 'phone'] as const) {
			viewport = tier;
			await expectCanonicalParity();
		}
	});

	it('other system template widgets stay locked', async () => {
		await seedDemoVault();
		const locked = Object.values(runtime.state.widgets.packages)
			.flatMap((record) => record.package.widgets)
			.filter(
				(widget) =>
					widget.author === 'system' &&
					widget.renderEntrypoint?.runtime === 'template' &&
					!(HOME_WIDGET_TYPES as readonly string[]).includes(widget.type),
			);
		expect(locked.length).toBeGreaterThan(0);
		for (const widget of locked) expect(widgetEditTarget(runtime.state, widget.type)).toBeNull();
		const result = await runtime.dispatch({
			type: 'widget.package.fork',
			actorId: DM.id,
			payload: {
				packageId: Object.values(runtime.state.widgets.packages).find((record) =>
					record.package.widgets.includes(locked[0]!),
				)!.package.id,
				widgetType: locked[0]!.type,
			},
		} as CoreCommand);
		expect(result.status).toBe('rejected');
	});
});
