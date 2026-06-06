import type { WidgetHostPermission } from '../state/widget-package-state';
import { ALL_HOST_PERMISSIONS } from '../state/widget-package-state';
import { containsSensitiveData, redactValue } from '../diagnostics/redaction';

/**
 * SEC-011 — WIDGET HOST NETWORK + EXFILTRATION CONTROLS. The pure, fail-closed Processing-Core policy that
 * constrains what a widget may send OUTBOUND, where it may send it, and what it may treat as canonical
 * state (Architecture Contract 4 Custom Widget Code rules 2/5/8/9; SEC-007 host permissions; Glossary
 * "Widget Package"; audit remediation).
 *
 * It COMPOSES the existing infrastructure rather than inventing a parallel framework:
 *   - the host-permission model (`WidgetHostPermission` / `ALL_HOST_PERMISSIONS`, default DENIED) decides
 *     WHETHER a widget has a network/clipboard/storage permission at all;
 *   - the diagnostics REDACTION guard (`redactValue` / `containsSensitiveData`) decides whether an
 *     otherwise-permitted payload still carries secrets/absolute paths that must be blocked or redacted.
 *
 * The four SEC-011 acceptance criteria, all enforced HERE, fail closed:
 *   1. An outbound payload that smuggles hidden actor data, raw vault content, tokens, diagnostics, or
 *      absolute paths is BLOCKED or REDACTED according to policy ({@link evaluateWidgetOutboundRequest}).
 *   2. A network request to a destination class the widget is NOT approved for is DENIED and AUDITED.
 *   3. Widget-local storage may NOT be the sole source of truth for canonical vault/session data
 *      ({@link evaluateWidgetStateOwnership}).
 *   4. A widget that crashes or violates host policy is ISOLATED; other widgets + core state remain
 *      available ({@link isolateWidgetFailure}).
 *
 * Pure + deterministic over plain data — no DOM/storage/clock/entropy/network. The future widget-host
 * runtime calls these gates BEFORE performing any outbound/storage action; the policy never depends on
 * the runtime never regressing.
 */

// --- AC1 + AC2: outbound request validation ---------------------------------------------------------

/**
 * The destination CLASS a widget network permission is scoped to. A widget's `network` host permission is
 * granted for one or more destination classes; a request to a class outside its grant is denied (AC2). The
 * classes are coarse on purpose — the host permission is a capability, not a per-URL allowlist the widget
 * author controls.
 */
export type WidgetDestinationClass =
	| 'vault-sync' // the configured sync source/cloud endpoint for this vault
	| 'asset-cdn' // the content-addressed asset store
	| 'widget-declared' // a destination the widget package DECLARED and the DM approved at install
	| 'analytics'; // first-party telemetry sink (only when telemetry is approved)

export const WIDGET_DESTINATION_CLASSES: readonly WidgetDestinationClass[] = Object.freeze([
	'vault-sync',
	'asset-cdn',
	'widget-declared',
	'analytics',
] as const);

/** The exfiltration-sensitive classes of data a widget outbound payload must never carry in the clear. */
export type ExfiltrationClass =
	| 'hidden-actor-data' // dm-only / hidden entity content for an actor who may not see it
	| 'raw-vault-content' // raw note/object body the widget was never bound to
	| 'auth-token' // an auth/session/refresh token or credential
	| 'diagnostics' // a diagnostics/support bundle
	| 'absolute-path'; // a raw filesystem absolute path

/** How a widget outbound request is resolved. Fail closed: anything but `allowed` did not leave the host. */
export type WidgetOutboundDecision =
	| 'allowed' // the request is permitted and the payload is clean (or was redacted to clean)
	| 'redacted' // the request is permitted but the payload was scrubbed of sensitive data before send
	| 'blocked' // the payload carried data that policy blocks outright — nothing is sent
	| 'denied'; // the widget lacks network permission, or the destination class is not approved

