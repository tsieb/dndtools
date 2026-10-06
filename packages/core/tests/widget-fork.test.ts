import { describe, expect, it } from 'vitest';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import {
	TORCHLIGHT_STARTER,
	dispatchCommand,
	evaluateWidgetPackageForkTrust,
	widgetPackageForkIdentity,
	type CoreCommand,
	type CoreStateSlice,
	type WidgetDefinition,
	type WidgetPackageDefinition,
} from '../src';
import { WIDGET_RENDER_HOST_API_VERSION } from '../src/state/widget-package-state';

/**
 * RC-WID-6.6 — FORK. `widget.package.fork` copies one installed widget into a new user-authored
 * package, and the copy's trust is decided afresh by the RC-WID-6.2 author-trust rule: a template
 * copy is trusted and on, a copy of custom code (Torchlight) is unreviewed and off, and nothing the
 * source was granted carries over. A denied or unreviewed generated source keeps its copy on the
 * review path. `scene.repoint-widget` moves a placed copy onto the fork and back, and nowhere else.
 */

const EMPTY_SCHEMA = { type: 'object' as const, additionalProperties: true };

function templateWidget(overrides: Partial<WidgetDefinition> = {}): WidgetDefinition {
	return {
		type: 'party-hp',
		version: '1.0.0',
		displayName: 'Party HP',
		author: 'workspace',
		renderEntrypoint: {
			runtime: 'template',
			template: 'status-list',
			hostApiVersion: WIDGET_RENDER_HOST_API_VERSION,
		},
		style: { isolation: 'host-scoped', capabilities: ['css-variables', 'host-theme-tokens'] },
		supportedProfiles: ['desktop', 'tablet', 'mobile', 'web'],
		defaultSize: { width: 360, height: 260 },
		minSize: { width: 220, height: 160 },
		resizePolicy: 'free',
		requiredBindings: [],
		optionalBindings: [],
		configurationSchema: EMPTY_SCHEMA,
		capabilitySets: ['manager', 'operator', 'viewer'],
		commands: [],
		events: [],
		hostPermissions: [],
		...overrides,
	};
}

function bundle(overrides: Partial<WidgetPackageDefinition> = {}): WidgetPackageDefinition {
	return {
		id: 'workspace.bundle',
		version: '2.1.0',
		displayName: 'Bundle',
		authoring: { source: 'workspace', createdBy: 'starter-library' },
		widgets: [templateWidget(), templateWidget({ type: 'party-gold', displayName: 'Party gold' })],
		migrations: [],
		assets: [],
		portabilityWarnings: ['Desktop only'],
		...overrides,
	};
}

function run(state: CoreStateSlice, command: CoreCommand, env = makeEnvironment()) {
	const result = dispatchCommand(state, env, command);
	if (result.status !== 'accepted') return { result, state };
	return { result, state: result.nextState };
}

function accept(state: CoreStateSlice, command: CoreCommand): CoreStateSlice {
	const { result, state: next } = run(state, command);
	expect(result.status, JSON.stringify(result.status === 'rejected' && result.rejection)).toBe(
		'accepted',
	);
	return next;
}

/** A vault with `definition` installed and, by default, trusted by the DM in the sheet and on. */
function withInstalled(
	definition: WidgetPackageDefinition,
	trust: 'trusted' | 'denied' | 'unreviewed' = 'trusted',
): CoreStateSlice {
	let state = accept(buildInitialState(DM_ACTOR, PLAYER_ACTOR), {
		type: 'widget.package.install',
		actorId: DM_ACTOR.id,
		payload: { package: definition },
	});
	if (trust !== 'unreviewed') {
		state = accept(state, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: { packageId: definition.id, trustState: trust },
		});
	}
	if (trust === 'trusted') {
		state = accept(state, {
			type: 'widget.package.enable',
			actorId: DM_ACTOR.id,
			payload: { packageId: definition.id },
		});
	}
	return state;
}

const fork = (packageId: string, widgetType: string, extra: Record<string, unknown> = {}) =>
	({
		type: 'widget.package.fork',
		actorId: DM_ACTOR.id,
		payload: { packageId, widgetType, ...extra },
	}) as const;

