import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	ALL_HOST_PERMISSIONS,
	WIDGET_SANDBOX_CSP,
	validateWidgetSandboxDocument,
	type WidgetDefinition,
	type WidgetHostPermission,
	type WidgetPackageDefinition,
	type WidgetPackageRecord,
} from '@dndtools/core';
import {
	FORWARDED_THEME_TOKENS,
	WIDGET_HOST_API_VERSION,
	WIDGET_HOST_CHANNEL,
	WIDGET_SANDBOX_ATTRIBUTE,
	approvedHostPermissions,
	assembleWidgetDocument,
	auditSandboxFrame,
	clampContentHeight,
	collectThemeVariables,
	decideDispatch,
	decideOutbound,
	decidePermission,
	parseGuestMessage,
	resolveAssetPath,
	type GuestOutbound,
} from './hostBridge';

/**
 * RC-WID-1.3 — host API v1, asserted where it can actually be asserted.
 *
 * These are the tests that matter for a sandbox, and they are adversarial on purpose: a frame that
 * pins a host API version this build does not speak, a message that is not ours, a widget asking for
 * the clipboard it was never granted, a widget asking for a capability no review could ever grant, a
 * widget trying to reach the network without the permission, and a package whose entrypoint is not in
 * the package at all. Every one of them has to fail closed, and none of them needs a browser to prove
 * it — which is the reason the protocol lives in a module and not in the component.
 */

const ENTRYPOINT = 'widgets/torch/index.html';

function customPackage(overrides: Partial<WidgetDefinition> = {}): WidgetPackageDefinition {
	const definition: WidgetDefinition = {
		type: 'torchlight',
		version: '1.0.0',
		displayName: 'Torchlight',
		author: 'workspace',
		renderEntrypoint: {
			runtime: 'custom-html-js',
			sandbox: 'iframe',
			assetPath: ENTRYPOINT,
			hostApiVersion: 1,
		},
		style: {
			isolation: 'iframe-document',
			stylesheetAssetPaths: [],
			capabilities: ['css-variables'],
			tokens: [{ name: 'flame', value: '#e0b06f' }],
		},
		supportedProfiles: ['desktop', 'web'],
		defaultSize: { width: 320, height: 200 },
		minSize: { width: 200, height: 120 },
		resizePolicy: 'free',
		requiredBindings: [],
		optionalBindings: [],
		configurationSchema: { type: 'object', additionalProperties: true },
		capabilitySets: ['manager', 'operator', 'viewer'],
		commands: [],
		events: [],
		hostPermissions: [],
		...overrides,
	};
	return {
		id: 'workspace.torchlight',
		version: '1.0.0',
		displayName: 'Torchlight',
		widgets: [definition],
		migrations: [],
		assets: [
			{
				path: ENTRYPOINT,
				kind: 'html',
				entrypoint: true,
				content: [
					'<!doctype html><html><head>',
					'<link rel="stylesheet" href="./styles.css" />',
					'</head><body>',
					'<p data-flame>Unlit</p>',
					'<script src="./main.js"></script>',
					'<script>window.__inline = true;</script>',
					'</body></html>',
				].join(''),
			},
			{ path: 'widgets/torch/styles.css', kind: 'css', content: 'p { color: red; }' },
			{
				path: 'widgets/torch/main.js',
				kind: 'javascript',
				content: 'window.dndtoolsWidget.onRender(function () {});',
			},
		],
		portabilityWarnings: [],
	};
}

function record(
	trust: Partial<WidgetPackageRecord['trust']> = {},
	pkg = customPackage(),
): WidgetPackageRecord {
	const hostPermissions = Object.fromEntries(
		ALL_HOST_PERMISSIONS.map((permission) => [permission, 'denied']),
	) as Record<WidgetHostPermission, 'approved' | 'denied'>;
	return {
		package: pkg,
		trust: { state: 'unreviewed', hostPermissions, reviewedBy: null, reviewedAt: null, ...trust },
		enabled: true,
		removedAt: null,
		installedAt: '2026-09-05T00:00:00.000Z',
		updatedAt: '2026-09-05T00:00:00.000Z',
		revision: 1,
		migrationStatus: { state: 'none', fromVersion: null, toVersion: null, diagnostics: [] },
		diagnostics: [],
	};
}

function guest(kind: string, body: Record<string, unknown> = {}) {
	return { channel: WIDGET_HOST_CHANNEL, hostApiVersion: WIDGET_HOST_API_VERSION, kind, ...body };
}