/** A widget's approved outbound capability: whether it has `network` at all + which destination classes. */
export interface WidgetNetworkGrant {
	/** The host permissions the package was approved for (default DENIED — an absent `network` blocks all). */
	approvedPermissions: readonly WidgetHostPermission[];
	/** The destination classes the widget's network permission is scoped to (empty ⇒ no class approved). */
	approvedDestinationClasses: readonly WidgetDestinationClass[];
	/**
	 * Policy for a payload found to carry sensitive data on an OTHERWISE-permitted request: `block` rejects
	 * the whole request (the default, fail-closed); `redact` scrubs the payload and sends the clean form.
	 * Hidden actor data and raw vault content are ALWAYS blocked regardless of this policy.
	 */
	sensitiveDataPolicy: 'block' | 'redact';
}

export interface WidgetOutboundRequest {
	widgetInstanceId: string;
	/** The destination class the widget is trying to reach. */
	destinationClass: WidgetDestinationClass;
	/** The payload the widget wants to send (arbitrary widget-authored data). */
	payload: unknown;
	/**
	 * Tokens the host KNOWS are hidden-actor-data / raw-vault-content for this actor (e.g. a dm-only note
	 * body the widget should never have, smuggled into the payload). Their presence anywhere in the payload
	 * is always blocked — this is the host's authoritative knowledge of what this actor may not exfiltrate.
	 */
	forbiddenContentTokens?: readonly string[];
}

/** An audited outbound attempt: the structured reason it was denied/blocked/redacted, non-leaking. */
export interface WidgetOutboundAudit {
	widgetInstanceId: string;
	destinationClass: WidgetDestinationClass;
	decision: WidgetOutboundDecision;
	/** Which exfiltration classes were detected in the payload (empty when the request was clean). */
	detectedExfiltration: ExfiltrationClass[];
	/** A coarse, non-leaking reason. Never carries the payload value, a token, or hidden content. */
	reason: string;
}

export interface WidgetOutboundResult {
	decision: WidgetOutboundDecision;
	/** The payload to actually send: the original when `allowed`, the scrubbed form when `redacted`, null otherwise. */
	sentPayload: unknown;
	/** The audit record for the attempt (always produced; persisted by the host for the DM). */
	audit: WidgetOutboundAudit;
}

/** Whether the grant includes a given host permission (default-denied: absent ⇒ false). */
function hasPermission(grant: WidgetNetworkGrant, permission: WidgetHostPermission): boolean {
	return grant.approvedPermissions.includes(permission);
}

/** Scan a payload for forbidden content tokens (hidden actor data / raw vault content the host flagged). */
function payloadCarriesForbiddenContent(
	payload: unknown,
	forbiddenTokens: readonly string[],
): boolean {
	if (forbiddenTokens.length === 0) return false;
	const serialized = JSON.stringify(payload ?? null);
	return forbiddenTokens.some((token) => token.trim().length > 0 && serialized.includes(token));
}

/**
 * SEC-011 AC1 + AC2 — validate a widget's outbound request BEFORE it leaves the host. Fail closed in this
 * order:
 *
 *   1. NO `network` permission ⇒ `denied` (outbound APIs are unavailable; SEC-007).
 *   2. The destination CLASS is not approved for this widget ⇒ `denied` + audited (AC2).
 *   3. The payload smuggles host-flagged hidden actor data / raw vault content ⇒ `blocked` (AC1). This is
 *      ALWAYS a block — never redactable — because the widget should never have had the content at all.
 *   4. The payload carries a token/diagnostics/absolute path ⇒ `block` or `redact` per the grant policy
 *      (AC1). Under `redact`, the scrubbed payload (via the diagnostics redaction guard) is sent and the
 *      decision is `redacted`; under `block` the request is rejected.
 *   5. Otherwise ⇒ `allowed`, original payload sent.
 *
 * Every non-`allowed` outcome (and `redacted`) produces a non-leaking audit record. Pure + deterministic.
 */
