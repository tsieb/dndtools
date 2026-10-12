// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	dispatchCommand,
	findSessionScreen,
	type CoreCommand,
	type CoreStateSlice,
	type WidgetInstance,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import type { BoardWidget } from '../../../board-helpers';
import { I18nProvider } from '../../../../i18n';

/**
 * RC-WID-5.7 × RC-CAN-7.8 — the Session screen's dice tray is the `dice-roller` template's `tray`
 * view. It reads the roll history from the definition's `dice-history` query for the viewing actor,
 * and rolls only through the declared `dice.roll`, sent as `widget.dispatch-command` for its own
 * instance on the Session screen.
 */

const runtimeRef: {
	state: CoreStateSlice;
	defaultActorId: string;
	activeActorId: string;
	preview: null;
	dispatch: ReturnType<typeof vi.fn>;
	newId: () => string;
} = {
	state: buildInitialState(DM_ACTOR, PLAYER_ACTOR),
	defaultActorId: DM_ACTOR.id,
	activeActorId: DM_ACTOR.id,
	preview: null,
	dispatch: vi.fn(async () => ({ status: 'accepted' as const })),
	newId: () => 'press-id',
};

vi.mock('../../../../runtime/RuntimeContext', () => ({
	useRuntime: () => runtimeRef,
	DEFAULT_DM_ACTOR_ID: 'dm-1',
}));

const { TEMPLATE_RENDERER_ENTRIES } = await import('../index');
const DiceTile = TEMPLATE_RENDERER_ENTRIES.find(([kind]) => kind === 'dice-roller')![1];

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
	runtimeRef.dispatch.mockClear();
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

/** A vault with its Session screen, a labelled DM roll the player may not see, and a public roll. */
function fixture(): { state: CoreStateSlice; screenId: string; tray: WidgetInstance } {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const run = (command: CoreCommand) => {
		const result = dispatchCommand(state, env, command);
		if (result.status !== 'accepted') throw new Error(result.rejection.message);
		state = result.nextState;
	};
	run({ type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: { screen: 'session' } });
	run({
		type: 'dice.roll',
		actorId: DM_ACTOR.id,
		payload: { expression: '1d20+4', label: 'Secret perception', visibility: 'dm-only' },
	});
	run({ type: 'dice.roll', actorId: PLAYER_ACTOR.id, payload: { expression: '2d6' } });
	const screen = findSessionScreen(state.scenes)!;
	const tray = screen.widgets.find((widget) => widget.type === 'dice')!;
	return { state, screenId: screen.id, tray };
}

function trayWidget(instance: WidgetInstance, commands = ['dice.roll']): BoardWidget {
	return {
		id: instance.id,
		type: 'dice',
		title: 'Dice',
		typeLabel: 'Dice',
		icon: 'dice',
		tier: 'system',
		description: '',
		visibility: 'dm-only',
		x: 0,
		y: 0,
		w: 4,
		h: 3,
		status: 'available',
		statusNote: null,
		configuration: { ...instance.configuration },
		configFields: [],
		requiresBinding: false,
		commands,
		bindingRef: null,
	};
}

function renderAs(
	state: CoreStateSlice,
	actorId: string,
	widget: BoardWidget,
	onCommand?: () => void,
): HTMLDivElement {
	runtimeRef.state = state;
	runtimeRef.defaultActorId = actorId;
	runtimeRef.activeActorId = actorId;
	act(() =>
		root.render(
			<I18nProvider>
				<DiceTile widget={widget} onCommand={onCommand} />
			</I18nProvider>,
		),
	);
	return container;
}

const button = (host: HTMLElement, text: string) =>
	Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

describe('the Session dice tray is a template view', () => {
	it('is the tray the Session screen provisions, over the viewer’s own history', () => {
		const { state, tray } = fixture();
		expect(tray.configuration.view).toBe('tray');
		const dm = renderAs(state, DM_ACTOR.id, trayWidget(tray), () => {}).textContent ?? '';
		expect(dm).toContain('Secret perception');
		expect(dm).toContain('2d6');
	});

	it('never shows a player a roll the DM kept to themselves', () => {
		const { state, tray } = fixture();
		const player = renderAs(state, PLAYER_ACTOR.id, trayWidget(tray), () => {}).textContent ?? '';
		expect(player).not.toContain('Secret perception');
		expect(player).toContain('2d6');
	});

	it('rolls through widget.dispatch-command for its own instance, with the label', async () => {
		const { state, screenId, tray } = fixture();
		const host = renderAs(state, DM_ACTOR.id, trayWidget(tray), () => {});
		const label = host.querySelectorAll('input')[1] as HTMLInputElement;
		act(() => {
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
			setter.call(label, 'Initiative');
			label.dispatchEvent(new Event('input', { bubbles: true }));
		});
		await act(async () => button(host, '1d20')?.click());
		expect(runtimeRef.dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'widget.dispatch-command',
				actorId: DM_ACTOR.id,
				payload: expect.objectContaining({
					sceneId: screenId,
					widgetInstanceId: tray.id,
					commandType: 'dice.roll',
					payload: { expression: '1d20', label: 'Initiative' },
				}),
			}),
		);
		// The core accepts that envelope and records the labelled roll.
		const sent = runtimeRef.dispatch.mock.calls[0]![0] as CoreCommand;
		const result = dispatchCommand(state, makeEnvironment(), sent);
		expect(result.status).toBe('accepted');
		if (result.status === 'accepted')
			expect(result.nextState.session.diceHistory.at(-1)).toMatchObject({
				expression: '1d20',
				label: 'Initiative',
			});
	});

	it('cannot roll in edit mode or without a declared dice.roll', async () => {
		const { state, tray } = fixture();
		for (const [widget, onCommand] of [
			[trayWidget(tray), undefined],
			[trayWidget(tray, []), () => {}],
		] as const) {
			const host = renderAs(state, DM_ACTOR.id, widget, onCommand);
			expect(button(host, '1d20')?.disabled).toBe(true);
			await act(async () => button(host, '1d20')?.click());
		}
		expect(runtimeRef.dispatch).not.toHaveBeenCalled();
	});
});