describe('RC-WID-6.6: widget.package.fork', () => {
	it('copies one widget of a bundle into a user-authored package, trusted and on by the 6.2 rule', () => {
		const state = withInstalled(bundle());
		const { result, state: next } = run(state, fork('workspace.bundle', 'party-gold'));
		expect(result.status).toBe('accepted');
		const record = next.widgets.packages['user.party-gold']!;
		expect(record.package).toMatchObject({
			id: 'user.party-gold',
			version: '1.0.0',
			displayName: 'Party gold (copy)',
			migrations: [],
			portabilityWarnings: ['Desktop only'],
			authoring: {
				source: 'user-authored',
				createdBy: 'widget.package.fork',
				forkedFrom: { packageId: 'workspace.bundle', version: '2.1.0', widgetType: 'party-gold' },
			},
		});
		// Exactly the one widget, under a fresh type, at the package version, authored by the user.
		expect(record.package.widgets).toHaveLength(1);
		expect(record.package.widgets[0]).toMatchObject({
			type: 'party-gold-copy',
			version: '1.0.0',
			displayName: 'Party gold (copy)',
			author: 'user',
			renderEntrypoint: { runtime: 'template', template: 'status-list' },
		});
		expect(record.trust).toMatchObject({
			state: 'trusted',
			basis: 'author',
			reviewedBy: DM_ACTOR.id,
		});
		expect(Object.values(record.trust.hostPermissions).every((d) => d === 'denied')).toBe(true);
		expect(record.enabled).toBe(true);
		// The source is untouched and still owns its own types.
		expect(next.widgets.packages['workspace.bundle']).toEqual(
			state.widgets.packages['workspace.bundle'],
		);
		// The audit trail: the fork op, then the same author review entry a builder install writes.
		const ops = next.sync.operations.slice(state.sync.operations.length);
		expect(ops.map((op) => op.opType)).toEqual(['widget.package.fork', 'widget.package.review']);
		expect(ops[0]!.value).toMatchObject({
			packageId: 'user.party-gold',
			trust: 'author',
			forkedFrom: { packageId: 'workspace.bundle', widgetType: 'party-gold' },
		});
		expect(ops[1]!.value).toMatchObject({ trustState: 'trusted', basis: 'author' });
		if (result.status === 'accepted') {
			expect(result.events.map((event) => event.kind)).toEqual([
				'widget.package-forked',
				'widget.package-installed',
				'widget.package-reviewed',
				'widget.package-enabled',
			]);
		}
	});

	it('forks the Torchlight starter unreviewed and off: custom code never rides the source trust', () => {
		const torchlight = TORCHLIGHT_STARTER.build();
		const state = withInstalled(torchlight);
		expect(state.widgets.packages['starter.torchlight']!.trust.state).toBe('trusted');

		const { result, state: next } = run(state, fork('starter.torchlight', 'torchlight'));
		expect(result.status).toBe('accepted');
		const record = next.widgets.packages['user.torchlight']!;
		expect(record.trust.state).toBe('unreviewed');
		expect(record.trust.basis).toBeUndefined();
		expect(record.enabled).toBe(false);
		expect(Object.values(record.trust.hostPermissions).every((d) => d === 'denied')).toBe(true);
		// The copy carries the code it was made from, so the builder opens on it.
		expect(record.package.widgets[0]!.renderEntrypoint?.runtime).toBe('custom-html-js');
		expect(record.package.assets.map((asset) => asset.path)).toEqual(
			torchlight.assets.map((asset) => asset.path),
		);
		expect(record.package.widgets[0]!.type).toBe('torchlight-copy');
		const ops = next.sync.operations.slice(state.sync.operations.length);
		expect(ops.map((op) => op.opType)).toEqual(['widget.package.fork']);
		expect(ops[0]!.value).toMatchObject({ trust: 'unreviewed' });

		const evaluation = evaluateWidgetPackageForkTrust(
			state.widgets.packages['starter.torchlight']!,
			record.package,
		);
		expect(evaluation.eligible).toBe(false);
		expect(evaluation.authorTrust.refusals.map((item) => item.code)).toEqual(
			expect.arrayContaining(['author-trust.not-template', 'author-trust.code-asset']),
		);
		expect(evaluation.sourceRefusals).toEqual([]);
	});

	it('keeps the copy of a denied source on the review path, even when the copy itself qualifies', () => {
		const state = withInstalled(bundle(), 'denied');
		const { state: next } = run(state, fork('workspace.bundle', 'party-hp'));
		const record = next.widgets.packages['user.party-hp']!;
		expect(record.trust.state).toBe('unreviewed');
		expect(record.enabled).toBe(false);
		const evaluation = evaluateWidgetPackageForkTrust(
			state.widgets.packages['workspace.bundle']!,
			record.package,
		);
		expect(evaluation.authorTrust.eligible).toBe(true);
		expect(evaluation.sourceRefusals.map((item) => item.code)).toEqual(['fork.source-denied']);
	});

	it('keeps the copy of an unreviewed generated source on the review path; a trusted one may clear', () => {
		const generated = bundle({ authoring: { source: 'generated', createdBy: 'assistant' } });
		const unreviewed = withInstalled(generated, 'unreviewed');
		const { state: afterUnreviewed } = run(unreviewed, fork('workspace.bundle', 'party-hp'));
		expect(afterUnreviewed.widgets.packages['user.party-hp']!.trust.state).toBe('unreviewed');
		expect(
			evaluateWidgetPackageForkTrust(
				unreviewed.widgets.packages['workspace.bundle']!,
				afterUnreviewed.widgets.packages['user.party-hp']!.package,
			).sourceRefusals.map((item) => item.code),
		).toEqual(['fork.source-generated']);

		const reviewed = withInstalled(generated, 'trusted');
		const { state: afterReviewed } = run(reviewed, fork('workspace.bundle', 'party-hp'));
		expect(afterReviewed.widgets.packages['user.party-hp']!.trust).toMatchObject({
			state: 'trusted',
			basis: 'author',
		});
	});

	it('never copies an approved permission: a permissioned template copy is unreviewed and all denied', () => {
		const permissioned = bundle({
			widgets: [templateWidget({ hostPermissions: ['clipboard'] })],
		});
		let state = withInstalled(permissioned, 'unreviewed');
		state = accept(state, {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: {
				packageId: 'workspace.bundle',
				trustState: 'trusted',
				hostPermissions: { clipboard: 'approved' },
			},
		});
		expect(state.widgets.packages['workspace.bundle']!.trust.hostPermissions.clipboard).toBe(
			'approved',
		);
		const { state: next } = run(state, fork('workspace.bundle', 'party-hp'));
		const record = next.widgets.packages['user.party-hp']!;
		expect(record.trust.state).toBe('unreviewed');
		expect(record.trust.hostPermissions.clipboard).toBe('denied');
		expect(record.enabled).toBe(false);
	});

	it('numbers a second copy and honours caller-named ids, refusing taken ones', () => {
		let state = withInstalled(bundle());
		state = accept(state, fork('workspace.bundle', 'party-hp'));
		expect(widgetPackageForkIdentity(state.widgets, 'party-hp')).toEqual({
			packageId: 'user.party-hp-2',
			widgetType: 'party-hp-copy-2',
		});
		state = accept(state, fork('workspace.bundle', 'party-hp', { displayName: 'Mine' }));
		expect(state.widgets.packages['user.party-hp-2']!.package.displayName).toBe('Mine');

		const taken = run(
			state,
			fork('workspace.bundle', 'party-hp', { forkPackageId: 'user.party-hp' }),
		);
		expect(taken.result.status).toBe('rejected');
		const typeTaken = run(
			state,
			fork('workspace.bundle', 'party-hp', { forkWidgetType: 'party-gold' }),
		);
		expect(typeTaken.result.status).toBe('rejected');
		const notSlug = run(
			state,
			fork('workspace.bundle', 'party-hp', { forkPackageId: 'Not A Slug' }),
		);
		expect(notSlug.result.status).toBe('rejected');
	});

	it('refuses a player, a missing source or widget, and a built-in renderer', () => {
		const state = withInstalled(bundle());
		const asPlayer = dispatchCommand(state, makeEnvironment(), {
			...fork('workspace.bundle', 'party-hp'),
			actorId: PLAYER_ACTOR.id,
		});
		expect(asPlayer.status).toBe('rejected');
		expect(run(state, fork('workspace.nope', 'party-hp')).result.status).toBe('rejected');
		expect(run(state, fork('workspace.bundle', 'nope')).result.status).toBe('rejected');

		const builtin = Object.values(state.widgets.packages).find((record) =>
			record.package.widgets.some((widget) => widget.renderEntrypoint?.runtime === 'builtin'),
		)!;
		const builtinType = builtin.package.widgets.find(
			(widget) => widget.renderEntrypoint?.runtime === 'builtin',
		)!.type;
		const refused = run(state, fork(builtin.package.id, builtinType));
		expect(refused.result.status).toBe('rejected');
		if (refused.result.status === 'rejected') {
			expect(refused.result.rejection.code).toBe('invalid-state');
		}
	});

	it('a forked package is saved again through upgrade with its forkedFrom intact', () => {
		let state = withInstalled(bundle());
		state = accept(state, fork('workspace.bundle', 'party-hp'));
		const copy = state.widgets.packages['user.party-hp']!.package;
		state = accept(state, {
			type: 'widget.package.upgrade',
			actorId: DM_ACTOR.id,
			payload: {
				package: {
					...copy,
					version: '1.0.1',
					widgets: [{ ...copy.widgets[0]!, version: '1.0.1', displayName: 'Renamed' }],
					migrations: [{ widgetType: 'party-hp-copy', fromVersion: '1.0.0', toVersion: '1.0.1' }],
				},
			},
		});
		expect(state.widgets.packages['user.party-hp']!.package.authoring?.forkedFrom).toEqual({
			packageId: 'workspace.bundle',
			version: '2.1.0',
			widgetType: 'party-hp',
		});
	});
});

