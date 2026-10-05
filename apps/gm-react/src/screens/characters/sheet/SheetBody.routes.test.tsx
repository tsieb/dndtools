// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchCommand, type Actor, type CoreCommand, type CoreStateSlice } from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { I18nProvider } from '../../../i18n';
import { buildPlayerData } from '../../../net/viewModels';
import { SheetSection } from '../../play/Sheet';
import { Player } from '../../player';
import { CharacterSheet } from '../CharacterSheet';
import {
	capabilitiesFromWrites,
	sheetCapabilitiesFor,
	sheetPlan,
	type SheetCapabilities,
} from './capabilities';

/**
 * RC-CHR-6.2 — one sheet body on three routes. Over a fixture campaign built through the real core,
 * each route (`/characters/:id`, `/player`, the companion's Sheet) is rendered for each viewer, and every
 * section's `data-sheet-panel` set is read off the DOM. For one viewer the three routes render the SAME
 * panels, and that set is exactly `sheetPlan` of the capabilities the core grants — so what differs
 * between viewers is capability, never route.
 */

vi.mock('../../../app/useViewport', () => ({ useViewport: () => 'desktop' }));
const runtimeStub = vi.hoisted(() => ({
	state: undefined as unknown,
	defaultActorId: '',
	readOnly: false,
	actors: [] as unknown[],
	newId: () => 'new-id',
	dispatch: async () => ({ status: 'accepted' }),
}));
vi.mock('../../../runtime/RuntimeContext', () => ({ useRuntime: () => runtimeStub }));

/** A player with no PC of their own, holding `combat-participant` on someone else's. */
const HELPER: Actor = { id: 'actor-helper', role: 'player', displayName: 'Helper' };

function fixture(): { state: CoreStateSlice; pcId: string } {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, HELPER);
	const run = (command: CoreCommand) => {
		const result = dispatchCommand(state, env, command);
		if (result.status !== 'accepted')
			throw new Error(`${command.type}: ${result.rejection.message}`);
		state = result.nextState;
	};
	run({
		type: 'character.create-draft',
		actorId: DM_ACTOR.id,
		payload: { ownerActorId: PLAYER_ACTOR.id, name: 'Ysolde', visibility: 'player-visible' },
	});
	const draftId = Object.keys(state.characters.drafts)[0]!;
	const step = (stepId: string, values: Record<string, unknown>) =>
		run({
			type: 'character.update-draft-step',
			actorId: PLAYER_ACTOR.id,
			payload: { draftId, stepId, values },
		});
	step('identity', { name: 'Ysolde', background: 'sage' });
	step('abilities', { str: 10, dex: 14, con: 12, int: 15, wis: 11, cha: 10 });
	step('class', { class: 'wizard' });
	run({ type: 'character.finalize-draft', actorId: PLAYER_ACTOR.id, payload: { draftId } });
	const pcId = Object.values(state.characters.characters).find((c) => c.kind === 'pc')!.id;
	for (const [playerActorId, capabilitySet] of [
		[PLAYER_ACTOR.id, 'owner'],
		[HELPER.id, 'combat-participant'],
	] as const)
		run({
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: { entityType: 'character', entityId: pcId, playerActorId, capabilitySet },
		});
	return { state: state as CoreStateSlice, pcId };
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

type Route = '/characters/:id' | '/player' | 'companion';

/** Render `route` for `viewer` and read every sheet section's panels, in tab order. */
function panelsOn(
	route: Route,
	state: CoreStateSlice,
	pcId: string,
	viewer: string,
	readOnly: boolean,
): Record<string, string[]> {
	Object.assign(runtimeStub, {
		state,
		defaultActorId: viewer,
		readOnly,
		actors: Object.values(state.permissions.actors),
	});
	const data = buildPlayerData(state, viewer);
	const node =
		route === '/characters/:id' ? (
			<CharacterSheet id={pcId} onBack={() => undefined} />
		) : route === '/player' ? (
			<Player />
		) : (
			<SheetSection
				data={data}
				// The companion frame folds a read-only preview into "no writes" (play/Frame.tsx).
				writes={readOnly ? { combat: false, manage: false } : data.sheetWrites}
				actorId={viewer}
				onWrite={async () => true}
			/>
		);
	act(() => root.unmount());
	root = createRoot(container);
	act(() => {
		root.render(
			<MemoryRouter>
				<I18nProvider>{node}</I18nProvider>
			</MemoryRouter>,
		);
	});
	const sections: Record<string, string[]> = {};
	const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
	for (const tab of tabs) {
		const id = tab.id.replace(/^.*-tab-/, '');
		// `/player`'s Party tab is the DM shell's own, not a section of the sheet.
		if (id === 'party') continue;
		act(() => tab.click());
		sections[id] = [...container.querySelectorAll('[data-sheet-panel]')].map(
			(el) => el.getAttribute('data-sheet-panel')!,
		);
	}
	return sections;
}

const planOf = (caps: SheetCapabilities) =>
	Object.fromEntries(sheetPlan(caps).map((s) => [s.section, s.panels]));

describe('RC-CHR-6.2 — the same sheet body on every route, differing only by capability', () => {
	const { state, pcId } = fixture();
	const viewers = {
		dm: { actor: DM_ACTOR.id, readOnly: false, routes: ['/characters/:id', '/player'] },
		owner: {
			actor: PLAYER_ACTOR.id,
			readOnly: false,
			routes: ['/characters/:id', '/player', 'companion'],
		},
		'combat participant': {
			actor: HELPER.id,
			readOnly: false,
			routes: ['/characters/:id', '/player', 'companion'],
		},
		'read-only preview': {
			actor: PLAYER_ACTOR.id,
			readOnly: true,
			routes: ['/characters/:id', '/player', 'companion'],
		},
	} as const;

	for (const [name, viewer] of Object.entries(viewers)) {
		it(`${name}: every route renders the panels the core's capabilities admit`, () => {
			const caps = sheetCapabilitiesFor(state, viewer.actor, pcId, viewer.readOnly);
			for (const route of viewer.routes) {
				expect(panelsOn(route, state, pcId, viewer.actor, viewer.readOnly), route).toEqual(
					planOf(caps),
				);
			}
			// The companion's capabilities come from the host's grant check — the same answer.
			if ((viewer.routes as readonly string[]).includes('companion')) {
				const writes = buildPlayerData(state, viewer.actor).sheetWrites;
				expect(
					capabilitiesFromWrites(viewer.readOnly ? { combat: false, manage: false } : writes),
				).toEqual(caps);
			}
		});
	}

	// One snapshot per route: the panel set each viewer gets there. The DM shell routes and the
	// companion share their entries for every viewer they both serve, by the assertions above.
	for (const route of ['/characters/:id', '/player', 'companion'] as const) {
		it(`snapshot: ${route}`, () => {
			const sets = Object.fromEntries(
				Object.entries(viewers)
					.filter(([, viewer]) => (viewer.routes as readonly string[]).includes(route))
					.map(([name, viewer]) => [
						name,
						Object.values(panelsOn(route, state, pcId, viewer.actor, viewer.readOnly)).flat(),
					]),
			);
			expect(sets).toMatchSnapshot();
		});
	}
});
