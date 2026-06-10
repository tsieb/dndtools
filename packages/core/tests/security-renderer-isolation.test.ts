import { describe, expect, it } from 'vitest';
import {
	FORBIDDEN_RENDERER_IMPORT_PREFIXES,
	PLATFORM_SERVICE_METHODS,
	SECURE_RENDERER_WINDOW_CONFIG,
	auditRendererChannelSurface,
	isForbiddenRendererImport,
	isRendererWindowSecure,
	validateRendererWindowSecurity,
	type RendererWindowSecurityConfig,
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
		for (const prefix of ['node:', 'fs', 'path', 'os', 'electron', '@capacitor/', '@modelcontextprotocol/sdk']) {
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
		expect(violations.some((v) => v.kind === 'unlisted-method' && v.method === 'shell.executeArbitraryCommand')).toBe(
			true,
		);
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
		const violations = validateRendererWindowSecurity({ ...secure, preloadExposesGenericInvoke: true });
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
