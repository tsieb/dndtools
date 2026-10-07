// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createDemoMapState,
	dispatchCommand,
	getGraphVisualizationForActor,
	kindWordFor,
	suggestWikilinkTargetsForActor,
	VAULT_OBJECT_SUBTYPE_KEY,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { I18nProvider, loadCatalog, translate, type MessageKey } from '../../i18n';
import { seedDemoContent } from '../../runtime/demo-seed';
import { wikilinkKindLabel } from '../../app/editor/Autocomplete';
import { KIND_LABEL, KIND_PLURAL_LABEL, kindLabel } from './presentation';

/**
 * RC-KNW-6.2 — ONE object, ONE kind word, on every surface that names it.
 *
 * The object is the demo seed's Ashen Hand, which until this story was a note titled "Faction · The
 * Ashen Hand" and is now a faction dossier. It used to read "Story entry" on the Graph, "Story
 * entries" in the Notes filter, "Story entry" in the palette and "Note" (later "Factions") in the
 * `[[` autocomplete. Each surface below is the real component (or, for the autocomplete, the exact
 * composition `NoteViewer` hands its editor) over a real Core seeded by the real demo seed.
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
	readOnly: false,
	env: makeEnvironment(),
	async dispatch(command: CoreCommand): Promise<CommandResult> {
		const result = dispatchCommand(runtime.state, runtime.env, command);
		if (result.status === 'accepted') runtime.state = result.nextState;
		return result;
	},
};

vi.mock('../../runtime/RuntimeContext', () => ({
	useRuntime: () => runtime,
	DEFAULT_DM_ACTOR_ID: 'dm-1',
	isPlaceholderActorName: () => false,
}));
vi.mock('../../app/useViewport', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../app/useViewport')>()),
	useViewport: () => 'desktop',
}));

const { Graph } = await import('../Graph');
const { FiltersPanel } = await import('../knowledge/Filters');
const { CommandPalette } = await import('../../app/CommandPalette');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const TITLE = 'The Ashen Hand';
const en = (key: MessageKey) => translate('en', key);

let root: Root;
let container: HTMLDivElement;

async function seed() {
	const base = buildInitialState(DM, ...PARTICIPANTS);
	runtime.state = { ...base, maps: createDemoMapState() };
	await seedDemoContent(runtime as never, { showcase: false });
}

function ashenHand() {
	const item = Object.values(runtime.state.content.items).find((entry) => entry.title === TITLE);
	if (!item) throw new Error('the seed has no Ashen Hand');
	return item;
}

async function mount(node: React.ReactNode) {
	await act(async () => {
		root.render(
			<I18nProvider>
				<MemoryRouter>{node}</MemoryRouter>
			</I18nProvider>,
		);
	});
}

/** Type into a React-controlled input the way a keystroke does (native setter + bubbling input). */
async function typeInto(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
	await act(async () => {
		setter.call(input, value);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	});
}

const textOf = (el: Element | null | undefined) =>
	(el?.textContent ?? '').replace(/\s+/g, ' ').trim();

beforeEach(async () => {
	await seed();
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = '';
});

