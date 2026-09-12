// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createSystemWidgetPackages,
	dispatchCommand,
	type CoreCommand,
	type CoreStateSlice,
	type WidgetDefinition,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import type { BoardWidget } from '../board-helpers';
import { I18nProvider } from '../../i18n';

/**
 * RC-CAN-2.2 — the tile header, per system widget type, in every theme.
 *
 * jsdom does not resolve custom properties, so a snapshot of the markup alone would be identical in
 * all three themes and prove nothing about them. Each snapshot therefore records the accent token
 * the rail and icon are painted with AND the value that token takes in the snapshot's theme, read
 * straight out of `styles/tokens/colors.css`. A theme losing a tile token, or a type drifting onto
 * another type's accent, shows up in the diff.
 *
 * The runtime is stubbed with a REAL `CoreStateSlice` built by real commands, so the bound-entity
 * name in the header comes out of the same actor-filtered core reads the app uses.
 */

const runtimeRef: {
	state: CoreStateSlice;
	defaultActorId: string;
	dispatch: ReturnType<typeof vi.fn>;
} = {
	state: buildInitialState(DM_ACTOR, PLAYER_ACTOR),
	defaultActorId: DM_ACTOR.id,
	dispatch: vi.fn(async () => ({ status: 'accepted' as const })),
};

vi.mock('../../runtime/RuntimeContext', () => ({
	useRuntime: () => runtimeRef,
	DEFAULT_DM_ACTOR_ID: 'dm-1',
}));

// The map body resolves its raster through the asset store; a test vault has no bytes.
vi.mock('../../platform/assetUrl', () => ({
	useAssetObjectUrl: () => null,
	createAssetObjectUrl: async () => null,
}));

const { WidgetFrame } = await import('./WidgetFrame');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

/** The three shipped themes. `tavern` is the dark one. */
const THEMES = ['parchment', 'tavern', 'high-contrast'] as const;
type Theme = (typeof THEMES)[number];

/** `--color-tile-*` values per theme, merged across every `[data-theme='x']` block that sets them. */
const TILE_TOKENS: ReadonlyMap<string, Readonly<Record<string, string>>> = (() => {
	// jsdom's `import.meta.url` is not a file: URL; the app suite runs from the repo root.
	const css = readFileSync(`${process.cwd()}/apps/gm-react/src/styles/tokens/colors.css`, 'utf8');
	const byTheme = new Map<string, Record<string, string>>();
	for (const block of css.matchAll(/\[data-theme='([^']+)'\]\s*\{([^}]*)\}/g)) {
		const tokens = byTheme.get(block[1]!) ?? {};
		for (const decl of block[2]!.matchAll(/(--color-tile-[a-z]+)\s*:\s*([^;]+);/g)) {
			tokens[decl[1]!] = decl[2]!.trim();
		}
		byTheme.set(block[1]!, tokens);
	}
	return byTheme;
})();

const SYSTEM_DEFINITIONS: WidgetDefinition[] = Object.values(
	createSystemWidgetPackages().packages,
).flatMap((record) => record.package.widgets);

interface Campaign {
	state: CoreStateSlice;
	sharedMapId: string;
	hiddenMapId: string;
	sharedCharacterId: string;
	hiddenCharacterId: string;
}

/** A player-visible map and sidekick, plus a map and a character only the DM may see. */
function campaign(): Campaign {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const run = (command: CoreCommand) => {
		const result = dispatchCommand(state, env, command);
		if (result.status !== 'accepted') {
			throw new Error(`command rejected: ${JSON.stringify(result.rejection)}`);
		}
		state = result.nextState;
	};
	run({
		type: 'map.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Old mill', visibility: 'player-visible' },
	});
	run({
		type: 'map.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'The vault below', visibility: 'dm-only' },
	});
	for (const [name, visibility] of [
		['Brannor', 'player-visible'],
		['Masked stranger', 'dm-only'],
	] as const) {
		run({
			type: 'character.quick-create',
			actorId: DM_ACTOR.id,
			payload: { kind: 'sidekick', name, visibility, combat: { hp: 18, maxHp: 24, ac: 16 } },
		});
	}
	const mapId = (name: string) =>
		(Object.values(state.maps.maps) as Array<{ id: string; name: string }>).find(
			(map) => map.name === name,
		)!.id;
	const characterId = (name: string) =>
		(Object.values(state.characters.characters) as Array<{ id: string; name: string }>).find(
			(character) => character.name === name,
		)!.id;
	return {
		state,
		sharedMapId: mapId('Old mill'),
		hiddenMapId: mapId('The vault below'),
		sharedCharacterId: characterId('Brannor'),
		hiddenCharacterId: characterId('Masked stranger'),
	};
}

