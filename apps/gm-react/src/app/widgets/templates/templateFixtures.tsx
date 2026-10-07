// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach } from 'vitest';
import {
	CUSTOM_WIDGET_HOST_API_VERSION,
	dispatchCommand,
	findWidgetDefinition,
	type CoreCommand,
	type CoreStateSlice,
	type WidgetDefinition,
	type WidgetPackageDefinition,
	type WidgetTemplateKind,
} from '@dndtools/core';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '@dndtools/core/testing';
import { resolveWidgetTemplateData } from '../dataEnvironment';
import type { BoardWidget } from '../../board-helpers';
import type { WidgetTemplateProps } from './shared';
import { I18nProvider } from '../../../i18n';

/**
 * RC-WID-1.2 — every template kind renders from a real INSTALLED package.
 *
 * Each fixture goes through `widget.package.install`, so it is validated by the same schema a
 * downloaded package would be and read back with `findWidgetDefinition` — a template that only
 * rendered from a hand-built object in a test would prove nothing about a package the DM installs.
 * The templates are pure, so the assertion is simply: given the resolved data, what does the DM (or
 * the player) see in the frame?
 */

let root: Root;
export let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

export function accept(result: ReturnType<typeof dispatchCommand>): CoreStateSlice {
	if (result.status !== 'accepted') {
		throw new Error(`command rejected: ${JSON.stringify(result.rejection)}`);
	}
	return result.nextState;
}

/** A campaign with combat, a party, a note and a map — enough for every source to have something. */
export function campaign(): CoreStateSlice {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const run = (command: CoreCommand) => {
		state = accept(dispatchCommand(state, env, command));
	};
	run({ type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} });
	run({
		type: 'session.set-workflow',
		actorId: DM_ACTOR.id,
		payload: {
			workflow: 'active',
			activeSceneId: state.commandCenter.homeSceneId as string,
		},
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
	return state;
}

/** The fixture package for one template kind: one widget, one data source, one declared action. */
export function fixturePackage(
	kind: WidgetTemplateKind,
	widget: Partial<WidgetDefinition> = {},
): WidgetPackageDefinition {
	const type = `fixture-${kind}`;
	return {
		id: `workspace.fixture-${kind}`,
		version: '1.0.0',
		displayName: `Fixture ${kind}`,
		migrations: [],
		assets: [],
		portabilityWarnings: [],
		widgets: [
			{
				type,
				version: '1.0.0',
				displayName: `Fixture ${kind}`,
				author: 'workspace',
				renderEntrypoint: {
					runtime: 'template',
					template: kind,
					hostApiVersion: CUSTOM_WIDGET_HOST_API_VERSION,
				},
				supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
				defaultSize: { width: 320, height: 200 },
				minSize: { width: 160, height: 100 },
				resizePolicy: 'free',
				requiredBindings: [],
				optionalBindings: [],
				dataQueries: [
					{
						id: 'party',
						label: 'Party',
						source: 'visible-characters',
						requiredCapability: 'viewer',
						audience: 'shared',
					},
				],
				computedFields: [
					{ id: 'headcount', label: 'Headcount', inputQueryIds: ['party'], valueType: 'number' },
				],
				configurationSchema: { type: 'object', additionalProperties: true },
				capabilitySets: ['viewer', 'operator'],
				commands: [],
				events: [],
				hostPermissions: [],
				...widget,
			},
		],
	};
}

/** Install a fixture package and read the definition back out of core state. */
export function installed(pkg: WidgetPackageDefinition): {
	state: CoreStateSlice;
	definition: WidgetDefinition;
} {
	const env = makeEnvironment();
	const state = accept(
		dispatchCommand(campaign(), env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: pkg },
		}),
	);
	const definition = findWidgetDefinition(state.widgets, pkg.widgets[0].type);
	if (!definition) throw new Error(`fixture ${pkg.id} did not install`);
	return { state, definition };
}

export function boardWidget(
	definition: WidgetDefinition,
	overrides: Partial<BoardWidget> = {},
): BoardWidget {
	return {
		id: 'widget-1',
		type: definition.type,
		title: definition.displayName,
		typeLabel: definition.displayName,
		icon: 'widget',
		tier: 'template',
		description: '',
		visibility: 'dm-only',
		x: 0,
		y: 0,
		w: 4,
		h: 3,
		status: 'available',
		statusNote: null,
		configuration: {},
		configFields: definition.configFields ?? [],
		requiresBinding: false,
		commands: (definition.commands ?? []).map((command) => command.type),
		bindingRef: null,
		...overrides,
	};
}

/** Render one template from an installed fixture and return the text the frame shows. */
export function renderTemplate(
	Template: (props: WidgetTemplateProps) => React.ReactNode,
	pkg: WidgetPackageDefinition,
	options: {
		actorId?: string;
		widget?: Partial<BoardWidget>;
		onCommand?: WidgetTemplateProps['onCommand'];
	} = {},
): string {
	const { state, definition } = installed(pkg);
	const actorId = options.actorId ?? DM_ACTOR.id;
	const widget = boardWidget(definition, options.widget);
	const data = resolveWidgetTemplateData(state, actorId, definition, widget);
	// The templates draw their empty states through `t()`, so they mount inside the app's real
	// provider here rather than being special-cased for tests.
	act(() =>
		root.render(
			<I18nProvider>
				<Template
					widget={widget}
					definition={definition}
					data={data}
					onCommand={options.onCommand}
				/>
			</I18nProvider>,
		),
	);
	return container.textContent ?? '';
}
