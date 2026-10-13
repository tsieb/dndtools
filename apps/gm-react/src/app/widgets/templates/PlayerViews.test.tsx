// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	dispatchCommand,
	findPackageRecordForWidgetType,
	findSessionScreen,
	findWidgetDefinition,
	widgetPackageForkIdentity,
	type CoreCommand,
	type CoreStateSlice,
	type PreviewSelection,
	type WidgetDefinition,
} from '@dndtools/core';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '@dndtools/core/testing';
import type { BoardWidget } from '../../board-helpers';
import { I18nProvider } from '../../../i18n';
import { buildPackage, readPackage } from '../../widgetBuilder/draft';
import { resolveWidgetTemplateData } from '../dataEnvironment';
import { exportedBytes } from '../parity';

/**
 * RC-SES-7.3 — "What players see" is the installed `player-views` definition drawn by the shared
 * link-list template: one row per participant from `player-projections`, each row the declared
 * `preview-participant` intent, resolved by the host gate and followed by the shared executor. The
 * row a GM's builder copy draws is this one; nothing here is a hand-written body.
 */

const enterPreview = vi.fn();
const runtimeRef: {
	state: CoreStateSlice;
	activeActorId: string;
	defaultActorId: string;
	preview: unknown;
	enterPreview: (selection: PreviewSelection) => void;
} = {
	state: buildInitialState(DM_ACTOR),
	activeActorId: DM_ACTOR.id,
	defaultActorId: DM_ACTOR.id,
	preview: null,
	enterPreview: (selection) => {
		enterPreview(selection);
		runtimeRef.preview = selection;
	},
};

vi.mock('../../../runtime/RuntimeContext', () => ({
	useRuntime: () => runtimeRef,
	DEFAULT_DM_ACTOR_ID: 'dm-1',
}));

const { LinkListTemplate } = await import('./Hub');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
	enterPreview.mockClear();
	runtimeRef.preview = null;
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

/**
 * The GM's builder copy: fork the shipped definition, export it, read and save it in the builder,
 * install the save. What comes back is a workspace widget of a new type.
 */
function rebuilt(state: CoreStateSlice): WidgetDefinition {
	const env = makeEnvironment();
	const run = (command: CoreCommand) => {
		const result = dispatchCommand(state, env, command);
		if (result.status !== 'accepted') throw new Error(result.rejection.message);
		return result.nextState;
	};
	const record = findPackageRecordForWidgetType(state.widgets, 'player-views')!;
	const identity = widgetPackageForkIdentity(state.widgets, 'player-views');
	const forked = run({
		type: 'widget.package.fork',
		actorId: DM_ACTOR.id,
		payload: { packageId: record.package.id, widgetType: 'player-views' },
	} as CoreCommand);
	const saved = buildPackage(
		readPackage(JSON.parse(exportedBytes(forked, env, identity.packageId)!), 'proposed'),
	);
	const installed = run({
		type: 'widget.package.install',
		actorId: DM_ACTOR.id,
		payload: { package: saved },
	} as CoreCommand);
	return findWidgetDefinition(installed.widgets, saved.widgets[0]!.type)!;
}

/** A seated vault with a freshly provisioned Session screen. */
function vault(): { state: CoreStateSlice; definition: WidgetDefinition; widget: BoardWidget } {
	const env = makeEnvironment();
	const result = dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR), env, {
		type: 'command-center.ensure-home',
		actorId: DM_ACTOR.id,
		payload: { screen: 'session' },
	} as CoreCommand);
	if (result.status !== 'accepted') throw new Error(result.rejection.message);
	const state = result.nextState;
	const placed = findSessionScreen(state.scenes)!.widgets.find(
		(instance) => instance.type === 'player-views',
	)!;
	const definition = findWidgetDefinition(state.widgets, 'player-views')!;
	return {
		state,
		definition,
		widget: {
			id: placed.id,
			type: placed.type,
			title: 'What players see',
			typeLabel: definition.displayName,
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
			configuration: placed.configuration,
			configFields: definition.configFields ?? [],
			requiresBinding: false,
			commands: [],
			bindingRef: null,
		},
	};
}

function Where() {
	const location = useLocation();
	return <output data-testid="where">{JSON.stringify(location.state)}</output>;
}

/** Draw the live widget for `viewer` on `/session`; returns the rows' buttons. */
function draw(viewer: string, copy = false) {
	const { state, definition: shipped, widget } = vault();
	const definition = copy ? rebuilt(state) : shipped;
	runtimeRef.state = state;
	runtimeRef.activeActorId = viewer;
	runtimeRef.defaultActorId = DM_ACTOR.id;
	const data = resolveWidgetTemplateData(state, viewer, definition, widget);
	act(() =>
		root.render(
			<MemoryRouter initialEntries={['/session']}>
				<I18nProvider>
					<Routes>
						<Route
							path="/session"
							element={
								<LinkListTemplate
									widget={widget}
									definition={definition}
									data={data}
									onCommand={() => {}}
								/>
							}
						/>
						<Route path="/play" element={<Where />} />
					</Routes>
				</I18nProvider>
			</MemoryRouter>,
		),
	);
	return [...container.querySelectorAll('button')];
}

describe('RC-SES-7.3 the "What players see" template widget', () => {
	it('draws one Preview row per participant for the DM, and previews the one pressed', () => {
		const rows = draw(DM_ACTOR.id);
		expect(container.textContent).toContain('What players see');
		expect(rows.map((row) => row.textContent)).toEqual([
			expect.stringMatching(/^Test Player.*Player · Offline · Stage: .*Preview$/),
			expect.stringMatching(/^Test Observer.*Observer · Offline · Stage: .*Preview$/),
		]);
		act(() => rows[0]!.click());
		expect(enterPreview).toHaveBeenCalledWith({ role: 'player', playerActorId: PLAYER_ACTOR.id });
		// The companion opens with the Session screen as the exit banner's return.
		expect(container.querySelector('[data-testid="where"]')?.textContent).toBe(
			JSON.stringify({ previewFrom: '/session' }),
		);
	});

	it('a copy rebuilt in the builder draws the same rows and previews the same way', () => {
		const shipped = draw(DM_ACTOR.id).map((row) => row.textContent);
		const rows = draw(DM_ACTOR.id, true);
		expect(rows.map((row) => row.textContent)).toEqual(shipped);
		act(() => rows[0]!.click());
		expect(enterPreview).toHaveBeenCalledWith({ role: 'player', playerActorId: PLAYER_ACTOR.id });
	});

	it('previews an observer row as that observer seat', () => {
		const rows = draw(DM_ACTOR.id);
		act(() => rows[1]!.click());
		expect(enterPreview).toHaveBeenCalledWith({
			role: 'observer',
			playerActorId: OBSERVER_ACTOR.id,
		});
	});

	it('gives a player their own row and no Preview', () => {
		draw(PLAYER_ACTOR.id);
		expect(container.querySelectorAll('button')).toHaveLength(0);
		expect(container.textContent).toContain(PLAYER_ACTOR.displayName);
		expect(container.textContent).not.toContain(OBSERVER_ACTOR.displayName);
		expect(container.textContent).not.toContain('Preview');
	});

	it('offers no Preview while the DM is already previewing', () => {
		// While previewing, the viewing actor is the preview actor; the host gate refuses it.
		draw('preview-generic-player');
		expect(container.querySelectorAll('button')).toHaveLength(0);
		expect(enterPreview).not.toHaveBeenCalled();
	});
});
