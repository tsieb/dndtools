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
	evaluateWidgetPackageAuthorTrust,
	type CoreStateSlice,
	type WidgetDefinition,
	type WidgetPackageDefinition,
} from '../src';
import { WIDGET_RENDER_HOST_API_VERSION } from '../src/state/widget-package-state';

/**
 * RC-WID-6.2 — AUTHOR TRUST. A DM's own template widget installs trusted and enabled on their word,
 * recorded as `trusted` by that DM with an audit entry. Everything the trust sheet exists to gate —
 * sandboxed code, a code or stylesheet file, any host permission, a network destination, a
 * player-visible write, a generated package — is refused author trust and keeps the fail-closed
 * path. An upgrade that stops qualifying loses the author trust.
 */

const EMPTY_SCHEMA = { type: 'object' as const, additionalProperties: true };

function templateWidget(overrides: Partial<WidgetDefinition> = {}): WidgetDefinition {
	return {
		type: 'party-hp',
		version: '1.0.0',
		displayName: 'Party HP',
		author: 'user',
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
		dataQueries: [
			{
				id: 'party',
				label: 'Party',
				source: 'current-combatants',
				requiredCapability: 'viewer',
				audience: 'dm',
			},
		],
		configurationSchema: EMPTY_SCHEMA,
		runtimeStateSchema: EMPTY_SCHEMA,
		capabilitySets: ['manager', 'operator', 'viewer'],
		commands: [],
		events: [],
		hostPermissions: [],
		networkDestinationClasses: [],
		...overrides,
	};
}

function packageOf(
	widget: WidgetDefinition = templateWidget(),
	overrides: Partial<WidgetPackageDefinition> = {},
): WidgetPackageDefinition {
	return {
		id: 'workspace.party-hp',
		version: '1.0.0',
		displayName: 'Party HP',
		authoring: { source: 'user-authored', createdBy: 'widget-builder' },
		widgets: [widget],
		migrations: [],
		assets: [],
		portabilityWarnings: [],
		...overrides,
	};
}

const customCodeWidget = () =>
	templateWidget({
		renderEntrypoint: {
			runtime: 'custom-html-js',
			sandbox: 'iframe',
			assetPath: 'widgets/party-hp/index.html',
			hostApiVersion: CUSTOM_WIDGET_HOST_API_VERSION,
		},
		style: { isolation: 'iframe-document', capabilities: ['css-variables'] },
	});
const customCodeAssets: WidgetPackageDefinition['assets'] = [
	{ path: 'widgets/party-hp/index.html', kind: 'html', entrypoint: true, content: '<p>hp</p>' },
	{ path: 'widgets/party-hp/main.js', kind: 'javascript', content: 'export {}' },
];

function install(
	definition: WidgetPackageDefinition,
	options: { authorTrust?: boolean; actorId?: string; state?: CoreStateSlice } = {},
) {
	const env = makeEnvironment();
	const state = options.state ?? buildInitialState(DM_ACTOR, PLAYER_ACTOR);
	const result = dispatchCommand(state, env, {
		type: 'widget.package.install',
		actorId: options.actorId ?? DM_ACTOR.id,
		payload: { package: definition, ...(options.authorTrust ? { authorTrust: true } : {}) },
	});
	return { env, state, result };
}

function refusalCodes(definition: WidgetPackageDefinition): string[] {
	return evaluateWidgetPackageAuthorTrust(definition).refusals.map((item) => item.code);
}