describe('host API v1: inbound messages', () => {
	it('drops anything that is not this protocol', () => {
		expect(parseGuestMessage(null)).toEqual({ drop: 'not-host-protocol' });
		expect(parseGuestMessage('ready')).toEqual({ drop: 'not-host-protocol' });
		expect(parseGuestMessage({ kind: 'ready' })).toEqual({ drop: 'not-host-protocol' });
		expect(parseGuestMessage({ channel: 'other', kind: 'ready' })).toEqual({
			drop: 'not-host-protocol',
		});
	});

	it('refuses a frame pinned to a host API version this build does not speak', () => {
		expect(
			parseGuestMessage({ channel: WIDGET_HOST_CHANNEL, hostApiVersion: 2, kind: 'ready' }),
		).toEqual({ drop: 'version-mismatch' });
	});

	it('drops an unknown kind rather than guessing at it', () => {
		expect(parseGuestMessage(guest('readVault'))).toEqual({ drop: 'unknown-kind' });
	});

	it('drops a request with no id or no subject', () => {
		expect(parseGuestMessage(guest('dispatch', { commandType: 'x' }))).toEqual({
			drop: 'malformed',
		});
		expect(parseGuestMessage(guest('requestPermission', { requestId: 'r1' }))).toEqual({
			drop: 'malformed',
		});
		expect(parseGuestMessage(guest('resize', { height: 'tall' }))).toEqual({ drop: 'malformed' });
	});

	it('accepts each well-formed kind and normalizes its body', () => {
		expect(parseGuestMessage(guest('ready'))).toEqual({ kind: 'ready', hostApiVersion: 1 });
		expect(
			parseGuestMessage(guest('dispatch', { requestId: 'r1', commandType: 'torch.light' })),
		).toEqual({ kind: 'dispatch', requestId: 'r1', commandType: 'torch.light', payload: {} });
		expect(parseGuestMessage(guest('outbound', { requestId: 'r2' }))).toEqual({
			kind: 'outbound',
			requestId: 'r2',
			url: null,
			destinationClass: null,
			payload: null,
		});
		expect(parseGuestMessage(guest('resize', { height: 118 }))).toEqual({
			kind: 'resize',
			height: 118,
		});
		expect(parseGuestMessage(guest('error', {}))).toEqual({
			kind: 'error',
			message: 'The widget stopped while drawing.',
		});
	});

	it('clamps a reported content height instead of trusting it', () => {
		expect(clampContentHeight(140)).toBe(140);
		expect(clampContentHeight(0)).toBe(24);
		expect(clampContentHeight(9_999_999)).toBe(4000);
		expect(clampContentHeight(Number.NaN)).toBe(24);
	});
});

describe('host API v1: package assembly', () => {
	it('resolves an asset reference against the entrypoint directory', () => {
		expect(resolveAssetPath(ENTRYPOINT, './styles.css')).toBe('widgets/torch/styles.css');
		expect(resolveAssetPath(ENTRYPOINT, '../shared/a.js')).toBe('widgets/shared/a.js');
		expect(resolveAssetPath(ENTRYPOINT, '/root.css')).toBe('root.css');
	});

	it('lifts the body out, inlines the referenced assets, and keeps the inline script', () => {
		const pkg = customPackage();
		const { payload, problem } = assembleWidgetDocument(pkg, pkg.widgets[0]!, {});
		expect(problem).toBeNull();
		expect(payload!.html).toContain('<p data-flame>Unlit</p>');
		// The tags whose contents were collected must not survive: the frame has no network to fetch
		// them over, so a leftover <script src> would be a request that silently fails.
		expect(payload!.html).not.toContain('<script');
		expect(payload!.html).not.toContain('<link');
		expect(payload!.css).toContain('--widget-flame: #e0b06f;');
		expect(payload!.css).toContain('p { color: red; }');
		expect(payload!.scripts.map((script) => script.module)).toEqual([false, false]);
		expect(payload!.scripts[0]!.code).toContain('onRender');
		expect(payload!.scripts[1]!.code).toContain('__inline');
	});

	it('hands a module script its own render export, which the host could not otherwise see', () => {
		const pkg = customPackage();
		pkg.assets[2]!.content = 'export function render() {}';
		const { payload } = assembleWidgetDocument(pkg, pkg.widgets[0]!, {});
		expect(payload!.scripts[0]!.module).toBe(true);
		expect(payload!.scripts[0]!.code).toContain('window.dndtoolsWidget.onRender(render)');
	});

	it('applies a per-instance style token override the same way every other surface does', () => {
		const pkg = customPackage();
		const { payload } = assembleWidgetDocument(pkg, pkg.widgets[0]!, {
			styleTokens: { flame: '#ff0000' },
		});
		expect(payload!.css).toContain('--widget-flame: #ff0000;');
	});

	it('says which part of the package is missing rather than rendering an empty frame', () => {
		const noEntrypoint = customPackage({
			renderEntrypoint: { runtime: 'custom-html-js', hostApiVersion: 1 },
		});
		expect(assembleWidgetDocument(noEntrypoint, noEntrypoint.widgets[0]!, {}).problem).toBe(
			'entrypoint-not-declared',
		);

		const missing = customPackage();
		missing.assets = missing.assets.filter((asset) => asset.path !== ENTRYPOINT);
		expect(assembleWidgetDocument(missing, missing.widgets[0]!, {}).problem).toBe(
			'entrypoint-missing',
		);

		const codeless = customPackage();
		codeless.assets[0]!.content = '<html><body><p>Nothing here</p></body></html>';
		expect(assembleWidgetDocument(codeless, codeless.widgets[0]!, {}).problem).toBe('no-code');
	});
});