export function evaluateWidgetOutboundRequest(
	request: WidgetOutboundRequest,
	grant: WidgetNetworkGrant,
): WidgetOutboundResult {
	const baseAudit = {
		widgetInstanceId: request.widgetInstanceId,
		destinationClass: request.destinationClass,
	} as const;

	// 1. No network permission at all ⇒ denied (outbound unavailable).
	if (!hasPermission(grant, 'network')) {
		return deny(baseAudit, 'Widget has no approved network host permission; outbound requests are unavailable.');
	}

	// 2. Destination class not approved ⇒ denied + audited (AC2).
	if (!grant.approvedDestinationClasses.includes(request.destinationClass)) {
		return deny(
			baseAudit,
			`Destination class "${request.destinationClass}" is outside the widget's approved network permission.`,
		);
	}

	// 3. Host-flagged hidden actor data / raw vault content ⇒ always blocked (AC1, never redactable).
	const forbidden = request.forbiddenContentTokens ?? [];
	if (payloadCarriesForbiddenContent(request.payload, forbidden)) {
		return {
			decision: 'blocked',
			sentPayload: null,
			audit: {
				...baseAudit,
				decision: 'blocked',
				detectedExfiltration: ['hidden-actor-data', 'raw-vault-content'],
				reason: 'Payload carried hidden actor data or raw vault content the widget may not exfiltrate.',
			},
		};
	}

	// 4. Tokens / absolute paths / diagnostics in the payload ⇒ block or redact per grant policy (AC1).
	const detected = detectSensitiveClasses(request.payload);
	if (detected.length > 0) {
		if (grant.sensitiveDataPolicy === 'redact') {
			return {
				decision: 'redacted',
				sentPayload: redactValue(request.payload, false),
				audit: {
					...baseAudit,
					decision: 'redacted',
					detectedExfiltration: detected,
					reason: 'Payload carried tokens/diagnostics/absolute paths; sent the redacted form per policy.',
				},
			};
		}
		return {
			decision: 'blocked',
			sentPayload: null,
			audit: {
				...baseAudit,
				decision: 'blocked',
				detectedExfiltration: detected,
				reason: 'Payload carried tokens/diagnostics/absolute paths and policy blocks sensitive outbound data.',
			},
		};
	}

	// 5. Clean + permitted ⇒ allowed, original payload sent.
	return {
		decision: 'allowed',
		sentPayload: request.payload,
		audit: {
			...baseAudit,
			decision: 'allowed',
			detectedExfiltration: [],
			reason: 'Outbound request permitted; payload carried no exfiltration-sensitive data.',
		},
	};
}

/** Build the `denied` result + audit (no payload sent). */
function deny(
	base: { widgetInstanceId: string; destinationClass: WidgetDestinationClass },
	reason: string,
): WidgetOutboundResult {
	return {
		decision: 'denied',
		sentPayload: null,
		audit: { ...base, decision: 'denied', detectedExfiltration: [], reason },
	};
}

/**
 * Classify which sensitive-data classes a payload carries (AC1). It composes the diagnostics redaction
 * guard for the precise token/path decision, and adds a diagnostics-bundle SHAPE check (a diagnostics
 * bundle is exfiltration-sensitive on its own, even with no embedded token). The classes are precise:
 *
 *   - `absolute-path` when redaction would replace an absolute path (the `[redacted-path]` placeholder);
 *   - `auth-token` when redaction would replace a secret value (the `[redacted]` placeholder, e.g. a
 *     bearer token or a secret-keyed field) — and only then, so a bare path is NOT mislabelled a token;
 *   - `diagnostics` when the payload is shaped like a diagnostics/support bundle.
 *
 * Returns every class that applies (empty ⇒ the payload is clean and may be sent as-is).
 */
function detectSensitiveClasses(payload: unknown): ExfiltrationClass[] {
	const classes: ExfiltrationClass[] = [];
	const serialized = JSON.stringify(payload ?? null);

	if (containsSensitiveData(payload)) {
		// Compare the payload to its redacted form to know WHICH placeholders the guard would insert, so a
		// path is labelled `absolute-path` and a secret value `auth-token` — independently and precisely.
		const redacted = JSON.stringify(redactValue(payload, false));
		if (redacted.includes('[redacted-path]')) classes.push('absolute-path');
		if (redacted.includes('[redacted]')) classes.push('auth-token');
		// A sensitive payload the guard flagged but neither placeholder caught (a bearer token in free text)
		// is still a token leak.
		if (classes.length === 0) classes.push('auth-token');
	}

	// A diagnostics/support bundle is exfiltration-sensitive by SHAPE, regardless of embedded secrets.
	if (/"(diagnostic|diagnostics|supportBundle|support_bundle)"/i.test(serialized)) {
		classes.push('diagnostics');
	}

	return classes;
}