describe('RC-WID-6.2: the author-trust rule', () => {
	it('clears a template-only package with no permission and a "safe to trust" verdict', () => {
		const evaluation = evaluateWidgetPackageAuthorTrust(packageOf());
		expect(evaluation.review.trustRecommendation).toBe('trusted-after-review');
		expect(evaluation.eligible).toBe(true);
		expect(evaluation.refusals).toEqual([]);
	});

	it('refuses custom code, with or without its files', () => {
		expect(refusalCodes(packageOf(customCodeWidget(), { assets: customCodeAssets }))).toEqual(
			expect.arrayContaining(['author-trust.not-template', 'author-trust.code-asset']),
		);
		// A template widget smuggling a script file is refused for the file alone.
		expect(
			refusalCodes(
				packageOf(templateWidget(), {
					assets: [{ path: 'x/main.js', kind: 'javascript', content: 'export {}' }],
				}),
			),
		).toEqual(['author-trust.code-asset']);
		// An asset of unstated kind is treated as code: fail closed.
		expect(refusalCodes(packageOf(templateWidget(), { assets: [{ path: 'x/blob' }] }))).toEqual([
			'author-trust.code-asset',
		]);
		// A widget with no render entrypoint is not a template either.
		expect(refusalCodes(packageOf(templateWidget({ renderEntrypoint: undefined })))).toContain(
			'author-trust.not-template',
		);
	});

	it.each([
		'filesystem',
		'clipboard',
		'network',
		'source-adapter',
		'asset',
		'external-link',
		'navigate',
	] as const)('refuses a template widget asking for the %s permission', (permission) => {
		const evaluation = evaluateWidgetPackageAuthorTrust(
			packageOf(templateWidget({ hostPermissions: [permission] })),
		);
		expect(evaluation.eligible).toBe(false);
		expect(evaluation.refusals.map((item) => item.code)).toContain('author-trust.host-permission');
	});

	it('refuses network destinations, stylesheets, player-visible writes and generated packages', () => {
		expect(
			refusalCodes(packageOf(templateWidget({ networkDestinationClasses: ['widget-declared'] }))),
		).toContain('author-trust.network');
		expect(
			refusalCodes(
				packageOf(
					templateWidget({
						style: { isolation: 'host-scoped', capabilities: ['custom-stylesheet'] },
					}),
				),
			),
		).toContain('author-trust.stylesheet');
		expect(
			refusalCodes(
				packageOf(
					templateWidget({
						outputWrites: [
							{
								id: 'show',
								label: 'Show',
								commandType: 'party-hp.show',
								destinationClass: 'player-visible-state',
								payloadSchema: EMPTY_SCHEMA,
							},
						],
					}),
				),
			),
		).toEqual(['author-trust.review-verdict']);
		expect(
			refusalCodes(packageOf(templateWidget(), { authoring: { source: 'generated' } })),
		).toEqual(['author-trust.review-verdict']);
	});
});

