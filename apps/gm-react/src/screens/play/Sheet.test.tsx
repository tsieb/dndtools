// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchCommand, type Actor, type CoreCommand, type CoreStateSlice } from '@dndtools/core';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '@dndtools/core/testing';
import { I18nProvider } from '../../i18n';
import type { CommandRequest } from '../../net/messages';
import { buildPlayerData, NO_SHEET_WRITES, type SheetWrites } from '../../net/viewModels';
import { SheetSection } from './Sheet';

// The layout reads the resolved viewport profile; the fixture renders the desktop one.
vi.mock('../../app/useViewport', () => ({ useViewport: () => 'desktop' }));

// The class-resource panel mints ids for homebrew rows through the runtime, and the level-up wizard
// reads the device's own state (in a preview, the fixture campaign).
const runtimeStub = vi.hoisted(() => ({ newId: () => 'homebrew-1', state: undefined as unknown }));
vi.mock('../../runtime/RuntimeContext', () => ({ useRuntime: () => runtimeStub }));

/**
 * RC-CHR-6.1 — the companion sheet draws only what the actor may dispatch. Over a fixture campaign built
 * through the real Core, a read-only preview renders no live control at all, and for every viewer who
 * does hold writes, pressing any control the sheet drew produces only commands the Core accepts from
 * that viewer. A control the Core would refuse cannot survive either check.
 */

/** A player with no PC of their own, holding `combat-participant` on someone else's. */
const HELPER: Actor = { id: 'actor-helper', role: 'player', displayName: 'Helper' };

function fixture() {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, HELPER, OBSERVER_ACTOR);
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
	const grant = (playerActorId: string, capabilitySet: string) =>
		run({
			type: 'permission.grant-capability-set',
			actorId: DM_ACTOR.id,
			payload: { entityType: 'character', entityId: pcId, playerActorId, capabilitySet },
		});
	grant(PLAYER_ACTOR.id, 'owner');
	grant(HELPER.id, 'combat-participant');
	// Enough on the sheet that every control the block can draw is drawn: hit points with temporary
	// HP, a condition to remove, slots partly spent, a class resource, a prepared spell and a
	// concentration with an outstanding check.
	run({
		type: 'character.set-combat',
		actorId: DM_ACTOR.id,
		payload: { characterId: pcId, hp: 14, maxHp: 20, ac: 12 },
	});
	const as = (type: string, payload: Record<string, unknown>) =>
		run({ type, actorId: DM_ACTOR.id, payload: { characterId: pcId, ...payload } } as CoreCommand);
	as('character.update-combat-resource', { kind: 'temp-hp', value: 4 });
	as('character.update-combat-resource', { kind: 'condition', condition: 'prone', present: true });
	as('character.set-spell-slots', { level: 1, max: 3, expended: 1 });
	as('character.set-class-resource', {
		id: 'arcane-recovery',
		name: 'Arcane recovery',
		max: 2,
		recharge: 'long',
		expended: 0,
	});
	as('character.set-spell', { id: 'shield', name: 'Shield', level: 1, prepared: true });
	as('character.update-combat-resource', { kind: 'concentration', effect: 'Hold person' });
	as('character.update-combat-resource', { kind: 'hp', delta: -2 });
	return { env, state: state as CoreStateSlice };
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

// Section tabs navigate within the sheet; they write nothing, so they are not controls here.
const LIVE_CONTROLS =
	'button:not([disabled]):not([role="tab"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="button"]:not([aria-disabled="true"])';
const PRESSABLE = 'button:not([disabled]):not([role="tab"])';

/** The body's section tabs, by id (RC-CHR-6.2: Sheet · Resources · Level up · Journal · History). */
const sectionIds = () =>
	[...container.querySelectorAll('[role="tab"]')].map((tab) =>
		tab.id.replace('play-sheet-tab-', ''),
	);

function openSection(id: string) {
	act(() => {
		container.querySelector<HTMLButtonElement>(`#play-sheet-tab-${id}`)?.click();
	});
}

function mount(
	state: CoreStateSlice,
	viewer: string,
	writes: SheetWrites,
	onWrite: (command: CommandRequest) => Promise<boolean>,
) {
	const data = buildPlayerData(state, viewer);
	runtimeStub.state = state;
	act(() => {
		root.render(
			<MemoryRouter>
				<I18nProvider>
					<SheetSection data={data} writes={writes} actorId={viewer} onWrite={onWrite} />
				</I18nProvider>
			</MemoryRouter>,
		);
	});
	return data;
}

describe('RC-CHR-6.1 — the companion sheet draws nothing the actor cannot dispatch', () => {
	it('a read-only preview renders the sheet with no live control at all', () => {
		const { state } = fixture();
		const onWrite = vi.fn(async () => true);
		const data = mount(state, PLAYER_ACTOR.id, NO_SHEET_WRITES, onWrite);
		// The fixture is a real sheet: the owner WOULD hold every write outside the preview.
		expect(data.sheetWrites).toEqual({ combat: true, manage: true });
		expect(container.textContent).toContain('Ysolde');
		const sections = sectionIds();
		expect(sections).toEqual(['sheet', 'resources', 'journal', 'history']);
		for (const section of sections) {
			openSection(section);
			expect(
				[...container.querySelectorAll(LIVE_CONTROLS)].map(
					(el) => `${section}: ${el.getAttribute('aria-label') ?? el.textContent}`,
				),
			).toEqual([]);
		}
		openSection('resources');
		expect(container.textContent).toContain('Arcane recovery');
	});

	for (const [who, viewer] of [
		['the owner', PLAYER_ACTOR.id],
		['a combat participant', HELPER.id],
	] as const) {
		it(`every control drawn for ${who} sends only commands the core accepts`, async () => {
			const { env, state } = fixture();
			const probe = mount(
				state,
				viewer,
				buildPlayerData(state, viewer).sheetWrites,
				async () => true,
			);
			expect(probe.pcId).not.toBeNull();
			const sent: CommandRequest[] = [];
			let pressed = 0;
			for (const section of sectionIds()) {
				openSection(section);
				const count = container.querySelectorAll(PRESSABLE).length;
				for (let index = 0; index < count; index += 1) {
					// A fresh sheet per control, so no press leans on a state an earlier press left behind.
					const data = buildPlayerData(state, viewer);
					act(() => root.unmount());
					root = createRoot(container);
					mount(state, viewer, data.sheetWrites, async (command) => {
						sent.push(command);
						return true;
					});
					openSection(section);
					const button = container.querySelectorAll<HTMLButtonElement>(PRESSABLE)[index];
					await act(async () => {
						button?.click();
					});
					pressed += 1;
				}
			}
			expect(pressed).toBeGreaterThan(0);
			expect(sent.length).toBeGreaterThan(0);
			// The question is AUTHORITY: a value the core refuses for this sheet's numbers (spending a coin
			// the purse does not hold — equipment.spec relies on that refusal) is not a dead control.
			for (const command of sent) {
				const result = dispatchCommand(state, env, { ...command, actorId: viewer } as CoreCommand);
				expect(
					result.status === 'accepted' ? 'accepted' : result.rejection.code,
					`${command.type} ${JSON.stringify(command.payload)}: ${
						result.status === 'rejected' ? result.rejection.message : ''
					}`,
				).not.toBe('actor-not-authorized');
			}
			// And the authority-only refusals really are caught: the same presses from an observer fail.
			const observer = sent.filter(
				(command) =>
					dispatchCommand(state, env, {
						...command,
						actorId: OBSERVER_ACTOR.id,
					} as CoreCommand).status === 'accepted',
			);
			expect(observer).toEqual([]);
		});
	}
});
