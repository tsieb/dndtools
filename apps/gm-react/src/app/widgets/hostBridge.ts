import {
	WIDGET_SANDBOX_CSP,
	WIDGET_SANDBOX_IFRAME_TOKENS,
	isolateWidgetFailure,
	requestWidgetNetwork,
	resolveHostCapability,
	resolveWidgetStyleVariables,
	validateWidgetSandboxDocument,
	type WidgetDefinition,
	type WidgetDestinationClass,
	type WidgetHostCapability,
	type WidgetHostPermission,
	type WidgetIsolationResult,
	type WidgetPackageAsset,
	type WidgetPackageDefinition,
	type WidgetPackageRecord,
	type WidgetOutboundResult,
} from '@dndtools/core';

/**
 * hostBridge — host API v1, as a pure module (RC-WID-1.3, ADR-031 §1).
 *
 * Everything the sandbox host does that is not "put an iframe on the screen" lives here: what a
 * package's assets turn into, which inbound messages are real, and what each of them is answered
 * with. Splitting it out is not tidiness — it is the only way the protocol is testable. A sandbox
 * escape is a thing you want to assert about a function, not about a component that needs a DOM, a
 * runtime and a frame that has finished loading before it will tell you anything.
 *
 * The rule that shapes every function below: **the core decides, the host relays.** `requestPermission`
 * calls `resolveHostCapability`, `outbound` calls `requestWidgetNetwork`, a failing frame goes through
 * `isolateWidgetFailure`, and the frame's own configuration is checked against
 * `validateWidgetSandboxDocument`. Nothing here re-implements a policy, so there is no second one to
 * drift from the first — which matters more than usual, because the thing on the other side of this
 * boundary is code the DM installed and nobody at this end has read.
 */

/** Every message in either direction carries this, so a stray `postMessage` is not mistaken for one. */
export const WIDGET_HOST_CHANNEL = 'dndtools.widget-host';

/** Host API v1. A package pinned above this is refused rather than rendered optimistically. */
export const WIDGET_HOST_API_VERSION = 1;

/** The served sandbox document (`public/widget-host.html`), resolved against the app's base URL. */
export const WIDGET_SANDBOX_DOCUMENT = 'widget-host.html';

/** The frame's `sandbox` attribute, from the core baseline rather than hand-written here. */
export const WIDGET_SANDBOX_ATTRIBUTE = WIDGET_SANDBOX_IFRAME_TOKENS.join(' ');

/** Content height is reported by the guest and clamped here; a frame does not get to be any size it likes. */
export const MIN_CONTENT_HEIGHT = 24;
export const MAX_CONTENT_HEIGHT = 4000;

/** How long a frame gets to say `ready` before the host gives up on it and shows the placeholder. */
export const READY_TIMEOUT_MS = 8000;

// --- Messages ---------------------------------------------------------------------------------------

export interface GuestReady {
	kind: 'ready';
	hostApiVersion: number;
}
export interface GuestDispatch {
	kind: 'dispatch';
	requestId: string;
	commandType: string;
	payload: Record<string, unknown>;
}
export interface GuestRequestPermission {
	kind: 'requestPermission';
	requestId: string;
	capability: string;
}
export interface GuestOutbound {
	kind: 'outbound';
	requestId: string;
	url: string | null;
	destinationClass: string | null;
	payload: unknown;
}
export interface GuestResize {
	kind: 'resize';
	height: number;
}
export interface GuestError {
	kind: 'error';
	message: string;
}

export type GuestMessage =
	| GuestReady
	| GuestDispatch
	| GuestRequestPermission
	| GuestOutbound
	| GuestResize
	| GuestError;

/** Why an inbound message was dropped. Dropped messages are audited, never guessed at (ADR-031 rule 3). */
export type GuestMessageDrop =
	| 'not-host-protocol'
	| 'unknown-kind'
	| 'malformed'
	| 'version-mismatch';

/**
 * Validate one inbound message. Fail closed: anything that is not exactly a v1 message of a known kind
 * is dropped with a reason. Frame ATTRIBUTION (is this our iframe?) is the host's job — it compares
 * `event.source` with its own `contentWindow`, which this module cannot see.
 */
