// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createDemoMapState,
	dispatchCommand,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { buildInitialState, makeEnvironment } from '@dndtools/core/testing';
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

const { CommandCenter } = await import('./CommandCenter');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
