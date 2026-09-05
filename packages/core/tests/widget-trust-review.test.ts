import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	CUSTOM_WIDGET_HOST_API_VERSION,
	dispatchCommand,
	type CoreStateSlice,
	type WidgetPackageDefinition,
} from '../src';

/**
 * RC-WID-1.5 — the TRUST REVIEW command. An installed package starts unreviewed with every host
 * permission denied; `widget.package.review` is the only way a decision is ever recorded, and the
 * sandbox host answers `requestPermission` from exactly those decisions. These tests hold the
 * fail-closed edges: DM only, requested permissions only, an omission never widens, a package the
 * analysis says to deny is never trusted without an explicit acknowledgment, and a denial actually
 * stops the package rather than just labelling it.
 */

const EMPTY_SCHEMA = { type: 'object' as const, additionalProperties: true };

function packageDefinition(
	overrides: Partial<WidgetPackageDefinition> = {},
): WidgetPackageDefinition {
	return {
		id: overrides.id ?? 'workspace.weather',
		version: '1.0.0',
		displayName: overrides.displayName ?? 'Weather Tracker',
		widgets: overrides.widgets ?? [
			{
				type: 'weather',
				version: '1.0.0',
				displayName: 'Weather',
				author: 'workspace',
				supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
				defaultSize: { width: 180, height: 120 },
				minSize: { width: 120, height: 80 },
				resizePolicy: 'free',
				requiredBindings: [],
				optionalBindings: [],
				configurationSchema: EMPTY_SCHEMA,
				runtimeStateSchema: EMPTY_SCHEMA,
				capabilitySets: ['manager', 'operator', 'viewer'],
				commands: [],
				events: [],
				hostPermissions: ['network', 'clipboard'],
				networkDestinationClasses: ['widget-declared'],
			},
		],
		migrations: [],
		assets: [],
		portabilityWarnings: [],
	};
}

function installed(definition = packageDefinition()) {
	const env = makeEnvironment();
	const result = dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, {
		type: 'widget.package.install',
		actorId: DM_ACTOR.id,
		payload: { package: definition },
	});
	if (result.status !== 'accepted') throw new Error('install failed');
	return { env, state: result.nextState, packageId: definition.id };
}

function sceneWithWidget(state: CoreStateSlice, env: ReturnType<typeof makeEnvironment>) {
	const created = dispatchCommand(state, env, {
		type: 'scene.create',
		actorId: DM_ACTOR.id,
		payload: { name: 'Review', visibility: 'player-visible' },
	});
	if (created.status !== 'accepted') throw new Error('scene create failed');
	const sceneId = Object.keys(created.nextState.scenes.scenes)[0];
	if (!sceneId) throw new Error('missing scene id');
	const added = dispatchCommand(created.nextState, env, {
		type: 'scene.add-widget',
		actorId: DM_ACTOR.id,
		payload: {
			sceneId,
			widget: {
				type: 'weather',
				version: '1.0.0',
				layout: { x: 10, y: 20, w: 240, h: 160 },
				configuration: {},
				binding: null,
			},
		},
	});
	if (added.status !== 'accepted') throw new Error('add-widget failed');
	return { state: added.nextState, sceneId };
}