// --- AC3: widget-local storage is not canonical -----------------------------------------------------

/** The declared ownership of a piece of widget state (Contract 4 Widget State Ownership). */
export type WidgetStateOwnership = 'widget-local' | 'scene-local' | 'session-local' | 'entity-owned';

/** A problem found when auditing a widget's persisted state for canonical-data smuggling. */
export interface WidgetStateOwnershipProblem {
	widgetInstanceId: string;
	/** The state key the widget tried to treat as canonical in widget-local storage. */
	stateKey: string;
	kind: 'canonical-in-widget-local';
	message: string;
}

export interface WidgetPersistedStateEntry {
	stateKey: string;
	ownership: WidgetStateOwnership;
	/** True when this key holds data the host considers CANONICAL vault/session truth (must not be widget-local). */
	isCanonical: boolean;
}

/**
 * SEC-011 AC3 — audit a widget's persisted state: a key holding CANONICAL vault/session data declared as
 * `widget-local` storage is a violation — a widget may not use its private storage as the SOLE source of
 * truth for canonical data (Contract 4 rule 5). Returns one problem per offending key (non-leaking: the
 * key name + a generic message, never the value). Pure + deterministic.
 */
export function evaluateWidgetStateOwnership(
	widgetInstanceId: string,
	entries: readonly WidgetPersistedStateEntry[],
): WidgetStateOwnershipProblem[] {
	const problems: WidgetStateOwnershipProblem[] = [];
	for (const entry of entries) {
		if (entry.isCanonical && entry.ownership === 'widget-local') {
			problems.push({
				widgetInstanceId,
				stateKey: entry.stateKey,
				kind: 'canonical-in-widget-local',
				message:
					'Canonical vault/session data must not live solely in widget-local storage; declare it scene-local, session-local, or entity-owned.',
			});
		}
	}
	return problems;
}

// --- AC4: crash / host-policy-violation isolation ---------------------------------------------------

/** Why a widget instance was isolated (crash or host-policy violation). */
export type WidgetIsolationReason = 'crashed' | 'host-policy-violation';

export interface WidgetIsolationResult {
	/** The isolated widget instance (rendered as an isolated error state; not destroyed). */
	isolatedWidgetInstanceId: string;
	reason: WidgetIsolationReason;
	/** The other widget instances that REMAIN available (isolation is scoped to the failing instance). */
	survivingWidgetInstanceIds: string[];
	/** Always true: core app + scene state remain available after isolating one widget. */
	coreStateAvailable: true;
	/** A generic, non-leaking message for the isolated widget's placeholder. */
	message: string;
}

/**
 * SEC-011 AC4 — isolate a crashed / policy-violating widget instance. The failing instance is contained
 * (its failure does NOT propagate); every OTHER widget instance and the core/scene state remain available
 * (Contract 4 rule 9). Returns the surviving instance ids + the affirmation that core state is available.
 * Pure: it computes the post-isolation availability set; the host renders the isolated placeholder.
 */
export function isolateWidgetFailure(
	failingWidgetInstanceId: string,
	allWidgetInstanceIds: readonly string[],
	reason: WidgetIsolationReason,
): WidgetIsolationResult {
	const surviving = allWidgetInstanceIds.filter((id) => id !== failingWidgetInstanceId);
	return {
		isolatedWidgetInstanceId: failingWidgetInstanceId,
		reason,
		survivingWidgetInstanceIds: surviving,
		coreStateAvailable: true,
		message:
			reason === 'crashed'
				? 'This widget failed and was isolated. Other widgets and your session are unaffected.'
				: 'This widget violated host policy and was isolated. Other widgets and your session are unaffected.',
	};
}

/** Re-export the host-permission catalogue so SEC-011 callers reference the single source of truth. */
export { ALL_HOST_PERMISSIONS };