describe('host API v1: every answer is the core policy', () => {
	it('refuses clipboard to a package nobody has reviewed — the default state of every install', () => {
		expect(approvedHostPermissions(record())).toEqual([]);
		const answer = decidePermission('w1', 'clipboard', approvedHostPermissions(record()));
		expect(answer.decision).toBe('undeclared');
		expect(answer.reason).toContain('clipboard');
	});

	it('grants clipboard only once a review approved that one permission', () => {
		const reviewed = record({
			state: 'trusted',
			hostPermissions: {
				clipboard: 'approved',
				network: 'denied',
				asset: 'denied',
				'external-link': 'denied',
				'source-adapter': 'denied',
				filesystem: 'denied',
			},
		});
		expect(approvedHostPermissions(reviewed)).toEqual(['clipboard']);
		expect(decidePermission('w1', 'clipboard', approvedHostPermissions(reviewed)).decision).toBe(
			'available',
		);
		expect(decidePermission('w1', 'network', approvedHostPermissions(reviewed)).decision).toBe(
			'undeclared',
		);
	});

	it('refuses the platform surfaces outright, even to a fully-approved package', () => {
		for (const capability of ['raw-vault-file', 'ipc', 'storage-adapter', 'auth-token']) {
			expect(decidePermission('w1', capability, ALL_HOST_PERMISSIONS).decision).toBe('forbidden');
		}
	});

	it('refuses a capability name the catalogue does not know instead of falling through', () => {
		expect(decidePermission('w1', 'readEverything', ALL_HOST_PERMISSIONS).decision).toBe(
			'unknown-capability',
		);
	});

	it('denies outbound network without the permission, whatever destination is named', () => {
		const pkg = customPackage({ networkDestinationClasses: ['widget-declared'] });
		const message: GuestOutbound = {
			kind: 'outbound',
			requestId: 'r1',
			url: 'https://example.test/ping',
			destinationClass: null,
			payload: { hello: true },
		};
		expect(decideOutbound('w1', message, pkg.widgets[0]!, []).decision).toBe('denied');
	});

	it('denies a destination class the package never declared, even with network approved', () => {
		const pkg = customPackage({ networkDestinationClasses: ['widget-declared'] });
		const message: GuestOutbound = {
			kind: 'outbound',
			requestId: 'r1',
			url: 'https://example.test/ping',
			destinationClass: 'analytics',
			payload: {},
		};
		expect(decideOutbound('w1', message, pkg.widgets[0]!, ['network']).decision).toBe('denied');
	});

	it('refuses a destination class the host does not recognise', () => {
		const pkg = customPackage({ networkDestinationClasses: ['widget-declared'] });
		const message: GuestOutbound = {
			kind: 'outbound',
			requestId: 'r1',
			url: null,
			destinationClass: 'anywhere',
			payload: {},
		};
		expect(decideOutbound('w1', message, pkg.widgets[0]!, ['network']).decision).toBe('denied');
	});

	it('never claims a permitted request was sent, because this build has no widget transport', () => {
		const pkg = customPackage({ networkDestinationClasses: ['widget-declared'] });
		const message: GuestOutbound = {
			kind: 'outbound',
			requestId: 'r1',
			url: 'https://example.test/ping',
			destinationClass: 'widget-declared',
			payload: {},
		};
		const answer = decideOutbound('w1', message, pkg.widgets[0]!, ['network']);
		expect(answer.decision).toBe('allowed');
		expect(answer.sent).toBe(false);
		expect(answer.reason).toContain('nothing was sent');
	});

	it('refuses a command the widget definition does not declare', () => {
		const pkg = customPackage();
		expect(decideDispatch(pkg.widgets[0]!, 'torch.light').accepted).toBe(false);

		const declared = customPackage({
			commands: [
				{
					type: 'torch.light',
					displayName: 'Light the torch',
					requiredCapability: 'operator',
					payloadSchema: { type: 'object', additionalProperties: true },
					writesTo: 'scene',
				},
			],
		});
		expect(decideDispatch(declared.widgets[0]!, 'torch.light').accepted).toBe(true);
	});
});

