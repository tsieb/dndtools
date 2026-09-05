import { PLATFORM_SERVICE_METHODS, isPlatformServiceMethod } from '../platform/service-boundary';

/**
 * SEC-001 — RENDERER ISOLATION. The pure, fail-closed Processing-Core policy that DECLARES what the
 * renderer is forbidden to reach and VALIDATES the trust-boundary configuration a shell must satisfy
 * before it may host renderer code (Security trust boundaries; Architecture Contract 1 layers).
 *
 * It COMPOSES the existing infrastructure rather than inventing a parallel framework:
 *   - the boundary-lint (`scripts/boundary-lint.ts`) MECHANICALLY rejects a renderer/core module that
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
				message:
					'Preload must not expose a generic invoke/send channel; expose only explicit named APIs.',
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

// --- SEC-001 (RC-WID-1.3): the custom-widget sandbox document -----------------------------------------

/**
 * The SAME isolation question, asked about the other renderer this product hosts: a `custom-html-js`
 * widget's sandbox document (ADR-031 §1). The Electron renderer above is first-party code that must be
 * kept away from Node; the widget sandbox is THIRD-PARTY code that must be kept away from everything,
 * so the two share a shape — plain data in, one violation per breached invariant out, fail closed —
 * and nothing else.
 *
 * The whole security argument is two facts about the frame, and this policy is where they are written
 * down once so the host attribute, the served document's own policy and the packaged shell's response
 * header can all be checked against the same statement rather than against each other:
 *
 *   1. `sandbox="allow-scripts"` WITHOUT `allow-same-origin`. The pair together would hand the frame the
 *      host's origin back, and with it the host's cookies, storage and DOM. `allow-same-origin` is never
 *      granted, for any package, at any trust level — so it is a violation outright rather than a setting.
 *   2. The document is SERVED, not `srcdoc`/`blob:`/`data:`. A document with one of those local schemes
 *      INHERITS the embedder's Content-Security-Policy, which couples the sandbox to the host's policy in
 *      both directions: the host's `script-src 'self'` would silently refuse to run the widget, and a
 *      later relaxation of the host policy would silently widen the sandbox. A served document carries
 *      its own policy and is therefore checkable — which is what this function does.
 *
 * The frame's policy then has to do the rest of the work, because an opaque origin can still reach the
 * network: `connect-src 'none'` is what forces every outbound attempt back through the host's `outbound`
 * message and the SEC-011 gate, and `'unsafe-eval'` stays out so a package cannot assemble code the
 * review never saw. Inline script and style ARE allowed: the package's own code and stylesheet are
 * injected into the document, an opaque origin can never match `'self'`, and both are already inside the
 * boundary this policy establishes.
 *
 * Pure + deterministic over plain data — no DOM, no fetch, no clock. The host builds its frame FROM
 * {@link WIDGET_SANDBOX_IFRAME_TOKENS} and {@link WIDGET_SANDBOX_CSP} rather than hand-rolling them.
 */

/** The sandbox attribute tokens the widget frame is created with. Scripts, and nothing else. */
export const WIDGET_SANDBOX_IFRAME_TOKENS: readonly string[] = Object.freeze(['allow-scripts']);

/**
 * Sandbox tokens that hand capability BACK to the frame. `allow-same-origin` is the one that defeats the
 * boundary outright; the rest let a frame navigate the top window, open windows, take pointer lock or
 * start downloads — none of which a widget in a scene slot has any business doing.
 */
export const FORBIDDEN_WIDGET_SANDBOX_TOKENS: readonly string[] = Object.freeze([
	'allow-same-origin',
	'allow-top-navigation',
	'allow-top-navigation-by-user-activation',
	'allow-top-navigation-to-custom-protocols',
	'allow-popups',
	'allow-popups-to-escape-sandbox',
	'allow-modals',
	'allow-downloads',
	'allow-pointer-lock',
	'allow-presentation',
	'allow-orientation-lock',
	'allow-storage-access-by-user-activation',
]);

/**
 * The Content-Security-Policy the sandbox document must carry, directive by directive. `'self'` never
 * appears: the document's origin is opaque, so `'self'` matches nothing and would only read as a
 * permission that is not one.
 */
export const WIDGET_SANDBOX_CSP_DIRECTIVES: Readonly<Record<string, string>> = Object.freeze({
	'default-src': "'none'",
	// The host injects the package's code and stylesheet inline; an opaque origin cannot match 'self'.
	'script-src': "'unsafe-inline'",
	'style-src': "'unsafe-inline'",
	'img-src': 'data:',
	'font-src': 'data:',
	// The frame reaches the network only by asking the host, which runs the SEC-011 outbound gate.
	'connect-src': "'none'",
	'object-src': "'none'",
	'base-uri': "'none'",
	'form-action': "'none'",
});