export function parseGuestMessage(data: unknown): GuestMessage | { drop: GuestMessageDrop } {
	if (typeof data !== 'object' || data === null) return { drop: 'not-host-protocol' };
	const raw = data as Record<string, unknown>;
	if (raw.channel !== WIDGET_HOST_CHANNEL) return { drop: 'not-host-protocol' };
	if (raw.hostApiVersion !== WIDGET_HOST_API_VERSION) return { drop: 'version-mismatch' };

	const requestId = typeof raw.requestId === 'string' ? raw.requestId : null;
	switch (raw.kind) {
		case 'ready':
			return { kind: 'ready', hostApiVersion: WIDGET_HOST_API_VERSION };
		case 'dispatch':
			if (!requestId || typeof raw.commandType !== 'string') return { drop: 'malformed' };
			return {
				kind: 'dispatch',
				requestId,
				commandType: raw.commandType,
				payload:
					typeof raw.payload === 'object' && raw.payload !== null
						? (raw.payload as Record<string, unknown>)
						: {},
			};
		case 'requestPermission':
			if (!requestId || typeof raw.capability !== 'string') return { drop: 'malformed' };
			return { kind: 'requestPermission', requestId, capability: raw.capability };
		case 'outbound':
			if (!requestId) return { drop: 'malformed' };
			return {
				kind: 'outbound',
				requestId,
				url: typeof raw.url === 'string' ? raw.url : null,
				destinationClass: typeof raw.destinationClass === 'string' ? raw.destinationClass : null,
				payload: raw.payload ?? null,
			};
		case 'resize':
			if (typeof raw.height !== 'number' || !Number.isFinite(raw.height))
				return { drop: 'malformed' };
			return { kind: 'resize', height: raw.height };
		case 'error':
			return {
				kind: 'error',
				message:
					typeof raw.message === 'string' ? raw.message : 'The widget stopped while drawing.',
			};
		default:
			return { drop: 'unknown-kind' };
	}
}

/** Clamp a guest-reported content height. A widget cannot make itself invisible or unbounded. */
export function clampContentHeight(height: number): number {
	if (!Number.isFinite(height)) return MIN_CONTENT_HEIGHT;
	return Math.min(MAX_CONTENT_HEIGHT, Math.max(MIN_CONTENT_HEIGHT, Math.round(height)));
}

// --- Assets: what actually goes into the frame -------------------------------------------------------

export interface WidgetSandboxScript {
	code: string;
	/** Injected as `type="module"`, with the export shim below appended. */
	module: boolean;
}

export interface WidgetSandboxDocumentPayload {
	html: string;
	css: string | null;
	scripts: WidgetSandboxScript[];
}

export type WidgetAssemblyProblem = 'entrypoint-not-declared' | 'entrypoint-missing' | 'no-code';

export interface WidgetAssemblyResult {
	payload: WidgetSandboxDocumentPayload | null;
	/** The first problem, in the DM's words, or null when the package assembled cleanly. */
	problem: WidgetAssemblyProblem | null;
}

/** Copy for an assembly problem. Sentence case, says what is missing, promises nothing was lost. */
export const ASSEMBLY_COPY: Record<WidgetAssemblyProblem, string> = {
	'entrypoint-not-declared': 'This widget package does not name a page to run.',
	'entrypoint-missing': 'The page this widget package names is not in the package.',
	'no-code': 'This widget package ships no code to run.',
};

/**
 * A module script declares its render function with `export function render`, which is module-scoped
 * and invisible to the host. Appending this line inside the SAME module hands it over, so a package
 * written either way (callback registration or a plain export) works without the author guessing.
 */
const MODULE_EXPORT_SHIM =
	'\n;try { if (typeof render === "function") window.dndtoolsWidget.onRender(render); } catch (e) { /* no render export */ }\n';

