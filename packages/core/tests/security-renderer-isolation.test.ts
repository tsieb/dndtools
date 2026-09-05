import { describe, expect, it } from 'vitest';
import {
	FORBIDDEN_RENDERER_IMPORT_PREFIXES,
	PLATFORM_SERVICE_METHODS,
	SECURE_RENDERER_WINDOW_CONFIG,
	auditRendererChannelSurface,
	isForbiddenRendererImport,
	isRendererWindowSecure,
	validateRendererWindowSecurity,
	FORBIDDEN_WIDGET_SANDBOX_TOKENS,
	SECURE_WIDGET_SANDBOX_CONFIG,
	WIDGET_SANDBOX_CSP,
	WIDGET_SANDBOX_CSP_DIRECTIVES,
	WIDGET_SANDBOX_IFRAME_TOKENS,
	isWidgetSandboxSecure,
	validateWidgetSandboxDocument,
	type RendererWindowSecurityConfig,
	type WidgetSandboxDocumentConfig,
} from '../src';

/**
 * SEC-001 — RENDERER ISOLATION. The adversarial proof that a sandboxed renderer cannot reach Node APIs,
 * the filesystem, arbitrary IPC, cloud credentials, or MCP sidecar internals directly, and that a desktop
 * shell that hosts renderer code must satisfy the hardened renderer-window configuration. Every test is
 * adversarial: a shell tries to expose a generic invoke channel (the audit denies it); a shell ships a
 * renderer window with isolation off (the validator rejects it); the forbidden-import catalogue declares
 * exactly what a renderer may never import. The policy fails CLOSED in every case.
 *
 * The MECHANICAL lint-driven half of AC1 — that a renderer module which actually imports node:fs/electron/
 * the MCP SDK fails the boundary lint — is proven in the app package's `renderer-isolation-boundary.test.ts`,
 * where importing the boundary-lint script is in-bounds (it lives outside the core package `rootDir`).
 */

describe('SEC-001 AC1 — the forbidden renderer import catalogue (the single source of truth the lint enforces)', () => {
	it('declares the Node/filesystem/Electron/Capacitor/MCP/cloud surfaces a renderer may never import', () => {
		// The renderer is sandboxed: each of these prefixes is forbidden, and every declared prefix is
		// recognized by the predicate (so the catalogue and the matcher cannot drift).
		for (const prefix of [
			'node:',
			'fs',
			'path',
			'os',
			'electron',
			'@capacitor/',
			'@modelcontextprotocol/sdk',
		]) {
			expect(FORBIDDEN_RENDERER_IMPORT_PREFIXES).toContain(prefix);
		}
		for (const prefix of FORBIDDEN_RENDERER_IMPORT_PREFIXES) {
			const spec = prefix.endsWith('/') ? `${prefix}thing` : prefix;
			expect(isForbiddenRendererImport(spec)).toBe(true);
		}
	});

	it('isForbiddenRendererImport matches namespaced submodules and ignores app-safe specifiers', () => {
		expect(isForbiddenRendererImport('node:crypto')).toBe(true);
		expect(isForbiddenRendererImport('@capacitor/filesystem')).toBe(true);
		expect(isForbiddenRendererImport('@dndtools/core')).toBe(false);
		expect(isForbiddenRendererImport('./local-module')).toBe(false);
	});
});

describe('SEC-001 AC2 — a compromised renderer has no generic IPC invoke channel', () => {
	it('flags a surface that exposes a generic invoke passthrough', () => {
		const violations = auditRendererChannelSurface({
			exposedMethods: [...PLATFORM_SERVICE_METHODS],
			hasGenericInvoke: true,
		});
		expect(violations.some((v) => v.kind === 'generic-invoke-channel')).toBe(true);
	});

	it('flags any renderer-exposed method that is not an allowlisted platform-service method', () => {
		const violations = auditRendererChannelSurface({
			exposedMethods: ['storage.loadCoreState', 'shell.executeArbitraryCommand'],
			hasGenericInvoke: false,
		});
		expect(
			violations.some(
				(v) => v.kind === 'unlisted-method' && v.method === 'shell.executeArbitraryCommand',
			),
		).toBe(true);
	});

	it('a named-only surface restricted to the allowlist passes (the live prototype channel)', () => {
		const violations = auditRendererChannelSurface({
			exposedMethods: [...PLATFORM_SERVICE_METHODS],
			hasGenericInvoke: false,
		});
		expect(violations).toEqual([]);
	});

	it('the only platform-service methods are storage.* named methods (no generic surface exists)', () => {
		expect(PLATFORM_SERVICE_METHODS.length).toBeGreaterThan(0);
		expect(PLATFORM_SERVICE_METHODS.every((method) => method.startsWith('storage.'))).toBe(true);
		expect(PLATFORM_SERVICE_METHODS).not.toContain('invoke');
		expect(PLATFORM_SERVICE_METHODS).not.toContain('send');
	});
});