/** The serialized policy. The served document and the packaged shell's response header both use it. */
export const WIDGET_SANDBOX_CSP: string = Object.entries(WIDGET_SANDBOX_CSP_DIRECTIVES)
	.map(([directive, value]) => `${directive} ${value}`)
	.join('; ');

/** How the sandbox document was delivered. Only a served document carries its own policy. */
export type WidgetSandboxDocumentSource = 'served-document' | 'srcdoc' | 'blob' | 'data';

export interface WidgetSandboxDocumentConfig {
	/** The tokens on the frame's `sandbox` attribute. */
	sandboxTokens: readonly string[];
	/** How the document reached the frame. */
	documentSource: WidgetSandboxDocumentSource;
	/** The document's own Content-Security-Policy, as served (header or `<meta http-equiv>`). */
	contentSecurityPolicy: string;
}

export type WidgetSandboxViolationCode =
	| 'sandbox-missing-allow-scripts'
	| 'sandbox-forbidden-token'
	| 'sandbox-document-inherits-host-policy'
	| 'sandbox-csp-missing-directive'
	| 'sandbox-csp-weakened-directive';

export interface WidgetSandboxViolation {
	code: WidgetSandboxViolationCode;
	/** The offending token or directive, so a report names the thing to fix. */
	subject: string;
	message: string;
}

/** Parse a CSP string into directive → value. Unknown/duplicate directives keep the FIRST value, as UAs do. */
function parseCsp(policy: string): Map<string, string> {
	const directives = new Map<string, string>();
	for (const segment of policy.split(';')) {
		const trimmed = segment.trim();
		if (trimmed === '') continue;
		const space = trimmed.indexOf(' ');
		const name = (space === -1 ? trimmed : trimmed.slice(0, space)).toLowerCase();
		const value = space === -1 ? '' : trimmed.slice(space + 1).trim();
		if (!directives.has(name)) directives.set(name, value);
	}
	return directives;
}

/**
 * Validate a custom-widget sandbox document fail-closed. Returns one violation per breached invariant
 * (empty ⇒ the frame matches the declared baseline). Every gate is independent so a security check
 * reports EVERY problem at once, the way {@link validateRendererWindowSecurity} does.
 */
export function validateWidgetSandboxDocument(
	config: WidgetSandboxDocumentConfig,
): WidgetSandboxViolation[] {
	const violations: WidgetSandboxViolation[] = [];
	const tokens = config.sandboxTokens.map((token) => token.trim().toLowerCase()).filter(Boolean);

	if (!tokens.includes('allow-scripts')) {
		violations.push({
			code: 'sandbox-missing-allow-scripts',
			subject: 'allow-scripts',
			message:
				'The widget sandbox needs allow-scripts; without it no custom widget can run at all.',
		});
	}
	for (const token of tokens) {
		if (FORBIDDEN_WIDGET_SANDBOX_TOKENS.includes(token)) {
			violations.push({
				code: 'sandbox-forbidden-token',
				subject: token,
				message:
					token === 'allow-same-origin'
						? 'allow-same-origin returns the host origin to the frame, with its storage and DOM; it is never granted.'
						: `Sandbox token "${token}" hands capability back to an untrusted frame.`,
			});
		}
	}

	if (config.documentSource !== 'served-document') {
		violations.push({
			code: 'sandbox-document-inherits-host-policy',
			subject: config.documentSource,
			message: `A ${config.documentSource} document inherits the embedder's Content-Security-Policy instead of carrying its own; serve the sandbox document so its policy can be stated and checked.`,
		});
	}

	const declared = parseCsp(config.contentSecurityPolicy);
	for (const [directive, required] of Object.entries(WIDGET_SANDBOX_CSP_DIRECTIVES)) {
		const value = declared.get(directive);
		if (value === undefined) {
			violations.push({
				code: 'sandbox-csp-missing-directive',
				subject: directive,
				message: `The sandbox document's policy must declare ${directive} ${required}.`,
			});
			continue;
		}
		if (value !== required) {
			violations.push({
				code: 'sandbox-csp-weakened-directive',
				subject: directive,
				message: `The sandbox document declares ${directive} ${value}; the policy requires ${required}.`,
			});
		}
	}
	return violations;
}

/** Whether a sandbox document configuration meets the baseline (no violations). */
export function isWidgetSandboxSecure(config: WidgetSandboxDocumentConfig): boolean {
	return validateWidgetSandboxDocument(config).length === 0;
}

/** The baseline a host should build its frame from, rather than hand-rolling the attribute and policy. */
export const SECURE_WIDGET_SANDBOX_CONFIG: WidgetSandboxDocumentConfig = Object.freeze({
	sandboxTokens: WIDGET_SANDBOX_IFRAME_TOKENS,
	documentSource: 'served-document',
	contentSecurityPolicy: WIDGET_SANDBOX_CSP,
});
