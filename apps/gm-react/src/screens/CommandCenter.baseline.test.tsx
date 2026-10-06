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
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { FLOW_COLUMNS, flowOrder } from '../app/board-helpers';
import { buildPackage, readPackage } from '../app/widgetBuilder/draft';
import { I18nProvider } from '../i18n';
import { seedDemoContent } from '../runtime/demo-seed';

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

const { CommandCenter, homePlacements } = await import('./CommandCenter');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout: each widget region's fit probe measures text ranges on an animation frame,
// which can fire after a test under load. Without these it throws outside any test.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

// --- The two serialisations ---------------------------------------------------------------------

const KEPT_TAGS = new Set([
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'button',
	'a',
	'input',
	'select',
	'textarea',
	'img',
	'svg',
	'section',
	'main',
	'nav',
	'ul',
	'ol',
	'li',
]);
const KEPT_ATTRIBUTES = [
	'role',
	'aria-label',
	'aria-current',
	'aria-pressed',
	'aria-disabled',
	'aria-hidden',
	'aria-busy',
	'title',
	'type',
	'tabindex',
	'disabled',
	'data-widget-region',
];

const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

/** The semantic DOM skeleton: kept elements with their a11y attributes, text merged per parent. */
export function domSkeleton(root: Element): string {
	const lines: string[] = [];
	const walk = (node: Node, depth: number) => {
		let text = '';
		const flush = () => {
			if (squash(text)) lines.push(`${'  '.repeat(depth)}"${squash(text)}"`);
			text = '';
		};
		for (const child of node.childNodes) {
			if (child.nodeType === 3) {
				text += child.textContent ?? '';
				continue;
			}
			if (!(child instanceof Element)) continue;
			const tag = child.tagName.toLowerCase();
			if (!KEPT_TAGS.has(tag) && !child.hasAttribute('role')) {
				flush();
				walk(child, depth);
				continue;
			}
			flush();
			const attributes = KEPT_ATTRIBUTES.filter((name) => child.hasAttribute(name)).map(
				(name) => `${name}=${JSON.stringify(child.getAttribute(name))}`,
			);
			lines.push(`${'  '.repeat(depth)}<${tag}${attributes.map((a) => ` ${a}`).join('')}>`);
			if (tag !== 'svg') walk(child, depth + 1);
		}
		flush();
	};
	walk(root, 0);
	return lines.join('\n');
}

const HIDDEN = (el: Element) =>
	el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden');

function roleOf(el: Element): string | null {
	const explicit = el.getAttribute('role');
	if (explicit) return explicit;
	const tag = el.tagName.toLowerCase();
	if (/^h[1-6]$/.test(tag)) return 'heading';
	if (tag === 'button') return 'button';
	if (tag === 'a' && el.hasAttribute('href')) return 'link';
	if (tag === 'img') return 'img';
	if (tag === 'main') return 'main';
	if (tag === 'nav') return 'navigation';
	if (tag === 'section' && el.hasAttribute('aria-label')) return 'region';
	if (tag === 'ul' || tag === 'ol') return 'list';
	if (tag === 'li') return 'listitem';
	return null;
}

/** Text an accessible-name-from-content computation reads, with element boundaries as spaces. */
function contentText(el: Element): string {
	const parts: string[] = [];
	const walk = (node: Node) => {
		for (const child of node.childNodes) {
			if (child.nodeType === 3) parts.push(child.textContent ?? '');
			else if (child instanceof Element && !HIDDEN(child)) {
				parts.push(' ');
				walk(child);
				parts.push(' ');
			}
		}
	};
	walk(el);
	return squash(parts.join(''));
}

const NAME_FROM_CONTENT = new Set(['button', 'heading', 'link', 'listitem']);

/** The accessibility tree, printed as `ariaSnapshot()` prints it. */
export function ariaTree(root: Element): string {
	const lines: string[] = [];
	const walk = (node: Node, depth: number) => {
		let text = '';
		const flush = () => {
			if (squash(text)) lines.push(`${'  '.repeat(depth)}- text: ${squash(text)}`);
			text = '';
		};
		for (const child of node.childNodes) {
			if (child.nodeType === 3) {
				text += child.textContent ?? '';
				continue;
			}
			if (!(child instanceof Element) || HIDDEN(child)) continue;
			const role = roleOf(child);
			if (!role) {
				text += ' ';
				walk(child, depth);
				continue;
			}
			flush();
			const label = child.getAttribute('aria-label');
			const name = label ?? (NAME_FROM_CONTENT.has(role) ? contentText(child) : '');
			const level = role === 'heading' ? ` [level=${child.tagName.slice(1)}]` : '';
			const head = `${'  '.repeat(depth)}- ${role}${name ? ` ${JSON.stringify(name)}` : ''}${level}`;
			if (NAME_FROM_CONTENT.has(role) || role === 'img') {
				lines.push(head);
				continue;
			}
			const before = lines.length;
			lines.push(`${head}:`);
			walk(child, depth + 1);
			if (lines.length === before + 1) lines[before] = head;
		}
		flush();
	};
	// `walk` flushes text it collected inside a role-less wrapper only at that wrapper's end, so a
	// run of text split by wrappers reads as one line, the way the accessibility tree reads it.
	walk(root, 0);
	return lines.join('\n');
}

/** Headings in document order, as a screen reader's heading list announces them. */
export function headingOutline(root: Element): string {
	return [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')]
		.filter((el) => !el.closest('[aria-hidden="true"]'))
		.map((el) => `${el.tagName.toLowerCase()} ${squash(el.textContent)}`)
		.join('\n');
}

/** Every tab stop in order, by role and accessible name: the hub's keyboard order. */
export function focusOrder(root: Element): string {
	const stops = [
		...root.querySelectorAll<HTMLElement>(
			'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
		),
	].filter((el) => !el.hasAttribute('disabled') && !el.closest('[aria-hidden="true"],[hidden]'));
	return stops
		.map(
			(el) =>
				`${roleOf(el) ?? el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? contentText(el)}`,
		)
		.join('\n');
}

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

/** Where each part sits in the flow grid, by the part it is (a copy reads as its original). */
function arrangement() {
	const home = homeScreen();
	const typeOf = new Map(home.widgets.map((w) => [w.id, w.type.replace(/^copy-/, '')]));
	return homePlacements(
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
	});
});