/** Normalize `widgets/x/index.html` + `./styles.css` into `widgets/x/styles.css`. */
export function resolveAssetPath(fromPath: string, reference: string): string {
	const trimmed = reference.trim().replace(/^\.\//, '');
	if (trimmed.startsWith('/')) return trimmed.slice(1);
	const segments = fromPath.split('/').slice(0, -1);
	for (const part of trimmed.split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') segments.pop();
		else segments.push(part);
	}
	return segments.join('/');
}

function assetText(asset: WidgetPackageAsset | undefined): string | null {
	if (!asset || typeof asset.content !== 'string') return null;
	if (asset.contentEncoding !== 'base64') return asset.content;
	// A base64 asset is decoded with the platform's own decoder; there is no vault or storage here.
	if (typeof atob !== 'function') return null;
	try {
		return atob(asset.content);
	} catch {
		return null;
	}
}

function findAsset(pkg: WidgetPackageDefinition, path: string): WidgetPackageAsset | undefined {
	return pkg.assets.find((asset) => asset.path === path);
}

/** Strip the tags whose contents we have already collected, so they are not re-fetched in the frame. */
const LINK_TAG = /<link\b[^>]*>/gi;
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const BODY_INNER = /<body\b[^>]*>([\s\S]*?)<\/body>/i;
const HREF_ATTRIBUTE = /\bhref\s*=\s*["']([^"']+)["']/i;
const SRC_ATTRIBUTE = /\bsrc\s*=\s*["']([^"']+)["']/i;
const TYPE_MODULE = /\btype\s*=\s*["']module["']/i;
const ESM_SYNTAX = /^\s*(?:export|import)\s/m;

/**
 * Turn a package into the three things the sandbox document installs: markup, one stylesheet, and the
 * scripts, in declaration order.
 *
 * The package ships a whole HTML document (that is what `scaffoldCustomWidgetPackageDraft` writes), but
 * the frame already HAS a document — one with a policy that has been checked. So the entrypoint's body
 * is lifted out and its asset references are resolved against the package rather than the network:
 * `<link rel=stylesheet href="./styles.css">` becomes the package's `styles.css` inlined, and
 * `<script src="./main.js">` becomes its code injected. Inline scripts are collected too, because
 * markup is installed with `innerHTML`, which does not run them — a package that put its logic there
 * would otherwise render a page that quietly does nothing.
 *
 * Nothing is sanitized on the way through, and nothing needs to be: the destination is an opaque origin
 * with `default-src 'none'` and no network, which is the whole reason the frame exists.
 */
export function assembleWidgetDocument(
	pkg: WidgetPackageDefinition,
	definition: WidgetDefinition,
	configuration?: Record<string, unknown> | null,
): WidgetAssemblyResult {
	const entrypointPath = definition.renderEntrypoint?.assetPath;
	if (!entrypointPath) return { payload: null, problem: 'entrypoint-not-declared' };
	const entrypoint = assetText(findAsset(pkg, entrypointPath));
	if (entrypoint === null) return { payload: null, problem: 'entrypoint-missing' };

	const styleSheets: string[] = [];
	const scripts: WidgetSandboxScript[] = [];

	// The package's own style tokens, plus any per-instance override, as a :root block. Same resolver
	// the non-sandboxed widget surfaces use, so a token means the same thing on both sides.
	const variables = resolveWidgetStyleVariables(definition, configuration ?? null);
	const variableEntries = Object.entries(variables);
	if (variableEntries.length > 0) {
		styleSheets.push(
			[':root {', ...variableEntries.map(([name, value]) => `\t${name}: ${value};`), '}'].join(
				'\n',
			),
		);
	}
	for (const path of definition.style?.stylesheetAssetPaths ?? []) {
		const text = assetText(findAsset(pkg, path));
		if (text !== null) styleSheets.push(text);
	}

	// Asset references are scanned across the WHOLE entrypoint document — a package's stylesheet and
	// module script conventionally sit in its <head> — while the markup that goes into the frame is
	// the <body>, because the frame already has a head, and a policy in it.
	const body = BODY_INNER.exec(entrypoint)?.[1] ?? entrypoint;

	for (const match of entrypoint.matchAll(LINK_TAG)) {
		const tag = match[0];
		if (!/rel\s*=\s*["']stylesheet["']/i.test(tag)) continue;
		const href = HREF_ATTRIBUTE.exec(tag)?.[1];
		if (!href) continue;
		const path = resolveAssetPath(entrypointPath, href);
		if ((definition.style?.stylesheetAssetPaths ?? []).includes(path)) continue;
		const text = assetText(findAsset(pkg, path));
		if (text !== null) styleSheets.push(text);
	}

	for (const match of entrypoint.matchAll(SCRIPT_TAG)) {
		const attributes = match[1] ?? '';
		const inline = match[2] ?? '';
		const src = SRC_ATTRIBUTE.exec(attributes)?.[1];
		const declaredModule = TYPE_MODULE.test(attributes);
		if (src) {
			const code = assetText(findAsset(pkg, resolveAssetPath(entrypointPath, src)));
			if (code !== null) {
				scripts.push({ code, module: declaredModule || ESM_SYNTAX.test(code) });
			}
			continue;
		}
		if (inline.trim() !== '') {
			scripts.push({ code: inline, module: declaredModule || ESM_SYNTAX.test(inline) });
		}
	}

	if (scripts.length === 0) return { payload: null, problem: 'no-code' };

	return {
		payload: {
			html: body.replace(SCRIPT_TAG, '').replace(LINK_TAG, ''),
			css: styleSheets.length > 0 ? styleSheets.join('\n') : null,
			scripts: scripts.map((script) =>
				script.module ? { code: script.code + MODULE_EXPORT_SHIM, module: true } : script,
			),
		},
		problem: null,
	};
}

// --- Theme tokens: forwarded, never inherited --------------------------------------------------------

/**
 * The semantic tokens forwarded into a frame whose package declared the `host-theme-tokens` style
 * capability. An opaque-origin document inherits nothing from the host — no fonts, no cascade, no
 * variables — so a widget that wants to look like the rest of the app has to be handed the values, and
 * a widget that did not ask for them is handed none. The list is deliberately the semantic layer only:
 * a widget gets "the accent colour", never the raw palette it was mixed from.
 */
export const FORWARDED_THEME_TOKENS: readonly string[] = Object.freeze([
	'--color-bg',
	'--color-surface',
	'--color-surface-raised',
	'--color-border',
	'--color-text-primary',
	'--color-text-secondary',
	'--color-text-tertiary',
	'--color-accent',
	'--color-accent-foreground',
	'--color-status-success',
	'--color-status-warning',
	'--color-status-error',
	'--font-sans',
	'--radius-md',
]);

/**
 * Resolve the forwarded tokens through an injected reader, so this stays a pure function and the host
 * is the only thing that touches computed style. An empty value is dropped rather than forwarded as
 * the empty string, which would blank a widget that relied on its own fallback.
 */
export function collectThemeVariables(
	definition: WidgetDefinition,
	read: (token: string) => string,
): Record<string, string> {
	if (!(definition.style?.capabilities ?? []).includes('host-theme-tokens')) return {};
	const variables: Record<string, string> = {};
	for (const token of FORWARDED_THEME_TOKENS) {
		const value = read(token).trim();
		if (value !== '') variables[token] = value;
	}
	return variables;
}

// --- Decisions: every one of them is the core's ------------------------------------------------------

/** The host permissions the DM approved at review. Absent decisions stay denied (fail closed). */
export function approvedHostPermissions(
	record: WidgetPackageRecord | null | undefined,
): WidgetHostPermission[] {
	if (!record || record.trust.state !== 'trusted') return [];
	return (Object.entries(record.trust.hostPermissions) as [WidgetHostPermission, string][])
		.filter(([, decision]) => decision === 'approved')
		.map(([permission]) => permission);
}

export interface PermissionAnswer {
	decision: 'available' | 'undeclared' | 'forbidden' | 'unknown-capability';
	reason: string;
}

/** The host-API capability names a guest may ask for. Anything else is not a capability, it is a typo. */
const KNOWN_CAPABILITIES: readonly WidgetHostCapability[] = [
	'clipboard',
	'network',
	'asset',
	'external-link',
	'source-adapter',
	'filesystem',
	'storage-adapter',
	'ipc',
	'cloud-client',
	'auth-token',
	'platform-bridge',
	'raw-vault-file',
	'hidden-actor-data',
];

/**
 * Answer `requestPermission(kind)` by asking the core. A capability the catalogue does not know is
 * refused outright rather than being resolved as though it were one — an unknown name must never fall
 * through to a permissive branch.
 */
export function decidePermission(
	widgetInstanceId: string,
	capability: string,
	approvedPermissions: readonly WidgetHostPermission[],
): PermissionAnswer {
	if (!KNOWN_CAPABILITIES.includes(capability as WidgetHostCapability)) {
		return {
			decision: 'unknown-capability',
			reason: `The host has no "${capability}" capability to grant.`,
		};
	}
	const result = resolveHostCapability(widgetInstanceId, capability as WidgetHostCapability, {
		approvedPermissions,
	});
	return { decision: result.decision, reason: result.audit.reason };
}

const DESTINATION_CLASSES: readonly WidgetDestinationClass[] = [
	'vault-sync',
	'asset-cdn',
	'widget-declared',
	'analytics',
];

export interface OutboundAnswer {
	decision: WidgetOutboundResult['decision'];
	/** Whether the host actually sent anything. Always false in this build — see the reason. */
	sent: false;
	reason: string;
}

/**
 * Answer `outbound(request)` by running the SEC-011 gate. The destination CLASS is what the policy is
 * written in terms of; a guest that names one gets it checked, and a guest that only has a URL is
 * treated as reaching a destination its own package declared, which is the only class a package can
 * speak for.
 *
 * The host evaluates and audits; it does not transmit. There is no widget network transport in this
 * build, so an allowed request comes back `sent: false` with that said plainly rather than as a
 * silent success the widget would go on to believe.
 */
export function decideOutbound(
	widgetInstanceId: string,
	message: GuestOutbound,
	definition: WidgetDefinition,
	approvedPermissions: readonly WidgetHostPermission[],
): OutboundAnswer {
	const named = message.destinationClass;
	if (named !== null && !DESTINATION_CLASSES.includes(named as WidgetDestinationClass)) {
		return {
			decision: 'denied',
			sent: false,
			reason: `"${named}" is not a destination class the host recognises.`,
		};
	}
	const destinationClass = (named ?? 'widget-declared') as WidgetDestinationClass;
	const holdsNetwork = approvedPermissions.includes('network');
	const result = requestWidgetNetwork(
		{ widgetInstanceId, destinationClass, payload: { url: message.url, body: message.payload } },
		{
			approvedPermissions,
			// A destination class is only in scope once the package declared it AND the network
			// permission itself was approved at review; without the permission nothing is in scope.
			approvedDestinationClasses: holdsNetwork
				? ((definition.networkDestinationClasses ?? []) as readonly WidgetDestinationClass[])
				: [],
			sensitiveDataPolicy: 'block',
		},
	);
	if (result.decision === 'allowed' || result.decision === 'redacted') {
		return {
			decision: result.decision,
			sent: false,
			reason:
				'The request is permitted by policy, but this build has no outbound transport for widgets, so nothing was sent.',
		};
	}
	return { decision: result.decision, sent: false, reason: result.audit.reason };
}

export interface DispatchAnswer {
	accepted: boolean;
	reason: string;
}

/**
 * Answer `dispatch(commandDescriptor)`. The host checks only the one thing it can check without the
 * core: that the widget's own definition DECLARES the command. Everything that matters after that —
 * the operator-vs-manager authority split, visibility, binding, schema, revision — is decided by
 * `widget.dispatch-command` itself, which the surface's command handler routes to.
 */
export function decideDispatch(definition: WidgetDefinition, commandType: string): DispatchAnswer {
	const declared = definition.commands.some((command) => command.type === commandType);
	if (!declared) {
		return {
			accepted: false,
			reason: `This widget does not declare a "${commandType}" command.`,
		};
	}
	return { accepted: true, reason: 'Relayed to the campaign; the core decides whether it runs.' };
}

/** Isolate a frame that crashed or broke policy. The other widgets and the session are untouched. */
export function isolateFrame(
	widgetInstanceId: string,
	siblingInstanceIds: readonly string[],
	reason: 'crashed' | 'host-policy-violation',
): WidgetIsolationResult {
	return isolateWidgetFailure(widgetInstanceId, siblingInstanceIds, reason);
}

/** The frame configuration this host builds, checked against the core baseline before it is used. */
export function auditSandboxFrame(): ReturnType<typeof validateWidgetSandboxDocument> {
	return validateWidgetSandboxDocument({
		sandboxTokens: WIDGET_SANDBOX_ATTRIBUTE.split(' '),
		documentSource: 'served-document',
		contentSecurityPolicy: WIDGET_SANDBOX_CSP,
	});
}