describe('RC-WID-6.2: widget.package.install with authorTrust', () => {
	it('installs trusted and enabled, reviewed by the installing DM, with an audit entry', () => {
		const { state, result } = install(packageOf(), { authorTrust: true });
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const record = result.nextState.widgets.packages['workspace.party-hp']!;
		expect(record.enabled).toBe(true);
		expect(record.trust.state).toBe('trusted');
		expect(record.trust.basis).toBe('author');
		expect(record.trust.reviewedBy).toBe(DM_ACTOR.id);
		expect(record.trust.reviewedAt).not.toBeNull();
		// Trust grants nothing it was not asked for: every host permission stays denied.
		expect(Object.values(record.trust.hostPermissions).every((d) => d === 'denied')).toBe(true);

		const ops = result.nextState.sync.operations.slice(state.sync.operations.length);
		expect(ops.map((op) => op.opType)).toEqual(['widget.package.install', 'widget.package.review']);
		expect(ops[0]!.value).toMatchObject({ packageId: 'workspace.party-hp', trust: 'author' });
		expect(ops[1]!.actorId).toBe(DM_ACTOR.id);
		expect(ops[1]!.value).toMatchObject({
			packageId: 'workspace.party-hp',
			trustState: 'trusted',
			approvedPermissions: [],
			recommendation: 'trusted-after-review',
			basis: 'author',
		});
		expect(result.events.map((event) => event.kind)).toEqual([
			'widget.package-installed',
			'widget.package-reviewed',
			'widget.package-enabled',
		]);
	});

	it('without the flag, the same package still installs unreviewed and disabled', () => {
		const { result } = install(packageOf());
		if (result.status !== 'accepted') throw new Error('install failed');
		const record = result.nextState.widgets.packages['workspace.party-hp']!;
		expect(record.enabled).toBe(false);
		expect(record.trust.state).toBe('unreviewed');
		expect(record.trust.basis).toBeUndefined();
	});

	it('refuses author trust for custom code and installs nothing', () => {
		const { state, result } = install(packageOf(customCodeWidget(), { assets: customCodeAssets }), {
			authorTrust: true,
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('author-trust-refused');
		expect(result.rejection.issues?.map((issue) => issue.path)).toContain(
			'author-trust.not-template',
		);
		expect(result.nextState.widgets.packages['workspace.party-hp']).toBeUndefined();
		expect(result.nextState.sync.operations).toHaveLength(state.sync.operations.length);
	});

	it('refuses author trust for any host permission and installs nothing', () => {
		const { result } = install(packageOf(templateWidget({ hostPermissions: ['clipboard'] })), {
			authorTrust: true,
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('author-trust-refused');
		expect(result.rejection.issues?.map((issue) => issue.path)).toContain(
			'author-trust.host-permission',
		);
		expect(result.nextState.widgets.packages['workspace.party-hp']).toBeUndefined();
	});

	it('the custom-code package still installs on the fail-closed path without the flag', () => {
		const { result } = install(packageOf(customCodeWidget(), { assets: customCodeAssets }));
		if (result.status !== 'accepted') throw new Error('install failed');
		const record = result.nextState.widgets.packages['workspace.party-hp']!;
		expect(record.enabled).toBe(false);
		expect(record.trust.state).toBe('unreviewed');
	});

	it('is DM-only', () => {
		const { result } = install(packageOf(), { authorTrust: true, actorId: PLAYER_ACTOR.id });
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('accepts only `true`: any other value is a schema refusal', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: packageOf(), authorTrust: 'yes' },
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.code).toBe('invalid-payload');
	});
});

describe('RC-WID-6.2: an upgrade re-checks author trust', () => {
	function upgrade(state: CoreStateSlice, definition: WidgetPackageDefinition) {
		const result = dispatchCommand(state, makeEnvironment(), {
			type: 'widget.package.upgrade',
			actorId: DM_ACTOR.id,
			payload: { package: definition },
		});
		if (result.status !== 'accepted') throw new Error(`upgrade failed: ${JSON.stringify(result)}`);
		return result.nextState.widgets.packages['workspace.party-hp']!;
	}

	function authorTrusted(): CoreStateSlice {
		const { result } = install(packageOf(), { authorTrust: true });
		if (result.status !== 'accepted') throw new Error('install failed');
		return result.nextState;
	}

	it('keeps it while the package still qualifies', () => {
		const record = upgrade(
			authorTrusted(),
			packageOf(templateWidget({ version: '1.0.1' }), { version: '1.0.1' }),
		);
		expect(record.trust.state).toBe('trusted');
		expect(record.trust.basis).toBe('author');
	});

	it('drops to unreviewed, every permission denied, when an upgrade adds custom code', () => {
		const record = upgrade(
			authorTrusted(),
			packageOf(
				{ ...customCodeWidget(), version: '1.0.1', hostPermissions: ['clipboard'] },
				{ version: '1.0.1', assets: customCodeAssets },
			),
		);
		expect(record.trust.state).toBe('unreviewed');
		expect(record.trust.basis).toBeUndefined();
		expect(Object.values(record.trust.hostPermissions).every((d) => d === 'denied')).toBe(true);
	});

	it('leaves a package the DM reviewed in the sheet alone (not author basis)', () => {
		const { result } = install(packageOf());
		if (result.status !== 'accepted') throw new Error('install failed');
		const reviewed = dispatchCommand(result.nextState, makeEnvironment(), {
			type: 'widget.package.review',
			actorId: DM_ACTOR.id,
			payload: { packageId: 'workspace.party-hp', trustState: 'trusted' },
		});
		if (reviewed.status !== 'accepted') throw new Error('review failed');
		const record = upgrade(
			reviewed.nextState,
			packageOf(templateWidget({ version: '1.0.1', hostPermissions: ['clipboard'] }), {
				version: '1.0.1',
			}),
		);
		expect(record.trust.state).toBe('trusted');
		expect(record.trust.hostPermissions.clipboard).toBe('denied');
	});
});