describe('RC-KNW-6.2 — one kind vocabulary', () => {
	it('seeds the Ashen Hand as a faction object, so its kind word is Faction', () => {
		const item = ashenHand();
		expect(item.kind).toBe('object');
		expect(item.fields[VAULT_OBJECT_SUBTYPE_KEY]).toBe('faction');
		expect(kindWordFor(item.kind, item.fields[VAULT_OBJECT_SUBTYPE_KEY])).toBe('faction');
		expect(kindLabel(item.kind, item.fields[VAULT_OBJECT_SUBTYPE_KEY], en)).toBe('Faction');
	});

	it('Graph: the legend, the result row and the inspector all say Faction', async () => {
		const item = ashenHand();
		const viz = getGraphVisualizationForActor(
			runtime.state.content,
			runtime.state.maps,
			runtime.state.session,
			runtime.state.permissions,
			DM.id,
			'local-vault',
		);
		expect(viz.nodes.find((node) => node.id === item.id)?.kind).toBe('faction');

		await mount(<Graph />);
		const results = container.querySelector('.graph-results')!;
		const row = [...results.querySelectorAll('button')].find((b) => textOf(b).includes(TITLE))!;
		expect(textOf(row.querySelector('.graph-meta'))).toMatch(/^Faction\b/);
		// The facet chip filters by the same word.
		const chip = [...container.querySelectorAll('.graph-facets button')].map(textOf);
		expect(chip).toContain('Faction');
		expect(chip).not.toContain('Story entry');
		// The legend entry (a span outside any control) names the kind the same way.
		const legend = [...container.querySelectorAll('span')].filter(
			(span) => !span.closest('button') && textOf(span) === 'Faction',
		);
		expect(legend).not.toHaveLength(0);
		// Nothing on the screen still says the storage word.
		expect(container.textContent).not.toContain('Story entry');

		// Selecting the row opens the inspector, whose kind badge says the same word.
		await act(async () => row.click());
		const open = [...container.querySelectorAll('button')].find(
			(b) => textOf(b) === 'Open in Story',
		);
		expect(open, 'a faction opens in Story').toBeDefined();
		expect(textOf(open!.closest('section'))).toMatch(/^SelectedFaction/);
	});

	it('Notes filter: the hit is counted and found under Factions', async () => {
		await mount(<FiltersPanel initialQuery="Ashen Hand" />);
		const chip = container.querySelector('[data-testid="filters-type-faction"]')!;
		expect(textOf(chip)).toBe(`${en(KIND_PLURAL_LABEL.faction)} · 1`);
		expect(container.querySelector('[data-testid="filters-type-object"]')).toBeNull();
		expect(container.textContent).not.toContain('Story entries');

		await act(async () => (chip as HTMLElement).click());
		const results = container.querySelector('[data-testid="filters-results"]');
		expect(textOf(results)).toContain(TITLE);
		// The quest chip, the other `object` kind, does not claim it.
		expect(textOf(container.querySelector('[data-testid="filters-type-quest"]'))).toMatch(/ · 0$/);
	});

	it('Command palette: the hit sits under Factions and its meta says Faction', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			await mount(<CommandPalette open onClose={() => {}} />);
			const input = document.querySelector('[role="combobox"]') as HTMLInputElement;
			await typeInto(input, 'Ashen');
			await act(async () => {
				await vi.advanceTimersByTimeAsync(400);
			});
			const option = [...document.querySelectorAll('[role="option"]')].find((o) =>
				textOf(o).startsWith(TITLE),
			);
			expect(option, 'the Ashen Hand is a palette hit').toBeDefined();
			expect(textOf(option)).toContain('Faction');
			expect(textOf(option)).not.toContain('Story entry');
			expect(option!.closest('[role="group"]')?.getAttribute('aria-label')).toBe(
				en(KIND_PLURAL_LABEL.faction),
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it('[[ autocomplete: the suggestion row says Faction', () => {
		const item = ashenHand();
		const entry = suggestWikilinkTargetsForActor(
			runtime.state.content,
			runtime.state.permissions,
			DM.id,
			'Ashen',
			runtime.state,
		).find((suggestion) => suggestion.itemId === item.id);
		expect(entry).toBeDefined();
		expect(wikilinkKindLabel(entry!.kind, en)).toBe('Faction');
	});

	it('says the same word in Spanish on every surface it reads from', async () => {
		await loadCatalog('es');
		const item = ashenHand();
		const es = (key: MessageKey) => translate('es', key);
		const word = kindWordFor(item.kind, item.fields[VAULT_OBJECT_SUBTYPE_KEY]);
		expect(es(KIND_LABEL[word])).toBe('Facción');
		expect(es(KIND_PLURAL_LABEL[word])).toBe('Facciones');
		expect(kindLabel(item.kind, item.fields[VAULT_OBJECT_SUBTYPE_KEY], es)).toBe('Facción');
		expect(wikilinkKindLabel('faction', es)).toBe('Facción');
		// Every kind word is translated, not left in English.
		for (const key of [...Object.values(KIND_LABEL), ...Object.values(KIND_PLURAL_LABEL)]) {
			if (key === 'kind.npc' || key === 'kind.plural.npc') continue; // "PNJ" either way
			expect(es(key), key).not.toBe(en(key));
		}
	});
});
