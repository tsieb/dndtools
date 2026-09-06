// @vitest-environment jsdom

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
import type { BoardWidget } from '../../board-helpers';
import { I18nProvider } from '../../../i18n';

/**
 * RC-WID-4.1 — EVERY system widget type draws a real body.
 *
 * The list of types is read out of `createSystemWidgetPackages()` rather than typed here, so adding
 * a system widget to the core without giving it a body fails this file instead of shipping a
 * "Nothing here knows how to draw this widget" tile on the GM Screen. The snapshots are the text a
 * DM actually reads in the frame, so a body that silently degrades to an empty box is visible in
 * the diff.
 *
 * The runtime context is stubbed with a REAL `CoreStateSlice` built by real commands: the bodies are
 * exercised against core-derived data, only the React plumbing that owns persistence is replaced.
 */

const runtimeRef: { state: CoreStateSlice; defaultActorId: string } = {
	state: buildInitialState(DM_ACTOR, PLAYER_ACTOR),
	defaultActorId: DM_ACTOR.id,
};

vi.mock('../../../runtime/RuntimeContext', () => ({
	useRuntime: () => runtimeRef,
	DEFAULT_DM_ACTOR_ID: 'dm-1',
}));

// The map body resolves its raster through the asset store; there are no bytes in a test vault and
// the body's own missing-raster branch is what should be snapshotted.
vi.mock('../../../platform/assetUrl', () => ({
	useAssetObjectUrl: () => null,
	createAssetObjectUrl: async () => null,
}));

// Imported after the mocks so the bodies pick them up.
const { WidgetBody, BUILTIN_WIDGET_TYPES, hasBuiltinBody } = await import('./index');

// React 18 wants this flag to treat `act()` as a real act scope outside a test renderer.
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

function accept(result: ReturnType<typeof dispatchCommand>): CoreStateSlice {
	if (result.status !== 'accepted') {
		throw new Error(`command rejected: ${JSON.stringify(result.rejection)}`);
	}
	return result.nextState;
}

/** A campaign with a home scene, a live session, a party, combat, a note, a map and a saved search. */
function campaign(): CoreStateSlice {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const run = (command: CoreCommand) => {
		state = accept(dispatchCommand(state, env, command));
	};
	run({ type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} });
	run({
		type: 'session.set-workflow',
		actorId: DM_ACTOR.id,
		payload: { workflow: 'active', activeSceneId: state.commandCenter.homeSceneId as string },
	});
	run({
		type: 'character.quick-create',
		actorId: DM_ACTOR.id,
		payload: {
			kind: 'sidekick',
			name: 'Brannor',
			visibility: 'player-visible',
			combat: { hp: 18, maxHp: 24, ac: 16 },
		},
	});
	// A real PC, so the party counts on the Characters and Data Hub bodies are not always zero. Only
	// the draft flow produces `kind: 'pc'` (commands/character.ts:590).
	run({
		type: 'character.create-draft',
		actorId: DM_ACTOR.id,
		payload: { ownerActorId: PLAYER_ACTOR.id, name: 'Ysolde', visibility: 'shared' },
	});
	const draftId = Object.keys(state.characters.drafts)[0];
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
	run({
		type: 'combat.start',
		actorId: DM_ACTOR.id,
		payload: {
			combatants: [
				{ kind: 'character', name: 'Brannor', ac: 16, initiative: 18, maxHp: 24, hidden: false },
			],
		},
	});
	run({
		type: 'content.create-item',
		actorId: DM_ACTOR.id,
		payload: {
			kind: 'note',
			title: 'Tavern rumours',
			body: 'The miller pays for moonstone.',
			visibility: 'player-visible',
		},
	});
	run({
		type: 'map.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Old mill', visibility: 'player-visible' },
	});
	run({
		type: 'content.create-saved-search',
		actorId: DM_ACTOR.id,
		payload: { name: 'Open threads', pinned: true },
	});
	run({
		type: 'encounter.build',
		actorId: DM_ACTOR.id,
		payload: {
			title: 'Mill ambush',
			combatants: [{ kind: 'monster', name: 'Bandit', challengeRating: 0.125, quantity: 4 }],
		},
	});
	return state;
}

const SYSTEM_DEFINITIONS: WidgetDefinition[] = Object.values(
	createSystemWidgetPackages().packages,
).flatMap((record) => record.package.widgets);

/** A placed instance of one system widget definition, with the definition's declared defaults. */
function boardWidget(definition: WidgetDefinition): BoardWidget {
	return {
		id: `widget-${definition.type}`,
		type: definition.type,
		title: definition.displayName,
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
		configuration: {},
		configFields: definition.configFields ?? [],
		requiresBinding: (definition.requiredBindings ?? []).length > 0,
		commands: (definition.commands ?? []).map((command) => command.type),
		bindingRef: null,
	};
}

/** Render one body against the campaign fixture and return the text the frame shows. */
function renderBody(definition: WidgetDefinition, actorId: string = DM_ACTOR.id): string {
	runtimeRef.state = campaign();
	runtimeRef.defaultActorId = actorId;
	act(() =>
		root.render(
			<I18nProvider>
				<WidgetBody widget={boardWidget(definition)} />
			</I18nProvider>,
		),
	);
	return container.textContent ?? '';
}

describe('every system widget type has a body', () => {
	it('declares a builtin body for each shipped system widget type', () => {
		const missing = SYSTEM_DEFINITIONS.map((d) => d.type).filter((type) => !hasBuiltinBody(type));
		expect(missing).toEqual([]);
	});

	it('claims no builtin type the system packages do not ship', () => {
		const shipped = new Set(SYSTEM_DEFINITIONS.map((d) => d.type));
		expect(BUILTIN_WIDGET_TYPES.filter((type) => !shipped.has(type))).toEqual([]);
	});

	it.each(SYSTEM_DEFINITIONS.map((d) => [d.type, d] as const))(
		'%s renders a body the DM can read',
		(type, definition) => {
			const text = renderBody(definition);
			// A body that renders nothing at all is the failure this story exists to remove.
			expect(text.trim()).not.toBe('');
			expect(text).toMatchSnapshot();
		},
	);
});

describe('Command Center bodies stay actor-scoped', () => {
	const byType = (type: string): WidgetDefinition => {
		const found = SYSTEM_DEFINITIONS.find((d) => d.type === type);
		if (!found) throw new Error(`no system widget definition for ${type}`);
		return found;
	};

	it('withholds the DM-only roster cell from a player on the session body', () => {
		// The DM's strip carries the roster cell ("1 player"); the player's `players` cell is null in
		// the core, so the count is absent from their tile rather than blanked out in the GUI.
		expect(renderBody(byType('session'), DM_ACTOR.id)).toContain('1 player');
		expect(renderBody(byType('session'), PLAYER_ACTOR.id)).not.toContain('1 player');
	});

	it('tells a player the player-view controls are DM only rather than showing an empty roster', () => {
		expect(renderBody(byType('player-views'), PLAYER_ACTOR.id)).toContain('DM only');
	});

	it('shows a player no prepared encounter on the combat body', () => {
		expect(renderBody(byType('combat'), DM_ACTOR.id)).toContain('Mill ambush');
		expect(renderBody(byType('combat'), PLAYER_ACTOR.id)).not.toContain('Mill ambush');
	});
});
