// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
import { TEMPLATE_RENDERER_ENTRIES } from './index';
import { ActionPanelTemplate } from './ActionPanel';
import { ChartTemplate } from './Chart';
import { DataTableTemplate } from './DataTable';
import { FormPanelTemplate } from './FormPanel';
import { SceneMessageTemplate } from './SceneMessage';
import { StatBlockTemplate } from './StatBlock';
import { StatusListTemplate } from './StatusList';
import { TrackerTemplate } from './Tracker';
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

/** A campaign with combat, a party, a note and a map — enough for every source to have something. */
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
function fixturePackage(
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
function installed(pkg: WidgetPackageDefinition): {
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

function boardWidget(
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
function renderTemplate(
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

describe('the template registry', () => {
	it('registers a renderer for every template kind the schema declares', () => {
		expect(TEMPLATE_RENDERER_ENTRIES.map(([kind]) => kind).sort()).toEqual(
			[
				'action-panel',
				'chart',
				'data-table',
				'form-panel',
				'scene-message',
				'stat-block',
				'status-list',
				'tracker',
			].sort(),
		);
	});
});

describe('each template renders its fixture package', () => {
	it('data-table lists the query rows in a table', () => {
		const text = renderTemplate(DataTableTemplate, fixturePackage('data-table'));
		expect(container.querySelector('[data-testid="widget-template-data-table"]')).not.toBeNull();
		expect(container.querySelector('table')).not.toBeNull();
		expect(text).toContain('Brannor');
		expect(text).toContain('Headcount');
	});

	it('status-list shows each row with a state, not colour alone', () => {
		const text = renderTemplate(StatusListTemplate, fixturePackage('status-list'));
		expect(container.querySelector('[data-testid="widget-template-status-list"]')).not.toBeNull();
		expect(container.querySelectorAll('li')).toHaveLength(1);
		expect(text).toContain('Brannor');
	});

	it('tracker meters a row that carries a value and a ceiling', () => {
		const text = renderTemplate(TrackerTemplate, fixturePackage('tracker'));
		expect(container.querySelector('[data-testid="widget-template-tracker"]')).not.toBeNull();
		expect(text).toContain('Brannor');
		expect(text).toContain('18 of 24');
	});

	it('action-panel offers one button per declared command and dispatches it', () => {
		const dispatched: [string, Record<string, unknown>][] = [];
		renderTemplate(
			ActionPanelTemplate,
			fixturePackage('action-panel', {
				commands: [
					{
						type: 'fixture.roll',
						displayName: 'Roll the table',
						requiredCapability: 'operator',
						payloadSchema: { type: 'object' },
						writesTo: 'session',
					},
				],
			}),
			{ onCommand: (type, payload) => dispatched.push([type, payload]) },
		);
		const button = container.querySelector('button');
		expect(button?.textContent).toContain('Roll the table');
		act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		expect(dispatched).toEqual([['fixture.roll', {}]]);
	});

	it('action-panel hides a manager-only action from a player', () => {
		const text = renderTemplate(
			ActionPanelTemplate,
			fixturePackage('action-panel', {
				commands: [
					{
						type: 'fixture.reset',
						displayName: 'Reset the campaign clock',
						requiredCapability: 'manager',
						payloadSchema: { type: 'object' },
						writesTo: 'session',
					},
				],
			}),
			{ actorId: PLAYER_ACTOR.id },
		);
		expect(container.querySelector('button')).toBeNull();
		expect(text).toContain('This widget declares no actions yet.');
	});

	it('scene-message prints its configured message', () => {
		const text = renderTemplate(
			SceneMessageTemplate,
			fixturePackage('scene-message', {
				configFields: [{ key: 'message', label: 'Message', control: 'textarea' }],
			}),
			{ widget: { configuration: { message: 'The bell tolls thrice.' } } },
		);
		expect(container.querySelector('[data-testid="widget-template-scene-message"]')).not.toBeNull();
		expect(text).toContain('The bell tolls thrice.');
	});

	it('chart draws a bar per row and prints every value as text', () => {
		const text = renderTemplate(ChartTemplate, fixturePackage('chart'));
		expect(container.querySelector('[data-testid="widget-template-chart"]')).not.toBeNull();
		expect(text).toContain('Brannor');
		// The measure is readable without seeing the bar (the bars themselves are aria-hidden).
		expect(text).toContain('18 / 24');
		expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
	});

	it('stat-block gives the subject the space and counts the rest', () => {
		const text = renderTemplate(StatBlockTemplate, fixturePackage('stat-block'));
		expect(container.querySelector('[data-testid="widget-template-stat-block"]')).not.toBeNull();
		expect(text).toContain('Brannor');
		expect(text).toContain('18 of 24');
	});

	it('form-panel renders its content fields and submits the declared command', () => {
		const dispatched: [string, Record<string, unknown>][] = [];
		renderTemplate(
			FormPanelTemplate,
			fixturePackage('form-panel', {
				configFields: [
					{ key: 'entry', label: 'Loot entry', control: 'text', group: 'content' },
					{ key: 'accent', label: 'Accent', control: 'color', group: 'style' },
				],
				commands: [
					{
						type: 'fixture.record',
						displayName: 'Record it',
						requiredCapability: 'operator',
						payloadSchema: { type: 'object', properties: { entry: { type: 'string' } } },
						writesTo: 'session',
					},
				],
			}),
			{
				widget: { configuration: { entry: 'A cracked signet ring' } },
				onCommand: (type, payload) => dispatched.push([type, payload]),
			},
		);
		expect(container.querySelector('[data-testid="widget-template-form-panel"]')).not.toBeNull();
		// Only the `content` group is offered; the style field belongs to the inspector.
		expect(container.textContent).toContain('Loot entry');
		expect(container.textContent).not.toContain('Accent');
		const button = container.querySelector('button');
		act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		expect(dispatched).toEqual([['fixture.record', { entry: 'A cracked signet ring' }]]);
	});

	it('form-panel with no declared command shows settings instead of a dead form', () => {
		const text = renderTemplate(
			FormPanelTemplate,
			fixturePackage('form-panel', {
				configFields: [{ key: 'entry', label: 'Loot entry', control: 'text' }],
			}),
			{ widget: { configuration: { entry: 'A cracked signet ring' } } },
		);
		expect(container.querySelector('input')).toBeNull();
		expect(text).toContain('This form has no action yet');
		expect(text).toContain('A cracked signet ring');
	});
});

describe('audience', () => {
	it('a player sees the withheld notice, never the dm-audience rows', () => {
		const pkg = fixturePackage('data-table', {
			dataQueries: [
				{
					id: 'party',
					label: 'Party',
					source: 'visible-characters',
					requiredCapability: 'viewer',
					audience: 'dm',
				},
			],
		});
		const dmText = renderTemplate(DataTableTemplate, pkg);
		expect(dmText).toContain('Brannor');

		const playerText = renderTemplate(DataTableTemplate, pkg, { actorId: PLAYER_ACTOR.id });
		expect(playerText).not.toContain('Brannor');
		expect(playerText).toContain('DM only');
		expect(container.querySelector('table')).toBeNull();
	});
});
