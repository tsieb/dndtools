// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	dispatchCommand,
	type Actor,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '@dndtools/core';
import { buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { I18nProvider } from '../../i18n';

/**
 * RC-CAN-7.9 — `/board` never renders the bespoke board page any more. A GM is provisioned and
 * redirected (`ScreenRouteAliases`, covered by `screens.spec.ts`); what is left here is the two
 * states `/board` draws when it cannot resolve (`BoardAlias` mounting `Board` with no screen): a
 * non-GM gets the player notice, and a provisioning write that failed gets an honest failure whose
 * Retry asks again — never a board without its screen.
 */

const DM: Actor = { id: 'dm-1', role: 'dm', displayName: 'Dungeon Master' };
const PLAYER: Actor = { id: 'actor-player', role: 'player', displayName: 'Demo Player' };

let failWrites = false;
const commands: string[] = [];
const runtime = {
	state: buildInitialState(DM) as CoreStateSlice,
	defaultActorId: DM.id,
	activeActorId: DM.id,
	loaded: true,
	env: makeEnvironment(),
	async dispatch(command: CoreCommand): Promise<CommandResult> {
		commands.push(command.type);
		// `SceneRuntime.dispatch` rethrows a failed `persistFullState`.
		if (failWrites) throw new Error('QuotaExceededError');
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

const { BoardAlias } = await import('./ScreenView');

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
	host = document.createElement('div');
	document.body.appendChild(host);
	root = createRoot(host);
	runtime.state = buildInitialState(DM) as CoreStateSlice;
	runtime.defaultActorId = DM.id;
	commands.length = 0;
	failWrites = false;
});

afterEach(() => {
	act(() => root.unmount());
	host.remove();
	vi.restoreAllMocks();
});

async function mount() {
	await act(async () => {
		root.render(
			<MemoryRouter initialEntries={['/board']}>
				<I18nProvider>
					<BoardAlias />
				</I18nProvider>
			</MemoryRouter>,
		);
	});
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

const boardRendered = () =>
	host.querySelector('[role="toolbar"]') !== null ||
	host.querySelector('[data-testid^="widget-"]') !== null;

describe('/board (RC-CAN-7.9)', () => {
	it('keeps a pending or failed Retry out of the board engine and allows another attempt', async () => {
		failWrites = true;
		await mount();
		const retry = host.querySelector('button')!;
		let rejectWrite!: (reason: Error) => void;
		const dispatch = vi.spyOn(runtime, 'dispatch').mockImplementationOnce(
			() =>
				new Promise<CommandResult>((_resolve, reject) => {
					rejectWrite = reject;
				}),
		);

		await act(async () => retry.click());
		expect(retry.disabled).toBe(true);
		expect(boardRendered()).toBe(false);
		await act(async () => retry.click());
		expect(dispatch).toHaveBeenCalledTimes(1);

		await act(async () => rejectWrite(new Error('QuotaExceededError')));
		expect(retry.disabled).toBe(false);
		expect(host.textContent).toContain("couldn't be set up on this device");
		expect(boardRendered()).toBe(false);

		failWrites = false;
		await act(async () => retry.click());
		expect(dispatch).toHaveBeenCalledTimes(2);
		expect(runtime.state.commandCenter.homeSceneId).toBeTruthy();
		expect(host.textContent).toBe('');
	});

	it('a non-GM gets the player notice, and nothing is provisioned for them', async () => {
		runtime.state = {
			...runtime.state,
			permissions: {
				...runtime.state.permissions,
				actors: { ...runtime.state.permissions.actors, [PLAYER.id]: PLAYER },
			},
		};
		runtime.defaultActorId = PLAYER.id;
		await mount();
		expect(host.textContent).toContain('control board');
		expect(commands).toEqual([]);
		expect(boardRendered()).toBe(false);
	});

	it('a GM whose provisioning write succeeds is left to the redirect: nothing renders here', async () => {
		await mount();
		expect(commands).toEqual(['command-center.ensure-home']);
		expect(runtime.state.commandCenter.homeSceneId).toBeTruthy();
		expect(host.textContent).toBe('');
	});

	it('a failed provisioning write says so and Retry asks again, without a bespoke board', async () => {
		failWrites = true;
		await mount();
		expect(commands).toEqual(['command-center.ensure-home']);
		expect(host.textContent).toContain("couldn't be set up on this device");
		expect(boardRendered()).toBe(false);

		failWrites = false;
		const retry = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Retry');
		expect(retry).toBeDefined();
		await act(async () => {
			retry!.click();
		});
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(commands).toEqual(['command-center.ensure-home', 'command-center.ensure-home']);
		expect(runtime.state.commandCenter.homeSceneId).toBeTruthy();
		expect(host.textContent).not.toContain("couldn't be set up");
	});
});