describe('RC-WID-1.5: widget.package.review records the DM trust decision', () => {
	it('is DM-only', () => {
		const { env, state, packageId } = installed();
		const result = dispatchCommand(state, env, {
			type: 'widget.package.review',
			actorId: PLAYER_ACTOR.id,
			payload: { packageId, trustState: 'trusted' },
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(result.nextState.widgets.packages[packageId]?.trust.state).toBe('unreviewed');
	});

	it('rejects a review of a package that is not installed', () => {
		const { env, state } = installed();
		const result = dispatchCommand(state, env, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: { packageId: 'workspace.nothing', trustState: 'trusted' },
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('package-not-found');
	});

	it('approves the requested permissions it was given, appends an op, and emits the event', () => {
		const { env, state, packageId } = installed();
		const result = dispatchCommand(state, env, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: {
				packageId,
				trustState: 'trusted',
				hostPermissions: { network: 'approved' },
			},
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const record = result.nextState.widgets.packages[packageId];
		expect(record?.trust.state).toBe('trusted');
		expect(record?.trust.hostPermissions.network).toBe('approved');
		// Omitted decisions keep their installed value — an omission never widens access.
		expect(record?.trust.hostPermissions.clipboard).toBe('denied');
		expect(record?.trust.hostPermissions.filesystem).toBe('denied');
		expect(record?.trust.reviewedBy).toBe(DM_ACTOR.id);
		expect(record?.trust.reviewedAt).toBeTruthy();
		expect(result.operationIds).toHaveLength(1);
		expect(result.events).toContainEqual(
			expect.objectContaining({
				kind: 'widget.package-reviewed',
				packageId,
				trustState: 'trusted',
				approvedPermissions: ['network'],
			}),
		);
		const op = result.nextState.sync.operations.at(-1);
		expect(op?.opType).toBe('widget.package.review');
	});

	it('refuses to approve a permission the package never requests', () => {
		const { env, state, packageId } = installed();
		const result = dispatchCommand(state, env, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: {
				packageId,
				trustState: 'trusted',
				hostPermissions: { filesystem: 'approved' },
			},
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('invalid-payload');
		expect(result.rejection.issues).toContainEqual(expect.objectContaining({ path: 'filesystem' }));
		expect(result.nextState.widgets.packages[packageId]?.trust.hostPermissions.filesystem).toBe(
			'denied',
		);
	});

	it('will not trust a package the review recommends denying until the DM acknowledges it', () => {
		const { env, state, packageId } = installed();
		// A package can become `deny-until-fixed` after install — here it declares a host API version
		// this core no longer supports, which is exactly what a core upgrade produces.
		const stale: CoreStateSlice = {
			...state,
			widgets: {
				...state.widgets,
				packages: {
					...state.widgets.packages,
					[packageId]: {
						...state.widgets.packages[packageId]!,
						package: {
							...state.widgets.packages[packageId]!.package,
							widgets: state.widgets.packages[packageId]!.package.widgets.map((widget) => ({
								...widget,
								renderEntrypoint: {
									runtime: 'custom-html-js' as const,
									sandbox: 'iframe' as const,
									assetPath: 'widgets/weather/index.html',
									hostApiVersion: CUSTOM_WIDGET_HOST_API_VERSION + 1,
								},
							})),
						},
					},
				},
			},
		};

		const refused = dispatchCommand(stale, env, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: { packageId, trustState: 'trusted', hostPermissions: { network: 'approved' } },
		});
		expect(refused.status).toBe('rejected');
		if (refused.status !== 'rejected') return;
		expect(refused.rejection.code).toBe('review-recommendation-unacknowledged');
		expect(refused.rejection.issues?.length).toBeGreaterThan(0);
		expect(refused.nextState.widgets.packages[packageId]?.trust.state).toBe('unreviewed');

		const acknowledged = dispatchCommand(stale, env, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: {
				packageId,
				trustState: 'trusted',
				hostPermissions: { network: 'approved' },
				acknowledgeRecommendation: true,
			},
		});
		expect(acknowledged.status).toBe('accepted');
		if (acknowledged.status !== 'accepted') return;
		expect(acknowledged.nextState.widgets.packages[packageId]?.trust.state).toBe('trusted');

		// Denying the same package never needs an acknowledgment — that is the safe direction.
		const denied = dispatchCommand(stale, env, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: { packageId, trustState: 'denied' },
		});
		expect(denied.status).toBe('accepted');
	});

	it('a denial revokes every permission, disables the package, and pauses its placed widgets', () => {
		const { env, state, packageId } = installed();
		const trusted = dispatchCommand(state, env, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: { packageId, trustState: 'trusted', hostPermissions: { network: 'approved' } },
		});
		if (trusted.status !== 'accepted') throw new Error('review failed');
		const enabled = dispatchCommand(trusted.nextState, env, {
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId },
		});
		if (enabled.status !== 'accepted') throw new Error('enable failed');
		const placed = sceneWithWidget(enabled.nextState, env);

		const denied = dispatchCommand(placed.state, env, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: { packageId, trustState: 'denied' },
		});
		expect(denied.status).toBe('accepted');
		if (denied.status !== 'accepted') return;
		const record = denied.nextState.widgets.packages[packageId];
		expect(record?.trust.state).toBe('denied');
		expect(record?.trust.hostPermissions.network).toBe('denied');
		expect(record?.enabled).toBe(false);
		const widget = denied.nextState.scenes.scenes[placed.sceneId]?.widgets[0];
		expect(widget?.disabled?.reason).toBe('package-disabled');
		// The instance is preserved, not destroyed — a denial is recoverable.
		expect(widget?.type).toBe('weather');

		// And a denied package cannot simply be switched back on from the package list.
		const reEnable = dispatchCommand(denied.nextState, env, {
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId },
		});
		expect(reEnable.status).toBe('rejected');
		if (reEnable.status !== 'rejected') return;
		expect(reEnable.rejection.code).toBe('invalid-state');
	});

	it('re-reviewing a denied package restores it', () => {
		const { env, state, packageId } = installed();
		const denied = dispatchCommand(state, env, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: { packageId, trustState: 'denied' },
		});
		if (denied.status !== 'accepted') throw new Error('deny failed');
		const restored = dispatchCommand(denied.nextState, env, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: { packageId, trustState: 'trusted', hostPermissions: { clipboard: 'approved' } },
		});
		expect(restored.status).toBe('accepted');
		if (restored.status !== 'accepted') return;
		expect(restored.nextState.widgets.packages[packageId]?.trust.state).toBe('trusted');
		const enabled = dispatchCommand(restored.nextState, env, {
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId },
		});
		expect(enabled.status).toBe('accepted');
	});
});
