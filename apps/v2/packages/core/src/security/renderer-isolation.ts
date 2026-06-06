import { PLATFORM_SERVICE_METHODS, isPlatformServiceMethod } from '../platform/service-boundary';

/**
 * SEC-001 — RENDERER ISOLATION. The pure, fail-closed Processing-Core policy that DECLARES what the
 * renderer is forbidden to reach and VALIDATES the trust-boundary configuration a shell must satisfy
 * before it may host renderer code (Security trust boundaries; Architecture Contract 1 layers).
 *
 * It COMPOSES the existing infrastructure rather than inventing a parallel framework:
 *   - the boundary-lint (`scripts/v2-boundary-lint.ts`) MECHANICALLY rejects a renderer/core module that
 *     imports a filesystem/Electron/Node API — this module declares the SAME forbidden surfaces as the
 *     single source of truth the lint and the SEC-001 regression test both cross-check (AC1);
 *   - the named-method platform-service allowlist (`PLATFORM_SERVICE_METHODS` / `isPlatformServiceMethod`)
 *     is the ONLY channel across the GUI→Platform boundary — there is no generic `invoke(channel, …)`
 *     surface — and this module proves that property fail-closed (AC2);
 *   - the desktop renderer-window security CONTRACT (`contextIsolation` true, `nodeIntegration` false,
 *     `sandbox` true, preload exposes only explicit named APIs) is validated here so a release security
 *     check can reject a misconfigured shell BEFORE it ships, even though ADR-014 defers the Electron
 *     shell itself (AC3). The policy is the gate; the shell is the future caller.
 *
 * Pure + deterministic over plain data — no DOM/storage/clock/entropy/network. The renderer-window
 * config is plain data a shell hands in; the policy never depends on the shell never regressing.
 */

export const RENDERER_ISOLATION_SCHEMA_VERSION = 1 as const;

// --- AC1: the forbidden renderer surfaces (single source of truth) ----------------------------------

/**
 * The module-specifier PREFIXES a renderer / Processing-Core module is forbidden to import. A renderer is
 * sandboxed: it may not reach Node APIs, the filesystem, the Electron/Capacitor native bridges, the MCP
 * sidecar SDK, or the cloud SDKs directly (SEC-001 statement). This is the declared catalogue the
 * boundary-lint enforces mechanically; the SEC-001 regression test asserts the lint's `CORE_FORBIDDEN_PREFIXES`
 * is a SUPERSET of this list so the two can never silently diverge.
 */
export const FORBIDDEN_RENDERER_IMPORT_PREFIXES: readonly string[] = Object.freeze([
	'node:', // any Node builtin namespace
	'fs', // filesystem
	'path', // filesystem path math
	'os', // OS/native info
	'electron', // the Electron main/IPC bridge
	'@capacitor/', // the Capacitor native bridge
	'@modelcontextprotocol/sdk', // the MCP sidecar SDK
	'dexie', // the storage adapter implementation (a Platform Service, not renderer code)
] as const);

/** Whether a module specifier is a forbidden renderer import (prefix match), per the declared catalogue. */
export function isForbiddenRendererImport(specifier: string): boolean {
	return FORBIDDEN_RENDERER_IMPORT_PREFIXES.some(
		(prefix) => specifier === prefix || specifier.startsWith(prefix),
	);
}

// --- AC2: there is no generic IPC invoke channel ----------------------------------------------------

/**
 * The shape a generic-invoke audit checks: a shell exposing a channel to the renderer must expose ONLY the
 * named, allowlisted platform-service methods — never a wildcard `invoke(channel, …)` / `send(channel, …)`
 * surface a compromised renderer could drive to call arbitrary main-process handlers (SEC-001 AC2).
 */
export interface RendererChannelSurface {
	/** The method names the shell exposes to the renderer (e.g. preload-bridge keys). */
	exposedMethods: readonly string[];
	/** True when the shell exposes a generic `invoke`/`send`/`sendSync`/`postMessage`-style passthrough. */
	hasGenericInvoke: boolean;
}

export type RendererChannelViolationKind = 'generic-invoke-channel' | 'unlisted-method';

export interface RendererChannelViolation {
	kind: RendererChannelViolationKind;
	/** The offending method name, or `(generic-invoke)` for a wildcard passthrough. */
	method: string;
	message: string;
}

/**
 * SEC-001 AC2 — prove a renderer-facing channel surface exposes NO generic invoke and ONLY allowlisted
 * named methods. Fail closed: a generic passthrough is a violation outright, and every exposed method must
 * be a registered platform-service method (`isPlatformServiceMethod`). Returns one violation per problem
 * (empty ⇒ the surface is a clean, named-only bridge). Pure: a function of the surface alone.
 *
 * This is the policy a release security check runs against a preload bridge's exposed key set; the live
 * prototype's only such surface is the `PLATFORM_SERVICE_METHODS` registry, which this trivially passes.
 */