describe('host API v1: theme tokens are forwarded, never inherited', () => {
	const read = (token: string) => `value-for${token}`;

	it('forwards nothing to a package that did not declare the capability', () => {
		const pkg = customPackage();
		expect(collectThemeVariables(pkg.widgets[0]!, read)).toEqual({});
	});

	it('forwards the semantic tokens to a package that did', () => {
		const pkg = customPackage({
			style: { isolation: 'iframe-document', capabilities: ['host-theme-tokens'] },
		});
		const forwarded = collectThemeVariables(pkg.widgets[0]!, read);
		expect(Object.keys(forwarded)).toEqual([...FORWARDED_THEME_TOKENS]);
	});

	it('drops a token the host has no value for rather than blanking the widget with an empty one', () => {
		const pkg = customPackage({
			style: { isolation: 'iframe-document', capabilities: ['host-theme-tokens'] },
		});
		expect(collectThemeVariables(pkg.widgets[0]!, () => '  ')).toEqual({});
	});
});

/**
 * The sandbox's security argument is written down in three places that cannot import each other — the
 * core policy, the served document's own `<meta>`, and the packaged shell's response header. This is
 * the test that they still say the same thing; without it the two copies drift and the frame ends up
 * running under whichever one someone forgot to update.
 */
describe('the sandbox document matches the core baseline', () => {
	const root = process.cwd();
	const document = readFileSync(`${root}/apps/gm-react/public/widget-host.html`, 'utf8');
	const electronMain = readFileSync(`${root}/apps/gm-react/electron/main.cjs`, 'utf8');

	it('builds a frame that passes the core sandbox audit', () => {
		expect(auditSandboxFrame()).toEqual([]);
		expect(WIDGET_SANDBOX_ATTRIBUTE).toBe('allow-scripts');
		expect(WIDGET_SANDBOX_ATTRIBUTE).not.toContain('allow-same-origin');
	});

	it("carries the core's policy verbatim in its own meta tag", () => {
		const meta = /http-equiv="Content-Security-Policy"\s*\n?\s*content="([^"]+)"/.exec(document);
		expect(meta).not.toBeNull();
		expect(meta![1]).toBe(WIDGET_SANDBOX_CSP);
		expect(
			validateWidgetSandboxDocument({
				sandboxTokens: WIDGET_SANDBOX_ATTRIBUTE.split(' '),
				documentSource: 'served-document',
				contentSecurityPolicy: meta![1]!,
			}),
		).toEqual([]);
	});

	it('is served the same policy by the packaged shell, on its own path', () => {
		const declared = /const WIDGET_SANDBOX_CSP = \[([\s\S]*?)\]\.join\('; '\);/.exec(electronMain);
		expect(declared).not.toBeNull();
		const directives = [...declared![1]!.matchAll(/^\s*(['"])(.*?)\1,\s*$/gm)].map(
			(match) => match[2]!,
		);
		expect(directives.join('; ')).toBe(WIDGET_SANDBOX_CSP);
		expect(electronMain).toContain("const WIDGET_SANDBOX_PATH = '/widget-host.html';");
		expect(electronMain).toContain('"frame-src \'self\'"');
	});

	it('reaches for no storage of its own; every capability is a message to the host', () => {
		const script = document.slice(document.indexOf('<script>'));
		expect(script).not.toMatch(/\blocalStorage\b/);
		expect(script).not.toMatch(/\bsessionStorage\b/);
		expect(script).not.toMatch(/\bindexedDB\b/);
		expect(script).not.toMatch(/document\.cookie/);
		expect(script).not.toMatch(/\bfetch\s*\(/);
		expect(script).toContain("parent.postMessage(message, '*')");
	});
});
