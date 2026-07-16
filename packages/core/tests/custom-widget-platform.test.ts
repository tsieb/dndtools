import { describe, expect, it } from 'vitest';
import { DM_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';
import {
	CUSTOM_WIDGET_HOST_API_VERSION,
	buildWidgetPackageReviewSummary,
	dispatchCommand,
	resolveCustomWidgetRuntimePolicy,
	scaffoldCustomWidgetPackageDraft,
	stageWidgetWizardDraft,
	type WidgetPackageDefinition,
} from '../src';

const EMPTY_SCHEMA = { type: 'object' as const, additionalProperties: true };

function customPackage(overrides: Partial<WidgetPackageDefinition> = {}): WidgetPackageDefinition {
	const version = overrides.version ?? '1.0.0';
	return {
		id: overrides.id ?? 'workspace.npc-combat-widget',
		version,
		displayName: overrides.displayName ?? 'NPC Combat Widget',
		authoring: overrides.authoring ?? {
			source: 'generated',
			llmProvider: 'local-placeholder',
			promptSummary: 'Show current NPC combatants and announce deaths.',
		},
		widgets: overrides.widgets ?? [
			{
				type: 'npc-combat',
				version,
				displayName: 'NPC Combat',
				author: 'workspace',
				renderEntrypoint: {
					runtime: 'custom-html-js',
					sandbox: 'iframe',
					assetPath: 'widgets/npc-combat/index.html',
					hostApiVersion: CUSTOM_WIDGET_HOST_API_VERSION,
				},
				style: {
					isolation: 'iframe-document',
					stylesheetAssetPaths: ['widgets/npc-combat/styles.css'],
					capabilities: ['css-variables', 'custom-stylesheet', 'responsive-layout'],
					tokens: [
						{ name: 'accent', value: '#dc2626', description: 'Danger highlight color.' },
						{ name: 'surface', value: '#111827' },
					],
					cssVariables: {
						'--npc-accent': '#dc2626',
					},
				},
				supportedProfiles: ['desktop', 'tablet', 'web'],
				defaultSize: { width: 360, height: 240 },
				minSize: { width: 240, height: 160 },
				resizePolicy: 'free',
				requiredBindings: [
					{
						id: 'combatants',
						label: 'Current combatants',
						entityTypes: ['combatant'],
						mode: 'read',
						requiredCapability: 'viewer',
					},
				],
				optionalBindings: [],
				dataQueries: [
					{
						id: 'current-combatants',
						label: 'Current combatants',
						source: 'current-combatants',
						bindingIds: ['combatants'],
						requiredCapability: 'viewer',
						audience: 'shared',
					},
				],
				computedFields: [
					{
						id: 'low-hp',
						label: 'Below 20 percent HP',
						inputQueryIds: ['current-combatants'],
						valueType: 'array',
					},
				],
				outputWrites: [
					{
						id: 'death-announcement',
						label: 'Announce defeated NPC',
						commandType: 'npc.announce-death',
						destinationClass: 'player-scene',
						payloadSchema: EMPTY_SCHEMA,
						requiresConfirmation: true,
					},
				],
				configurationSchema: EMPTY_SCHEMA,
				runtimeStateSchema: EMPTY_SCHEMA,
				capabilitySets: ['manager', 'operator', 'viewer'],
				commands: [
					{
						type: 'npc.announce-death',
						displayName: 'Announce death',
						requiredCapability: 'operator',
						payloadSchema: EMPTY_SCHEMA,
						writesTo: 'session',
						destinationClass: 'player-scene',
						targetBindingId: 'combatants',
					},
				],
				events: [],
				hostPermissions: ['clipboard', 'network'],
				networkDestinationClasses: ['widget-declared'],
			},
		],
		migrations: overrides.migrations ?? [],
		assets: overrides.assets ?? [
			{
				path: 'widgets/npc-combat/index.html',
				kind: 'html',
				entrypoint: true,
				content:
					'<!doctype html><div id="app"></div><script type="module" src="./main.js"></script>',
			},
			{
				path: 'widgets/npc-combat/main.js',
				kind: 'javascript',
				content: 'export function render() {}',
			},
			{
				path: 'widgets/npc-combat/styles.css',
				kind: 'css',
				content: ':root { --npc-accent: #dc2626; }',
			},
		],
		portabilityWarnings: overrides.portabilityWarnings ?? [],
	};
}

describe('custom system widget platform package review', () => {
	it('summarizes custom code, bindings, commands, host permissions, and player-visible writes', () => {
		const review = buildWidgetPackageReviewSummary(customPackage());
		expect(review.trustRecommendation).toBe('requires-review');
		expect(review.customCodeWidgets).toEqual(['npc-combat']);
		expect(review.requestedHostPermissions).toEqual(['clipboard', 'network']);
		expect(review.requestedNetworkDestinations).toEqual(['widget-declared']);
		expect(review.requestedStyleAssets).toEqual([
			{
				widgetType: 'npc-combat',
				assetPath: 'widgets/npc-combat/styles.css',
				isolation: 'iframe-document',
			},
		]);
		expect(review.requestedStyleCapabilities).toEqual([
			'css-variables',
			'custom-stylesheet',
			'responsive-layout',
		]);
		expect(review.requestedBindings).toMatchObject([
			{ widgetType: 'npc-combat', bindingId: 'combatants', label: 'Current combatants' },
		]);
		expect(review.requestedCommands).toMatchObject([
			{
				widgetType: 'npc-combat',
				commandType: 'npc.announce-death',
				writesTo: 'session',
				destinationClass: 'player-scene',
			},
		]);
		expect(review.crossPrivilegeWriteRisks).toContainEqual({
			widgetType: 'npc-combat',
			destinationClass: 'player-scene',
		});
		expect(review.diagnostics.some((item) => item.code === 'review.generated-package')).toBe(true);
	});

	it('stages wizard output as an unreviewed package draft with a review summary', () => {
		const draft = stageWidgetWizardDraft({
			providerId: 'local-model-placeholder',
			providerKind: 'mcp-style',
			capabilities: ['structured-output', 'permission-simulation'],
			package: { ...customPackage(), authoring: undefined },
		});
		expect(draft.state).toBe('unreviewed');
		expect(draft.provider).toMatchObject({
			id: 'local-model-placeholder',
			kind: 'mcp-style',
		});
		expect(draft.package.authoring).toMatchObject({
			source: 'generated',
			llmProvider: 'local-model-placeholder',
		});
		expect(draft.review.trustRecommendation).toBe('requires-review');
	});

	it('scaffolds a styled custom HTML/CSS/JS widget draft for review', () => {
		const draft = scaffoldCustomWidgetPackageDraft({
			displayName: 'Boss Phase Tracker',
			description: 'Track boss phases and emit table-facing status.',
			hostPermissions: ['clipboard'],
			styleCapabilities: ['css-variables', 'custom-stylesheet', 'animation'],
			styleTokens: [
				{ name: 'accent', value: '#7c3aed' },
				{ name: 'surface', value: '#0f172a' },
				{ name: 'text', value: '#f8fafc' },
			],
		});
		expect(draft.state).toBe('unreviewed');
		expect(draft.package.widgets[0]).toMatchObject({
			type: 'boss-phase-tracker',
			renderEntrypoint: {
				runtime: 'custom-html-js',
				sandbox: 'iframe',
				assetPath: 'widgets/boss-phase-tracker/index.html',
			},
			style: {
				isolation: 'iframe-document',
				stylesheetAssetPaths: ['widgets/boss-phase-tracker/styles.css'],
			},
		});
		expect(draft.package.assets.map((asset) => [asset.path, asset.kind])).toEqual([
			['widgets/boss-phase-tracker/index.html', 'html'],
			['widgets/boss-phase-tracker/styles.css', 'css'],
			['widgets/boss-phase-tracker/main.js', 'javascript'],
		]);
		expect(draft.review.requestedStyleCapabilities).toContain('animation');
		expect(draft.review.requestedHostPermissions).toEqual(['clipboard']);
	});

	it('scaffolds button CSS whose foreground tracks the accent (no hardcoded white) so preview = render (B11)', () => {
		const draft = scaffoldCustomWidgetPackageDraft({ displayName: 'Contrast Probe' });
		const css = draft.package.assets.find((asset) => asset.kind === 'css')?.content ?? '';
		expect(css).toContain('.widget-button');
		// The accent foreground resolves via the host token chain, matching the live render — never `white`.
		expect(css).toContain('color: var(--widget-accent-foreground, var(--color-accent-foreground))');
		expect(css).not.toContain('color: white');
	});

	it('rejects a custom widget package whose entrypoint asset is undeclared', () => {
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const result = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: {
				package: customPackage({
					assets: [{ path: 'widgets/npc-combat/main.js', kind: 'javascript' }],
				}),
			},
		});
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') return;
		expect(result.rejection.issues).toContainEqual(
			expect.objectContaining({ path: 'schema.render-entrypoint-asset-missing' }),
		);
	});

	it('rejects styled custom packages whose stylesheet asset is missing or not CSS', () => {
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const missing = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: {
				package: customPackage({
					assets: [
						{ path: 'widgets/npc-combat/index.html', kind: 'html', entrypoint: true },
						{ path: 'widgets/npc-combat/main.js', kind: 'javascript' },
					],
				}),
			},
		});
		expect(missing.status).toBe('rejected');
		if (missing.status !== 'rejected') throw new Error('expected missing stylesheet rejection');
		expect(missing.rejection.issues).toContainEqual(
			expect.objectContaining({ path: 'schema.stylesheet-asset-missing' }),
		);

		const wrongKind = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: {
				package: customPackage({
					assets: [
						{ path: 'widgets/npc-combat/index.html', kind: 'html', entrypoint: true },
						{ path: 'widgets/npc-combat/main.js', kind: 'javascript' },
						{ path: 'widgets/npc-combat/styles.css', kind: 'asset' },
					],
				}),
			},
		});
		expect(wrongKind.status).toBe('rejected');
		if (wrongKind.status !== 'rejected') return;
		expect(wrongKind.rejection.issues).toContainEqual(
			expect.objectContaining({ path: 'schema.stylesheet-asset-kind' }),
		);
	});

	it('installs valid generated custom packages as unreviewed and disabled', () => {
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const result = dispatchCommand(state, env, {
			type: 'widget.package.install',
			actorId: DM_ACTOR.id,
			payload: { package: customPackage() },
		});
		expect(result.status).toBe('accepted');
		if (result.status !== 'accepted') return;
		const record = result.nextState.widgets.packages['workspace.npc-combat-widget'];
		expect(record?.trust.state).toBe('unreviewed');
		expect(record?.enabled).toBe(false);
		expect(record?.trust.hostPermissions.clipboard).toBe('denied');
		expect(record?.trust.hostPermissions.network).toBe('denied');
	});
});

