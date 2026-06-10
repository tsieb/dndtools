import { describe, expect, it } from 'vitest';
import { dispatchCommand } from '../src/commands/dispatch';
import type { CommandResult, CoreCommand, CoreEnvironment, CoreStateSlice } from '../src/commands/types';
import { listWidgetLibrary, resolveAddWidgetCommand } from '../src/queries/widget-library';
import type { WidgetPackageDefinition } from '../src/state/widget-package-state';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

const desktopOnlyPackage: WidgetPackageDefinition = {
	id: 'workspace.desktop-tools',
	version: '1.0.0',
	displayName: 'Desktop Tools',
	widgets: [
		{
			type: 'multi-pane-compare',
			version: '1.0.0',
			displayName: 'Multi-pane Compare',
			author: 'workspace',
			supportedProfiles: ['desktop', 'web'],
			defaultSize: { width: 360, height: 240 },
			minSize: { width: 240, height: 160 },
			resizePolicy: 'free',
			requiredBindings: [],
			optionalBindings: [],
			configurationSchema: { type: 'object', additionalProperties: true },
			capabilitySets: ['manager', 'operator', 'viewer'],
			commands: [],
			events: [],
			hostPermissions: [],
		},
	],
	migrations: [],
	assets: [],
	portabilityWarnings: [],
};

describe('CMD-005 widget library', () => {
	it('filters installed system widgets by name and surfaces required bindings', () => {
		const state = buildInitialState(DM_ACTOR);

		const diceMatches = listWidgetLibrary(state.widgets, state.permissions, DM_ACTOR.id, {
			profileId: 'desktop',
			filter: 'dice',
		});
		expect(diceMatches.map((e) => e.type)).toEqual(['dice']);
		expect(diceMatches[0]).toMatchObject({ displayName: 'Dice', availability: { available: true } });

		// Entity-backed widgets advertise the data binding they require so the DM can
		// preview what a widget needs before adding it (CMD-005 AC1).
		const characterMatches = listWidgetLibrary(state.widgets, state.permissions, DM_ACTOR.id, {
			profileId: 'desktop',
			filter: 'character',
		});
		expect(characterMatches[0]?.requiredBindings).toEqual([
			{
				id: 'character',
				label: 'Character',
				entityTypes: ['character'],
				mode: 'read',
				requiredCapability: 'viewer',
			},
		]);
	});

	it('matches a filter against binding labels, not only the widget name', () => {
		const state = buildInitialState(DM_ACTOR);
		const matches = listWidgetLibrary(state.widgets, state.permissions, DM_ACTOR.id, {
			profileId: 'desktop',
			filter: 'map',
		});
		expect(matches.map((e) => e.type)).toContain('map');
	});

	it('marks a widget unsupported on the active profile as unavailable and unaddable (AC2)', () => {
		const env = makeEnvironment();
		const installed = accept(
			dispatch(buildInitialState(DM_ACTOR), env, {
				type: 'widget.package.install',
				actorId: DM_ACTOR.id,
				payload: { package: desktopOnlyPackage },
			}),
		);
		const enabled = accept(
			dispatch(installed.nextState, env, {
				type: 'widget.package.enable',
				actorId: DM_ACTOR.id,
				payload: { packageId: desktopOnlyPackage.id },
			}),
		);
		const state = enabled.nextState;

		const onMobile = listWidgetLibrary(state.widgets, state.permissions, DM_ACTOR.id, {
			profileId: 'mobile',
		});
		const mobileEntry = onMobile.find((e) => e.type === 'multi-pane-compare');
		expect(mobileEntry?.availability).toEqual({
			available: false,
			reason: 'Not available on the mobile profile.',
		});
		// Fail closed: an unsupported widget cannot be turned into an add command.
		expect(resolveAddWidgetCommand(mobileEntry!, 'home-scene')).toBeNull();

		const onDesktop = listWidgetLibrary(state.widgets, state.permissions, DM_ACTOR.id, {
			profileId: 'desktop',
		});
		const desktopEntry = onDesktop.find((e) => e.type === 'multi-pane-compare');
		expect(desktopEntry?.availability).toEqual({ available: true });
		expect(resolveAddWidgetCommand(desktopEntry!, 'home-scene')).toEqual({
			type: 'scene.add-widget',
			payload: {
				sceneId: 'home-scene',
				widget: {
					type: 'multi-pane-compare',
					version: '1.0.0',
					layout: { x: 24, y: 24, w: 360, h: 240 },
					configuration: {},
					localState: {},
					binding: null,
				},
			},
		});
	});

	it('omits profile-unavailable entries when includeUnavailable is false', () => {
		const env = makeEnvironment();
		const installed = accept(
			dispatch(buildInitialState(DM_ACTOR), env, {
				type: 'widget.package.install',
				actorId: DM_ACTOR.id,
				payload: { package: desktopOnlyPackage },
			}),
		);
		const enabled = accept(
			dispatch(installed.nextState, env, {
				type: 'widget.package.enable',
				actorId: DM_ACTOR.id,
				payload: { packageId: desktopOnlyPackage.id },
			}),
		);
		const onMobile = listWidgetLibrary(enabled.nextState.widgets, enabled.nextState.permissions, DM_ACTOR.id, {
			profileId: 'mobile',
			includeUnavailable: false,
		});
		expect(onMobile.some((e) => e.type === 'multi-pane-compare')).toBe(false);
	});

	it('marks widgets from a disabled package unavailable', () => {
		// Install but do not enable: the package is disabled by default.
		const env = makeEnvironment();
		const installed = accept(
			dispatch(buildInitialState(DM_ACTOR), env, {
				type: 'widget.package.install',
				actorId: DM_ACTOR.id,
				payload: { package: desktopOnlyPackage },
			}),
		);
		const entries = listWidgetLibrary(installed.nextState.widgets, installed.nextState.permissions, DM_ACTOR.id, {
			profileId: 'desktop',
		});
		const entry = entries.find((e) => e.type === 'multi-pane-compare');
		expect(entry?.availability).toEqual({
			available: false,
			reason: 'The Desktop Tools package is disabled.',
		});
	});

	it('drops widgets from a removed package entirely', () => {
		const env = makeEnvironment();
		const installed = accept(
			dispatch(buildInitialState(DM_ACTOR), env, {
				type: 'widget.package.install',
				actorId: DM_ACTOR.id,
				payload: { package: desktopOnlyPackage },
			}),
		);
		const removed = accept(
			dispatch(installed.nextState, env, {
				type: 'widget.package.remove',
				actorId: DM_ACTOR.id,
				payload: { packageId: desktopOnlyPackage.id },
			}),
		);
		const entries = listWidgetLibrary(removed.nextState.widgets, removed.nextState.permissions, DM_ACTOR.id, {
			profileId: 'desktop',
		});
		expect(entries.some((e) => e.type === 'multi-pane-compare')).toBe(false);
	});

	it('returns an empty library for non-DM actors (DM-only)', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const entries = listWidgetLibrary(state.widgets, state.permissions, PLAYER_ACTOR.id, {
			profileId: 'desktop',
		});
		expect(entries).toEqual([]);
	});
});
