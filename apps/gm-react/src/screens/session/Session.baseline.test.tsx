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
import { I18nProvider } from '../../i18n';
import { seedDemoContent } from '../../runtime/demo-seed';

/**
 * RC-CAN-7.8 — the Session console's committed baselines.
 *
 * Every snapshot below is `/session` as it shipped before the conversion, rendered against a real
 * Core seeded by the real demo seed (the content the CAN-7.5 captures were taken on), in the states
 * SCREENS_PARITY §3 inventories: Standby at three tiers, Prep, Live, a live fight, Recap with the
 * rest timeline, player preview and a player's own device. Four serialisations per state, the same
 * ones the Command Center's baselines use (`CommandCenter.baseline.test.tsx`; the serialisers are
 * repeated here because a test file cannot import another without running its tests):
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
	preview: null as { actorId: string } | null,
	loaded: true,
	env: makeEnvironment(),
	async dispatch(command: CoreCommand): Promise<CommandResult> {
		const result = dispatchCommand(runtime.state, runtime.env, command);
		if (result.status === 'accepted') runtime.state = result.nextState;
		return result;
	},
};
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

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout: a widget region's fit probe measures text ranges on an animation frame.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

// --- The serialisations (as in CommandCenter.baseline.test.tsx) ---------------------------------

const KEPT_TAGS = new Set(
	'h1 h2 h3 h4 h5 h6 button a input select textarea img svg section main nav ul ol li'.split(' '),
);
const KEPT_ATTRIBUTES = (
	'role aria-label aria-current aria-pressed aria-disabled aria-hidden aria-busy' +
	' title type tabindex disabled data-widget-region'
).split(' ');

const squash = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

function domSkeleton(root: Element): string {
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
	if (tag === 'input') return el.getAttribute('type') === 'checkbox' ? 'checkbox' : 'textbox';
	if (tag === 'textarea') return 'textbox';
	if (tag === 'select') return 'combobox';
	return null;
}

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
const LEAF_ROLES = new Set(['img', 'textbox', 'checkbox', 'combobox']);

function ariaTree(root: Element): string {
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
			if (NAME_FROM_CONTENT.has(role) || LEAF_ROLES.has(role)) {
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
	walk(root, 0);
	return lines.join('\n');
}

function headingOutline(root: Element): string {
	return [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')]
		.filter((el) => !el.closest('[aria-hidden="true"]'))
		.map((el) => `${el.tagName.toLowerCase()} ${squash(el.textContent)}`)
		.join('\n');
}

function focusOrder(root: Element): string {
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
	runtime.preview = null;
	await seedDemoContent(runtime, { showcase: false });
}

async function accept(command: Omit<CoreCommand, 'actorId'> & { actorId?: string }) {
	const result = await runtime.dispatch({ actorId: DM.id, ...command } as CoreCommand);
	if (result.status !== 'accepted')
		throw new Error(`${command.type} rejected: ${result.rejection.message}`);
	return result;
}

/** The first table scene (not the board, not a default screen), as a "Continue" start resumes. */
function tableSceneId(): string {
	const scene = Object.values(runtime.state.scenes.scenes).find(
		(candidate) =>
			!candidate.templateMeta.isTemplate &&
			candidate.id !== runtime.state.commandCenter.homeSceneId &&
			candidate.screen?.origin?.kind !== 'default',
	);
	if (!scene) throw new Error('the demo seed has no table scene');
	return scene.id;
}

async function goLive() {
	await accept({
		type: 'session.set-workflow',
		payload: { workflow: 'active', activeSceneId: tableSceneId() },
	} as never);
}

async function startFight() {
	await accept({
		type: 'combat.start',
		payload: {
			combatants: [
				{ kind: 'monster', name: 'Goblin', initiative: 15, maxHp: 7, ac: 13 },
				{ kind: 'monster', name: 'Ogre', initiative: 10, maxHp: 30, ac: 11 },
				{ kind: 'monster', name: 'Lurker', initiative: 5, maxHp: 12, hidden: true },
			],
		},
	} as never);
	const goblin = Object.values(runtime.state.session.combat.combatants).find(
		(combatant) => combatant.name === 'Goblin',
	)!;
	await accept({
		type: 'combat.apply-resource',
		payload: { combatantId: goblin.id, kind: 'hp', delta: -4 },
	} as never);
}

/** Each player character takes a short rest, so Recap shows the rest timeline (SE-25). */
async function restTheParty() {
	for (const character of Object.values(runtime.state.characters.characters)) {
		if (character.kind !== 'pc') continue;
		await accept({
			type: 'character.rest',
			payload: { characterId: character.id, rest: 'short' },
		} as never);
	}
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
	host = document.createElement('div');
	document.body.append(host);
	root = createRoot(host);
});
afterEach(() => {
	act(() => root.unmount());
	host.remove();
	vi.unstubAllGlobals();
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