describe('SEC-001 AC3 — a desktop renderer window must meet the hardened security configuration', () => {
	const secure: RendererWindowSecurityConfig = SECURE_RENDERER_WINDOW_CONFIG;

	it('the secure baseline config passes (contextIsolation/sandbox true, nodeIntegration false, named APIs only)', () => {
		expect(validateRendererWindowSecurity(secure)).toEqual([]);
		expect(isRendererWindowSecure(secure)).toBe(true);
		expect(secure.contextIsolation).toBe(true);
		expect(secure.nodeIntegration).toBe(false);
		expect(secure.sandbox).toBe(true);
	});

	it('rejects a window with contextIsolation disabled', () => {
		const violations = validateRendererWindowSecurity({ ...secure, contextIsolation: false });
		expect(violations.some((v) => v.code === 'context-isolation-disabled')).toBe(true);
		expect(isRendererWindowSecure({ ...secure, contextIsolation: false })).toBe(false);
	});

	it('rejects a window with nodeIntegration enabled', () => {
		const violations = validateRendererWindowSecurity({ ...secure, nodeIntegration: true });
		expect(violations.some((v) => v.code === 'node-integration-enabled')).toBe(true);
	});

	it('rejects a window with the sandbox disabled', () => {
		const violations = validateRendererWindowSecurity({ ...secure, sandbox: false });
		expect(violations.some((v) => v.code === 'sandbox-disabled')).toBe(true);
	});

	it('rejects a preload that exposes a generic invoke channel', () => {
		const violations = validateRendererWindowSecurity({
			...secure,
			preloadExposesGenericInvoke: true,
		});
		expect(violations.some((v) => v.code === 'preload-generic-invoke')).toBe(true);
	});

	it('rejects a preload that exposes an API outside the platform-service allowlist', () => {
		const violations = validateRendererWindowSecurity({
			...secure,
			preloadExposedApis: ['storage.loadCoreState', 'native.spawnShell'],
		});
		expect(violations.some((v) => v.code === 'preload-unlisted-api')).toBe(true);
	});

	it('reports EVERY breached invariant at once (a fully-insecure window yields all five codes)', () => {
		const violations = validateRendererWindowSecurity({
			contextIsolation: false,
			nodeIntegration: true,
			sandbox: false,
			preloadExposesGenericInvoke: true,
			preloadExposedApis: ['native.spawnShell'],
		});
		const codes = new Set(violations.map((v) => v.code));
		expect(codes).toEqual(
			new Set([
				'context-isolation-disabled',
				'node-integration-enabled',
				'sandbox-disabled',
				'preload-generic-invoke',
				'preload-unlisted-api',
			]),
		);
	});
});

/**
 * SEC-001 (RC-WID-1.3) — the OTHER renderer: the sandbox document a `custom-html-js` widget runs in
 * (ADR-031 §1). Same adversarial shape as the desktop-window suite above. A host tries to hand the
 * frame its origin back; a host builds the frame from `srcdoc` so it silently inherits the app's
 * policy; a host lets the frame reach the network directly, or adds `'unsafe-eval'` so a package can
 * assemble code its trust review never saw. Every one of them is a violation, and the baseline the host
 * is supposed to build from passes.
 */