const CAMPAIGN = campaign();

/**
 * A placed instance of one definition, shaped the way `boardWidgetsOf` shapes it: the caption is
 * the definition's CATEGORY (falling back to its display name), which is what the tile identity is
 * resolved from on the real board.
 */
function boardWidget(
	definition: WidgetDefinition,
	bindingRef: BoardWidget['bindingRef'] = null,
): BoardWidget {
	return {
		id: `widget-${definition.type}`,
		type: definition.type,
		title: definition.displayName,
		typeLabel: definition.category ?? definition.displayName,
		icon: definition.icon ?? 'widget',
		tier: 'system',
		description: definition.description ?? '',
		visibility: 'dm-only',
		x: 0,
		y: 0,
		w: 4,
		h: 3,
		status: 'available',
		statusNote: null,
		configuration: {},
		configFields: definition.configFields ?? [],
		requiresBinding: (definition.requiredBindings ?? []).length > 0,
		commands: (definition.commands ?? []).map((command) => command.type),
		bindingRef,
	};
}

/** The binding a DM would give a required-binding widget in this campaign: the shared entity. */
function sharedBindingFor(definition: WidgetDefinition): BoardWidget['bindingRef'] {
	const entityType = definition.requiredBindings?.[0]?.entityTypes[0];
	if (entityType === 'map') return { entityType, entityId: CAMPAIGN.sharedMapId };
	if (entityType === 'character') return { entityType, entityId: CAMPAIGN.sharedCharacterId };
	return null;
}

const noop = () => {};

function renderFrame(
	widget: BoardWidget,
	actorId: string,
	theme: Theme = 'parchment',
): HTMLElement {
	runtimeRef.state = CAMPAIGN.state;
	runtimeRef.defaultActorId = actorId;
	act(() =>
		root.render(
			<I18nProvider>
				<div data-theme={theme}>
					<WidgetFrame
						w={widget}
						x={0}
						y={0}
						width={320}
						height={240}
						editing={false}
						selected={false}
						scale={1}
						resizable={false}
						tabbable
						ariaLabel={`${widget.title}, ${widget.typeLabel} widget`}
						onKeyDown={noop}
						onFocusIn={noop}
						registerRef={noop}
						onStartMove={noop}
						onStartResize={noop}
					/>
				</div>
			</I18nProvider>,
		),
	);
	return container.querySelector<HTMLElement>(`[data-testid="widget-${widget.id}"]`)!;
}

/** What a DM scans in the header, plus the accent the theme resolves it to. */
function headerReadout(frame: HTMLElement, theme: Theme) {
	const rail = frame.querySelector<HTMLElement>('[data-testid="tile-accent-rail"]')!;
	// A shorthand carrying `var()` is never expanded into longhands (the substitution happens at
	// computed-value time), so read the shorthand itself: `4px solid var(--color-tile-map)`.
	const [, railWidth = null, token = null] =
		/^(\S+) solid var\((--color-tile-[a-z]+)\)$/.exec(rail.style.borderLeft) ?? [];
	const header = rail.nextElementSibling as HTMLElement;
	const caption = header.nextElementSibling as HTMLElement;
	const icon = header.firstElementChild as SVGElement;
	const type = caption.firstElementChild as HTMLElement;
	const binding = caption.querySelector<HTMLElement>('[data-testid="tile-binding"]');
	return {
		rail: {
			width: railWidth,
			token,
			value: token ? (TILE_TOKENS.get(theme)?.[token] ?? null) : null,
		},
		icon: {
			glyph: icon.getAttribute('class'),
			size: icon.style.width,
			stroke: icon.getAttribute('stroke'),
		},
		label: header.children[1]?.textContent ?? null,
		visibility: header.children[2]?.textContent ?? null,
		type: type.textContent,
		description: type.getAttribute('title'),
		binding: binding
			? { state: binding.getAttribute('data-binding-state'), text: binding.textContent }
			: null,
		silhouette: rail.parentElement?.className ?? null,
	};
}