export function auditRendererChannelSurface(
	surface: RendererChannelSurface,
): RendererChannelViolation[] {
	const violations: RendererChannelViolation[] = [];
	if (surface.hasGenericInvoke) {
		violations.push({
			kind: 'generic-invoke-channel',
			method: '(generic-invoke)',
			message:
				'A generic invoke/send channel lets a compromised renderer call arbitrary handlers; expose only named, allowlisted platform-service methods.',
		});
	}
	for (const method of surface.exposedMethods) {
		if (!isPlatformServiceMethod(method)) {
			violations.push({
				kind: 'unlisted-method',
				method,
				message: `Renderer-exposed method "${method}" is not an allowlisted platform-service method.`,
			});
		}
	}
	return violations;
}

/** The allowlisted platform-service methods — the ONLY channel exposed to the renderer (re-exported here). */
export { PLATFORM_SERVICE_METHODS };

// --- AC3: desktop renderer-window security configuration --------------------------------------------

/**
 * The security-relevant configuration of a desktop (Electron) renderer window, as plain data a shell hands
 * to a release security check. The product contract (SEC-001 AC3) requires:
 *   - `contextIsolation` true  — the preload + renderer worlds are isolated;
 *   - `nodeIntegration` false  — the renderer has no Node globals;
 *   - `sandbox` true           — the renderer runs in an OS sandbox;
 *   - the preload exposes ONLY explicit named APIs (no `*`, no generic invoke).
 */
export interface RendererWindowSecurityConfig {
	contextIsolation: boolean;
	nodeIntegration: boolean;
	sandbox: boolean;
	/** Whether the preload registers a generic invoke/send passthrough (must be false). */
	preloadExposesGenericInvoke: boolean;
	/** The explicit named APIs the preload exposes to the renderer (each must be an allowlisted method). */
	preloadExposedApis: readonly string[];
}

export type RendererWindowViolationCode =
	| 'context-isolation-disabled'
	| 'node-integration-enabled'
	| 'sandbox-disabled'
	| 'preload-generic-invoke'
	| 'preload-unlisted-api';

export interface RendererWindowViolation {
	code: RendererWindowViolationCode;
	message: string;
}

/**
 * SEC-001 AC3 — validate a desktop renderer-window security configuration fail-closed. Returns one
 * violation per breached invariant (empty ⇒ the window is configured to the required hardened baseline).
 * Each gate is independent so a release security check reports EVERY problem at once, not just the first.
 * The preload-API check composes {@link auditRendererChannelSurface} so the "explicit named APIs only"
 * rule is the SAME allowlist the live boundary uses. Pure: a function of the config alone.
 */
export function validateRendererWindowSecurity(
	config: RendererWindowSecurityConfig,
): RendererWindowViolation[] {
	const violations: RendererWindowViolation[] = [];
	if (!config.contextIsolation) {
		violations.push({
			code: 'context-isolation-disabled',
			message: 'Renderer window must set contextIsolation: true.',
		});
	}
	if (config.nodeIntegration) {
		violations.push({
			code: 'node-integration-enabled',
			message: 'Renderer window must set nodeIntegration: false.',
		});
	}
	if (!config.sandbox) {
		violations.push({
			code: 'sandbox-disabled',
			message: 'Renderer window must set sandbox: true.',
		});
	}
	const channelViolations = auditRendererChannelSurface({
		exposedMethods: config.preloadExposedApis,
		hasGenericInvoke: config.preloadExposesGenericInvoke,
	});
	for (const channel of channelViolations) {
		if (channel.kind === 'generic-invoke-channel') {
			violations.push({
				code: 'preload-generic-invoke',
				message: 'Preload must not expose a generic invoke/send channel; expose only explicit named APIs.',
			});
		} else {
			violations.push({
				code: 'preload-unlisted-api',
				message: `Preload-exposed API "${channel.method}" is not an allowlisted platform-service method.`,
			});
		}
	}
	return violations;
}

/** Whether a renderer-window configuration meets the SEC-001 AC3 hardened baseline (no violations). */
export function isRendererWindowSecure(config: RendererWindowSecurityConfig): boolean {
	return validateRendererWindowSecurity(config).length === 0;
}

/**
 * The hardened renderer-window baseline a shell should start from (SEC-001 AC3). A shell may add more named
 * APIs to `preloadExposedApis` (each still validated against the allowlist), but may not weaken the booleans.
 * Provided so a shell never hand-rolls the secure defaults — it derives them from the policy.
 */
export const SECURE_RENDERER_WINDOW_CONFIG: RendererWindowSecurityConfig = Object.freeze({
	contextIsolation: true,
	nodeIntegration: false,
	sandbox: true,
	preloadExposesGenericInvoke: false,
	preloadExposedApis: PLATFORM_SERVICE_METHODS,
});