describe('custom HTML/JS runtime sandbox policy', () => {
	it('uses isolated iframe execution and exposes only approved host capabilities', () => {
		const widget = customPackage().widgets[0];
		if (!widget) throw new Error('missing widget');
		const result = resolveCustomWidgetRuntimePolicy(widget, {
			approvedPermissions: ['clipboard'],
		});
		expect(result.policy).toMatchObject({
			widgetType: 'npc-combat',
			runtime: 'custom-html-js',
			sandbox: 'iframe',
			assetPath: 'widgets/npc-combat/index.html',
			isolated: true,
			rawAppStateAvailable: false,
			rawStorageAvailable: false,
			rawIpcAvailable: false,
			requiresReview: true,
			styleIsolation: 'iframe-document',
			stylesheetAssetPaths: ['widgets/npc-combat/styles.css'],
		});
		expect(result.policy.styleCapabilities).toEqual([
			'css-variables',
			'custom-stylesheet',
			'responsive-layout',
		]);
		expect(result.policy.exposedCapabilities).toEqual(['clipboard']);
		expect(result.policy.forbiddenCapabilities).toContain('raw-vault-file');
		expect(result.policy.forbiddenCapabilities).toContain('auth-token');
	});

	it('reports every unsafe or unsupported custom-runtime declaration', () => {
		const widget = customPackage().widgets[0];
		if (!widget) throw new Error('missing widget');
		const result = resolveCustomWidgetRuntimePolicy(
			{
				...widget,
				renderEntrypoint: {
					runtime: 'custom-html-js',
					hostApiVersion: CUSTOM_WIDGET_HOST_API_VERSION + 1,
				},
				style: undefined,
			},
			{ approvedPermissions: [] },
		);
		expect(result.issues.map((issue) => issue.code)).toEqual([
			'custom-runtime-missing-entrypoint',
			'custom-runtime-unsupported-host-api',
			'custom-runtime-missing-sandbox',
		]);
		expect(result.policy).toMatchObject({
			sandbox: 'iframe',
			styleIsolation: 'iframe-document',
		});
	});
});