describe('RC-WID-6.6: scene.repoint-widget', () => {
	function placed(state: CoreStateSlice, type = 'party-hp') {
		state = accept(state, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Shelf', description: '', visibility: 'dm-only', tags: [] },
		});
		const scene = Object.values(state.scenes.scenes).find(
			(candidate) => candidate.name === 'Shelf',
		)!;
		state = accept(state, {
			type: 'scene.add-widget',
			actorId: DM_ACTOR.id,
			payload: {
				sceneId: scene.id,
				widget: {
					type,
					version: '1.0.0',
					layout: { x: 40, y: 40, w: 320, h: 260 },
					configuration: { title: 'Kept' },
					localState: {},
					binding: null,
				},
			},
		});
		const instance = state.scenes.scenes[scene.id]!.widgets[0]!;
		return { state, sceneId: scene.id, instance };
	}

	const repoint = (sceneId: string, widgetInstanceId: string, widgetType: string) =>
		({
			type: 'scene.repoint-widget',
			actorId: DM_ACTOR.id,
			payload: { sceneId, widgetInstanceId, widgetType },
		}) as const;

	it('moves a placed copy onto its fork and back, keeping id, layout and settings', () => {
		const start = placed(withInstalled(bundle()));
		const forked = accept(start.state, fork('workspace.bundle', 'party-hp'));
		const onto = accept(forked, repoint(start.sceneId, start.instance.id, 'party-hp-copy'));
		const moved = onto.scenes.scenes[start.sceneId]!.widgets[0]!;
		expect(moved).toEqual({ ...start.instance, type: 'party-hp-copy', version: '1.0.0' });
		const op = onto.sync.operations.at(-1)!;
		expect(op.opType).toBe('scene.repoint-widget');
		expect(op.value).toMatchObject({ fromType: 'party-hp', widgetType: 'party-hp-copy' });

		const back = accept(onto, repoint(start.sceneId, start.instance.id, 'party-hp'));
		expect(back.scenes.scenes[start.sceneId]!.widgets[0]).toEqual(start.instance);
	});

	it('refuses an unrelated widget, a switched-off fork, a player and the same type', () => {
		const start = placed(withInstalled(bundle()));
		// A sibling in the same bundle is not a fork of this tile.
		expect(
			run(start.state, repoint(start.sceneId, start.instance.id, 'party-gold')).result.status,
		).toBe('rejected');
		expect(
			run(start.state, repoint(start.sceneId, start.instance.id, 'party-hp')).result.status,
		).toBe('rejected');

		let state = accept(start.state, fork('workspace.bundle', 'party-hp'));
		state = accept(state, {
			type: 'widget.package.disable',
			actorId: DM_ACTOR.id,
			payload: { packageId: 'user.party-hp' },
		});
		const off = run(state, repoint(start.sceneId, start.instance.id, 'party-hp-copy'));
		expect(off.result.status).toBe('rejected');
		if (off.result.status === 'rejected')
			expect(off.result.rejection.code).toBe('package-disabled');

		const asPlayer = dispatchCommand(state, makeEnvironment(), {
			...repoint(start.sceneId, start.instance.id, 'party-hp-copy'),
			actorId: PLAYER_ACTOR.id,
		});
		expect(asPlayer.status).toBe('rejected');
	});
});