describe('SEC-001 — custom-widget sandbox document', () => {
	function config(
		overrides: Partial<WidgetSandboxDocumentConfig> = {},
	): WidgetSandboxDocumentConfig {
		return { ...SECURE_WIDGET_SANDBOX_CONFIG, ...overrides };
	}

	it('accepts the declared baseline the host builds its frame from', () => {
		expect(validateWidgetSandboxDocument(SECURE_WIDGET_SANDBOX_CONFIG)).toEqual([]);
		expect(isWidgetSandboxSecure(SECURE_WIDGET_SANDBOX_CONFIG)).toBe(true);
		expect(WIDGET_SANDBOX_IFRAME_TOKENS).toEqual(['allow-scripts']);
	});

	it('rejects allow-same-origin, which would hand the host origin back to widget code', () => {
		const violations = validateWidgetSandboxDocument(
			config({ sandboxTokens: ['allow-scripts', 'allow-same-origin'] }),
		);
		expect(violations.map((v) => v.code)).toEqual(['sandbox-forbidden-token']);
		expect(violations[0]!.subject).toBe('allow-same-origin');
		expect(
			isWidgetSandboxSecure(config({ sandboxTokens: ['allow-scripts', 'allow-same-origin'] })),
		).toBe(false);
	});

	it('rejects every other capability-returning sandbox token', () => {
		for (const token of FORBIDDEN_WIDGET_SANDBOX_TOKENS) {
			const violations = validateWidgetSandboxDocument(
				config({ sandboxTokens: ['allow-scripts', token] }),
			);
			expect(violations.map((v) => v.subject)).toContain(token);
		}
	});

	it('rejects a frame with no allow-scripts: nothing could run in it', () => {
		const violations = validateWidgetSandboxDocument(config({ sandboxTokens: [] }));
		expect(violations.map((v) => v.code)).toEqual(['sandbox-missing-allow-scripts']);
	});

	it('rejects a srcdoc/blob/data document, which inherits the embedder policy instead of stating one', () => {
		for (const source of ['srcdoc', 'blob', 'data'] as const) {
			const violations = validateWidgetSandboxDocument(config({ documentSource: source }));
			expect(violations.map((v) => v.code)).toEqual(['sandbox-document-inherits-host-policy']);
			expect(violations[0]!.subject).toBe(source);
		}
	});

	it('rejects a policy that lets the frame reach the network itself', () => {
		const policy = WIDGET_SANDBOX_CSP.replace("connect-src 'none'", 'connect-src https:');
		const violations = validateWidgetSandboxDocument(config({ contentSecurityPolicy: policy }));
		expect(violations.map((v) => v.code)).toEqual(['sandbox-csp-weakened-directive']);
		expect(violations[0]!.subject).toBe('connect-src');
	});

	it("rejects a policy that adds 'unsafe-eval' to the sandbox", () => {
		const policy = WIDGET_SANDBOX_CSP.replace(
			"script-src 'unsafe-inline'",
			"script-src 'unsafe-inline' 'unsafe-eval'",
		);
		const violations = validateWidgetSandboxDocument(config({ contentSecurityPolicy: policy }));
		expect(violations.map((v) => v.subject)).toEqual(['script-src']);
	});

	it('names every missing directive rather than only the first', () => {
		const violations = validateWidgetSandboxDocument(
			config({ contentSecurityPolicy: "default-src 'none'" }),
		);
		const missing = violations.filter((v) => v.code === 'sandbox-csp-missing-directive');
		expect(missing.map((v) => v.subject).sort()).toEqual(
			Object.keys(WIDGET_SANDBOX_CSP_DIRECTIVES)
				.filter((directive) => directive !== 'default-src')
				.sort(),
		);
	});

	it("never states a directive as 'self', which an opaque origin can never match", () => {
		expect(WIDGET_SANDBOX_CSP).not.toContain("'self'");
	});

	it('reports every breached invariant at once for a thoroughly unsafe frame', () => {
		const codes = new Set(
			validateWidgetSandboxDocument({
				sandboxTokens: ['allow-same-origin', 'allow-popups'],
				documentSource: 'srcdoc',
				contentSecurityPolicy: "default-src *; script-src 'unsafe-inline' 'unsafe-eval'",
			}).map((v) => v.code),
		);
		expect(codes).toEqual(
			new Set([
				'sandbox-missing-allow-scripts',
				'sandbox-forbidden-token',
				'sandbox-document-inherits-host-policy',
				'sandbox-csp-missing-directive',
				'sandbox-csp-weakened-directive',
			]),
		);
	});
});