describe('tile header identity snapshots', () => {
	it('reads all three themes, each declaring the full tile palette', () => {
		for (const theme of THEMES) {
			expect(Object.keys(TILE_TOKENS.get(theme) ?? {}), theme).toHaveLength(12);
		}
		expect(SYSTEM_DEFINITIONS.length).toBeGreaterThan(10);
	});

	describe.each(THEMES)('%s theme', (theme) => {
		it.each(SYSTEM_DEFINITIONS.map((d) => [d.type, d] as const))('%s', (_type, definition) => {
			const frame = renderFrame(
				boardWidget(definition, sharedBindingFor(definition)),
				DM_ACTOR.id,
				theme,
			);
			const readout = headerReadout(frame, theme);
			// Invariants first, so a failure names the broken rule rather than only a snapshot diff.
			expect(readout.rail.width).toBe('4px');
			expect(readout.rail.value, `${readout.rail.token} in ${theme}`).not.toBeNull();
			expect(readout.icon.size).toBe('16px');
			expect(readout.icon.stroke).toBe(`var(${readout.rail.token})`);
			expect(readout).toMatchSnapshot();
		});
	});
});

describe('the header never names what the viewer may not see', () => {
	const mapDefinition = SYSTEM_DEFINITIONS.find((d) => d.type === 'map')!;
	const characterDefinition = SYSTEM_DEFINITIONS.find((d) => d.type === 'character')!;
	const hiddenMap = { entityType: 'map', entityId: CAMPAIGN.hiddenMapId };
	const hiddenCharacter = { entityType: 'character', entityId: CAMPAIGN.hiddenCharacterId };

	function bindingOf(frame: HTMLElement) {
		const el = frame.querySelector<HTMLElement>('[data-testid="tile-binding"]')!;
		return { state: el.getAttribute('data-binding-state'), text: el.textContent };
	}

	it('names a DM-only map for the DM, who may read it', () => {
		const frame = renderFrame(boardWidget(mapDefinition, hiddenMap), DM_ACTOR.id);
		expect(bindingOf(frame)).toEqual({ state: 'bound', text: 'The vault below' });
	});

	it('shows a hidden binding as hidden, and the name nowhere in the frame', () => {
		const frame = renderFrame(
			{
				...boardWidget(mapDefinition, hiddenMap),
				status: 'hidden',
				statusNote: 'Hidden from this viewer',
			},
			PLAYER_ACTOR.id,
		);
		expect(bindingOf(frame)).toEqual({ state: 'hidden', text: 'Hidden' });
		// innerHTML, not textContent: a name in a `title` or `aria-label` leaks just as well.
		expect(container.innerHTML).not.toContain('The vault below');
	});

	it('does not trust a stale "available" status to name a map the viewer may not read', () => {
		const frame = renderFrame(boardWidget(mapDefinition, hiddenMap), PLAYER_ACTOR.id);
		expect(bindingOf(frame)).toEqual({ state: 'bound', text: 'Bound' });
		expect(container.innerHTML).not.toContain('The vault below');
	});

	it('does not name a DM-only character to a player either', () => {
		const frame = renderFrame(boardWidget(characterDefinition, hiddenCharacter), PLAYER_ACTOR.id);
		expect(bindingOf(frame)).toEqual({ state: 'bound', text: 'Bound' });
		expect(container.innerHTML).not.toContain('Masked stranger');
	});

	it('shows an unbound required binding as "Not bound" rather than an empty header', () => {
		const frame = renderFrame(boardWidget(mapDefinition, null), DM_ACTOR.id);
		expect(bindingOf(frame)).toEqual({ state: 'unbound', text: 'Not bound' });
	});

	it('shows no binding glyph on a widget that takes no binding', () => {
		const note = SYSTEM_DEFINITIONS.find((d) => d.type === 'note')!;
		const frame = renderFrame(boardWidget(note), DM_ACTOR.id);
		expect(frame.querySelector('[data-testid="tile-binding"]')).toBeNull();
	});
});
