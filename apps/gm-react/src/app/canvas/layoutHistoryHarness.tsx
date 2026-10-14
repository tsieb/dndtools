import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach } from 'vitest';
import {
	dispatchCommand,
	type CoreCommand,
	type CoreStateSlice,
	type SyncOperation,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { I18nProvider } from '../../i18n';
import { useLayoutHistory, type LayoutHistory } from './useLayoutHistory';

// RC-POL-1.2 — the shared harness for the two `useLayoutHistory` test files.

/**
 * RC-CAN-1.3 — the canvas undo stack, driven against a REAL Core.
 *
 * `dispatch` here is the same shape the two canvas screens pass (a guarded dispatch that returns
 * whether the command was accepted), and the state it mutates is the state the hook reads to build
 * each inverse. So these assertions are about the stack, not about a mock: an undo is a real
 * `dispatchCommand` of the core-built inverse, and the widget's layout is read back out of core.
 *
 * Resize lives here rather than in `canvas.spec.ts` because every widget that ships today is
 * `system` tier, and the canvas deliberately offers no resize control for those — there is no
 * pointer or keyboard path an end-to-end test could take to a `scene.resize-widget`.
 */

let root: Root;
let host: HTMLDivElement;

/** Mount a fresh React root around every test in the calling file. */
export function mountHarnessRoot() {
	beforeEach(() => {
		host = document.createElement('div');
		document.body.appendChild(host);
		root = createRoot(host);
	});
	afterEach(() => {
		act(() => root.unmount());
		host.remove();
	});
}

function accept(result: ReturnType<typeof dispatchCommand>): CoreStateSlice {
	if (result.status !== 'accepted') {
		throw new Error(`command rejected: ${JSON.stringify(result.rejection)}`);
	}
	return result.nextState;
}

/** A campaign whose home scene holds at least one widget. */
function campaign(): {
	env: ReturnType<typeof makeEnvironment>;
	state: CoreStateSlice;
	sceneId: string;
	widgetId: string;
} {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	state = accept(
		dispatchCommand(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		}),
	);
	const sceneId = state.commandCenter.homeSceneId as string;
	const widgetId = state.scenes.scenes[sceneId].widgets[0].id;
	return { env, state, sceneId, widgetId };
}

/**
 * A stand-in for the screen: a mutable Core state, a guarded dispatch, and the hook on top. The
 * real guarded dispatch resolves only after the vault persist, while the core state changes at
 * once — `persist` lets a test hold that gap open.
 */
export function harness(options: { persist?: () => Promise<void> } = {}) {
	// The campaign's own environment: a second one would mint ids that collide with the seed's.
	const start = campaign();
	const env = start.env;
	// Shaped like `SceneRuntime`: accepted dispatches are signalled with the operations they logged.
	const listeners = new Set<(ops: SyncOperation[], next: CoreStateSlice) => void>();
	const holder = {
		state: start.state,
		defaultActorId: DM_ACTOR.id,
		onDispatched(listener: (ops: SyncOperation[], next: CoreStateSlice) => void) {
			listeners.add(listener);
			return () => void listeners.delete(listener);
		},
	};
	// One queue, like `SceneRuntime.dispatch`: the state changes at once, the signal fires after the
	// persist, and the next dispatch waits for both.
	let tail: Promise<unknown> = Promise.resolve();
	const apply = (command: CoreCommand) => {
		const work = tail.then(async () => {
			const result = dispatchCommand(holder.state, env, command);
			if (result.status !== 'accepted') return result;
			const ops = result.nextState.sync.operations.slice(holder.state.sync.operations.length);
			holder.state = result.nextState;
			await options.persist?.();
			for (const listener of listeners) listener(ops, result.nextState);
			return result;
		});
		tail = work.catch(() => undefined);
		return work;
	};
	let api: LayoutHistory | null = null;

	function Probe({ scene }: { scene: string | null }) {
		const history = useLayoutHistory({
			sceneId: scene,
			runtime: holder,
			dispatch: async (command: CoreCommand) => (await apply(command)).status === 'accepted',
		});
		api = history;
		return null;
	}
	function Host() {
		const [scene, setScene] = useState<string | null>(start.sceneId);
		useEffect(() => {
			swap = setScene;
		}, []);
		return <Probe scene={scene} />;
	}
	let swap: ((next: string | null) => void) | null = null;

	act(() =>
		root.render(
			<I18nProvider>
				<Host />
			</I18nProvider>,
		),
	);
	return {
		holder,
		/** Dispatch past the stack, as the palette and the template picker do, and let it settle. */
		async dispatchOutside(command: CoreCommand) {
			await act(async () => void accept(await apply(command)));
		},
		/** Queue a dispatch past the stack without waiting for it. */
		queueOutside: apply,
		sceneId: start.sceneId,
		widgetId: start.widgetId,
		get history(): LayoutHistory {
			if (!api) throw new Error('probe did not mount');
			return api;
		},
		layout: () =>
			holder.state.scenes.scenes[start.sceneId].widgets.find((w) => w.id === start.widgetId)!
				.layout,
		switchScene(next: string | null) {
			act(() => swap!(next));
		},
	};
}
